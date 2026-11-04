import { buildCrmDelivery } from "@/lib/crm-delivery-payload"
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

  if (!consultantId || !Number.isSafeInteger(quantity) || quantity < 1) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 })
  }

  let stage = "load_campaign"
  try {
    const campaign = await getActiveCampaign()
    if (!campaign) return NextResponse.json({ ok: false, error: "campaign_not_active" }, { status: 409 })
    stage = "validate_consultant"
    const allowedConsultants = sendCRM
      ? await syncCRMConsultants(user)
      : (await prisma.consultant.findMany({
        where: user.role === "admin" ? {} : { supervisorId: user.id },
        select: { id: true, name: true, supervisorId: true, crmMemberId: true },
      })).map((consultant) => ({ ...consultant, crmUserId: consultant.crmMemberId ?? "", teamId: null, teamName: "", supervisorName: "" }))
    if (!allowedConsultants.some((consultant) => consultant.id === consultantId)) {
      return NextResponse.json({ ok: false, error: "consultant_outside_team" }, { status: 403 })
    }

    stage = "allocate_leads"
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

      if (sendCRM) {
        const ownerId = allowedConsultants.find(entry => entry.id === consultant.id)?.crmUserId
        if (!ownerId) throw new Error("consultant_crm_id_missing")
        const deliveries = leads.map(lead => {
          const description = lead.crmDealId ? lead.dealDescription : [
            'Campanha: ' + campaign.name,
            'Consultor: ' + consultant.name,
            'Supervisor: ' + user.name,
            'Liberado em: ' + assignedAt.toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' }),
            lead.dealDescription,
          ].filter(Boolean).join('\n')
          const delivery = buildCrmDelivery({ ...lead, dealDescription: description }, campaign.nicho, ownerId)
          return delivery ? { leadId: lead.id, consultantCrmId: ownerId, idempotencyKey: `black-friday:${campaign.id}:lead:${lead.id}`, ...delivery } : null
        }).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        if (deliveries.length) await tx.crmDelivery.createMany({ data: deliveries, skipDuplicates: true })
      }
      return { consultant, leads, assignedAt }
    })

    stage = sendCRM ? "count_crm_queue" : "complete_assignment"
    const crmResult = sendCRM ? {
      configured: !!(process.env.CRM_API_URL?.trim() && process.env.CRM_API_KEY?.trim()),
      queuedCount: await prisma.crmDelivery.count({ where: { leadId: { in: created.leads.map(lead => lead.id) }, status: { in: ['pending', 'sending'] } } }),
      createdCount: 0,
      ignoredCount: 0,
      warnings: [],
    } : null

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
    console.error(`[BLACK_FRIDAY] Failed to assign campaign leads at ${stage}`, error)
    return NextResponse.json({ ok: false, error: "failed_to_assign_leads" }, { status: 500 })
  }
}
