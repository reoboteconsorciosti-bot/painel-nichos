import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"
import { getInitialUsers } from "@/lib/server-users"
import { syncCRMConsultants } from "@/lib/crm-members"
import { canViewGlobalLeadCounts } from "@/lib/lead-visibility"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CLAIM_LOCK_KEY = 1330008644

async function getActiveCampaign() {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return prisma.blackFridayCampaign.findFirst({
    where: { isActive: true, startsAt: { lte: today }, endsAt: { gte: today } },
    orderBy: { year: "desc" },
  })
}

function noAccess() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
}

function toCRMPhone(phone: string | null): string | undefined {
  const value = String(phone ?? "").trim()
  return value || undefined
}

async function sendToCRM(
  leads: Array<{ id: number; name: string | null; phone: string | null; city: string | null; state: string | null; company: string | null; fantasy: string | null }>,
  details: { campaignName: string; consultantName: string; supervisorName: string; assignedAt: Date; ownerId: string | null },
) {
  const crmUrl = (process.env.CRM_API_URL ?? "").trim().replace(/\/+$/, "")
  const crmKey = (process.env.CRM_API_KEY ?? "").trim()
  if (!crmUrl || !crmKey) return { configured: false, createdCount: 0, ignoredCount: 0, warnings: ["CRM_NOT_CONFIGURED"] }

  let createdCount = 0
  let ignoredCount = 0
  const warnings: string[] = []
  const source = `Painel Nichos - ${details.campaignName}`
  const releasedAt = details.assignedAt.toLocaleString("pt-BR", { timeZone: "America/Cuiaba" })
  let nextLeadIndex = 0

  const createDeals = async () => {
    while (nextLeadIndex < leads.length) {
      const lead = leads[nextLeadIndex++]
      if (!lead?.name) {
        ignoredCount += 1
        warnings.push(`Lead ${lead?.id ?? "sem id"}: nome ausente; negócio não criado.`)
        continue
      }

      const contact = {
        name: lead.name,
        ...(toCRMPhone(lead.phone) ? { phone: toCRMPhone(lead.phone), whatsapp: toCRMPhone(lead.phone) } : {}),
        ...(lead.city ? { city: lead.city } : {}),
        ...(lead.state ? { state: lead.state } : {}),
        ...(lead.company || lead.fantasy ? { company: lead.company || lead.fantasy || undefined } : {}),
        source,
        ...(details.ownerId ? { ownerId: details.ownerId } : {}),
      }
      const description = [
        `Campanha: ${details.campaignName}`,
        `Consultor: ${details.consultantName}`,
        `Supervisor: ${details.supervisorName}`,
        `Liberado em: ${releasedAt}`,
      ].join("\n")

      try {
        const response = await fetch(`${crmUrl}/api/v1/deals`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${crmKey}` },
          body: JSON.stringify({ contact, description, source, ...(details.ownerId ? { ownerId: details.ownerId } : {}) }),
          signal: AbortSignal.timeout(20_000),
        })
        const data = (await response.json().catch(() => null)) as any
        if (!response.ok || data?.success !== true || !data?.data?.id) {
          ignoredCount += 1
          warnings.push(`Lead ${lead.id}: ${data?.error || `CRM_HTTP_${response.status}`}`)
          if (Array.isArray(data?.data?.warnings)) warnings.push(...data.data.warnings.map(String))
          continue
        }

        createdCount += 1
        if (Array.isArray(data.data.warnings)) warnings.push(...data.data.warnings.map(String))
      } catch (error) {
        ignoredCount += 1
        warnings.push(`Lead ${lead.id}: ${error instanceof Error && error.name === "TimeoutError" ? "CRM_TIMEOUT" : "CRM_CONNECTION_FAILED"}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(8, leads.length) }, () => createDeals()))
  return { configured: true, createdCount, ignoredCount, warnings: [...new Set(warnings)].slice(0, 50) }
}

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return noAccess()

  try {
    const countsVisible = await canViewGlobalLeadCounts(user)
    const campaign = await getActiveCampaign()
    if (!campaign) return NextResponse.json({ ok: true, campaign: null, consultants: [], allocations: [], available: countsVisible ? 0 : null, countsVisible })

    const [consultants, available, allocations] = await Promise.all([
      syncCRMConsultants(user),
      countsVisible ? prisma.lead.count({
        where: { nicho: campaign.nicho, listaLeads: { none: {} }, blackFridayClaim: { is: null } },
      }) : Promise.resolve(null),
      prisma.blackFridayLead.findMany({
        where: { campaignId: campaign.id, ...(user.role === "admin" ? {} : { supervisorId: user.id }) },
        orderBy: { assignedAt: "desc" },
        include: { consultant: { select: { id: true, name: true } }, lead: true },
      }),
    ])

    const hiddenUserNames = new Set(getInitialUsers().map((entry) => entry.name.trim().toLowerCase()).filter(Boolean))
    return NextResponse.json({
      ok: true,
      campaign: { id: campaign.id, year: campaign.year, name: campaign.name, endsAt: campaign.endsAt },
      consultants: consultants.filter((consultant) => !hiddenUserNames.has(consultant.name.trim().toLowerCase())),
      available,
      countsVisible,
      allocations: allocations.map(({ lead, consultant, ...assignment }) => ({
        ...assignment,
        consultant: consultant ?? { id: assignment.consultantId ?? "removed", name: assignment.consultantName },
        lead,
      })),
    })
  } catch (error) {
    console.error("[BLACK_FRIDAY] Failed to load campaign", error)
    return NextResponse.json({ ok: false, error: "failed_to_load_campaign" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return noAccess()

  const body = (await req.json().catch(() => ({}))) as {
    consultantId?: unknown
    quantity?: unknown
    sendToCrm?: unknown
    crmOwnerId?: unknown
  }
  const consultantId = String(body.consultantId ?? "").trim()
  const quantity = Number(body.quantity)
  const sendCRM = body.sendToCrm === true
  const crmOwnerId = body.crmOwnerId ? String(body.crmOwnerId).trim() : null

  if (!consultantId || !Number.isSafeInteger(quantity) || quantity < 1) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 })
  }

  try {
    const campaign = await getActiveCampaign()
    if (!campaign) return NextResponse.json({ ok: false, error: "campaign_not_active" }, { status: 409 })
    const allowedConsultants = await syncCRMConsultants(user)
    if (!allowedConsultants.some((consultant) => consultant.id === consultantId)) {
      return NextResponse.json({ ok: false, error: "consultant_outside_team" }, { status: 403 })
    }

    const created = await prisma.$transaction(async (tx) => {
      // Serialize campaign allocations with regular list creation so a lead can only be claimed once.
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${CLAIM_LOCK_KEY}, 1)`)

      const consultant = await tx.consultant.findFirst({
        where: { id: { equals: consultantId, in: allowedConsultants.map((entry) => entry.id) }, ...(user.role === "admin" ? {} : { supervisorId: user.id }) },
        select: { id: true, name: true, supervisorId: true },
      })
      if (!consultant) throw new Error("consultant_outside_team")

      const leads = await tx.lead.findMany({
        where: {
          nicho: campaign.nicho,
          listaLeads: { none: {} },
          blackFridayClaim: { is: null },
        },
        orderBy: { id: "asc" },
        take: quantity,
      })
      if (leads.length === 0) throw new Error("no_leads_available")

      const assignedAt = new Date()

      await tx.blackFridayLead.createMany({
        data: leads.map((lead) => ({
          campaignId: campaign.id,
          leadId: lead.id,
          supervisorId: consultant.supervisorId,
          consultantId: consultant.id,
          consultantName: consultant.name,
          assignedAt,
          crmStatus: sendCRM ? "pending" : "not_requested",
        })),
      })

      return { consultant, leads, assignedAt }
    })

    let crmResult: Awaited<ReturnType<typeof sendToCRM>> | null = null
    if (sendCRM) {
      try {
        crmResult = await sendToCRM(created.leads, {
          campaignName: campaign.name,
          consultantName: created.consultant.name,
          supervisorName: user.name,
          assignedAt: created.assignedAt,
          ownerId: crmOwnerId,
        })
        await prisma.blackFridayLead.updateMany({
          where: { leadId: { in: created.leads.map((lead) => lead.id) } },
          data: { crmStatus: !crmResult.configured || crmResult.createdCount === 0 ? "error" : crmResult.ignoredCount > 0 || crmResult.warnings.length > 0 ? "partial" : "sent" },
        })
      } catch (error) {
        console.error("[BLACK_FRIDAY] CRM delivery failed", error)
        crmResult = { configured: true, createdCount: 0, ignoredCount: created.leads.length, warnings: ["CRM_SEND_FAILED"] }
        await prisma.blackFridayLead.updateMany({
          where: { leadId: { in: created.leads.map((lead) => lead.id) } },
          data: { crmStatus: "error" },
        })
      }
    }

    return NextResponse.json({
      ok: true,
      consultant: created.consultant,
      leads: created.leads,
      crm: crmResult,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === "consultant_outside_team") return NextResponse.json({ ok: false, error: message }, { status: 403 })
    if (message === "no_leads_available") return NextResponse.json({ ok: false, error: message }, { status: 409 })
    console.error("[BLACK_FRIDAY] Failed to assign campaign leads", error)
    return NextResponse.json({ ok: false, error: "failed_to_assign_leads" }, { status: 500 })
  }
}
