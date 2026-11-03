import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { syncCRMConsultants } from "@/lib/crm-members"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  try {
    const consultants = user.role === "admin" ? null : await syncCRMConsultants(user)
    const where = consultants === null ? {} : { consultantCrmId: { in: consultants.map(c => c.crmUserId ?? "") } }
    const groups = await prisma.crmDelivery.groupBy({ by: ["status"], where, _count: true })
    const problems = await prisma.crmDelivery.findMany({ where: { ...where, status: { in: ["failed", "needs_review"] } }, select: { id: true, listaId: true, error: true, status: true }, orderBy: { id: "desc" }, take: 5 })
    const warnings = await prisma.crmDelivery.findMany({ where: { ...where, status: "sent", NOT: { warnings: { equals: [] } } }, select: { id: true, listaId: true, warnings: true }, orderBy: { id: "desc" }, take: 5 })
    return NextResponse.json({ ok: true, counts: Object.fromEntries(groups.map(g => [g.status, g._count])), problems, warnings }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ ok: false, error: "Não foi possível consultar os envios ao CRM." }, { status: 503 })
  }
}
