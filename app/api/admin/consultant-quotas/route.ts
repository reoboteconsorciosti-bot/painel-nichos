import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { getAuthenticatedUser } from "@/lib/auth"
import { syncCRMConsultants } from "@/lib/crm-members"
import { ensureMonthlyUsage, getCurrentMonthStart, getMonthlyQuotaRows } from "@/lib/consultant-quotas"
import { getSupervisorCountVisibility, setSupervisorCountVisibility } from "@/lib/lead-visibility"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isOwner(user: Awaited<ReturnType<typeof getAuthenticatedUser>>) {
  return user?.role === "admin" && user.isOwner
}

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  if (!isOwner(user)) return NextResponse.json({ ok: false, error: "owner_only" }, { status: 403 })

  try {
    const consultants = await syncCRMConsultants(user)
    const ids = consultants.map((consultant) => consultant.crmUserId)
    const legacyIndexes = new Map(ids.map((id, index) => [id, index + 1]))
    const usageById = await getMonthlyQuotaRows(ids, legacyIndexes)
    const supervisorsCanSeeCounts = await getSupervisorCountVisibility()

    return NextResponse.json({
      ok: true,
      monthStart: getCurrentMonthStart().toISOString(),
      supervisorsCanSeeCounts,
      consultants: consultants.map((consultant) => ({
        crmUserId: consultant.crmUserId,
        name: consultant.name,
        supervisorId: consultant.supervisorId,
        supervisorName: consultant.supervisorName,
        teamId: consultant.teamId,
        teamName: consultant.teamName,
        ...(usageById.get(consultant.crmUserId) ?? { used: 0, monthlyLimit: 300 }),
      })),
    })
  } catch (error) {
    console.error("[CONSULTANT_QUOTAS] Failed to load", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ ok: false, error: "crm_members_unavailable" }, { status: 502 })
  }
}

type UpdateBody = {
  crmUserId?: unknown
  monthlyLimit?: unknown
  resetUsage?: unknown
  supervisorsCanSeeCounts?: unknown
}

export async function PATCH(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  if (!isOwner(user)) return NextResponse.json({ ok: false, error: "owner_only" }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as UpdateBody
  if (typeof body.supervisorsCanSeeCounts === "boolean" && !body.crmUserId) {
    await setSupervisorCountVisibility(body.supervisorsCanSeeCounts)
    return NextResponse.json({ ok: true, supervisorsCanSeeCounts: body.supervisorsCanSeeCounts })
  }

  const crmUserId = String(body.crmUserId ?? "").trim()
  const hasLimit = body.monthlyLimit !== undefined
  const resetUsage = body.resetUsage === true
  const monthlyLimit = Number(body.monthlyLimit)
  if (!crmUserId || (!hasLimit && !resetUsage) || (hasLimit && (!Number.isSafeInteger(monthlyLimit) || monthlyLimit < 1 || monthlyLimit > 10000))) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 })
  }

  try {
    const consultants = await syncCRMConsultants(user)
    const consultantIndex = consultants.findIndex((consultant) => consultant.crmUserId === crmUserId)
    if (consultantIndex < 0) return NextResponse.json({ ok: false, error: "consultant_not_found" }, { status: 404 })

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(1330008644, 1)`)
      if (hasLimit) {
        await tx.consultantQuota.upsert({
          where: { crmUserId },
          create: { crmUserId, monthlyLimit },
          update: { monthlyLimit },
        })
      }
      let usage = await ensureMonthlyUsage(tx, crmUserId, consultantIndex + 1, getCurrentMonthStart())
      if (resetUsage) {
        usage = await tx.consultantMonthlyUsage.update({ where: { id: usage.id }, data: { used: 0 } })
      }
      const quota = await tx.consultantQuota.findUnique({ where: { crmUserId } })
      return { used: usage.used, monthlyLimit: quota?.monthlyLimit ?? 300 }
    })

    return NextResponse.json({ ok: true, crmUserId, ...result })
  } catch (error) {
    console.error("[CONSULTANT_QUOTAS] Failed to update", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ ok: false, error: "failed_to_update_quota" }, { status: 500 })
  }
}
