import { buildCrmRedistribution, pickAvailableCampaignLeads } from "@/lib/crm-redistribution"
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

async function findAvailableCampaignLeads(db: Prisma.TransactionClient, nicho: string, limit?: number) {
  const [candidates, claims] = await Promise.all([
    db.lead.findMany({
      where: { nicho, listaLeads: { none: {} }, blackFridayClaim: { is: null } },
      orderBy: { id: "asc" },
      select: { id: true, phone: true },
    }),
    db.blackFridayLead.findMany({ select: { lead: { select: { phone: true } } } }),
  ])
  return pickAvailableCampaignLeads(candidates, claims.map((claim) => claim.lead.phone), limit)
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

    const [consultants, available, allocations, crmProblems] = await Promise.all([
      syncCRMConsultants(user),
      countsVisible ? findAvailableCampaignLeads(prisma, campaign.nicho).then((leads) => leads.length) : Promise.resolve(null),
      prisma.blackFridayLead.findMany({
        where: { campaignId: campaign.id, ...(user.role === "admin" ? {} : { supervisorId: user.id }) },
        orderBy: { assignedAt: "desc" },
        include: { consultant: { select: { id: true, name: true } }, lead: true },
      }),
      prisma.crmDelivery.findMany({
        where: { idempotencyKey: { startsWith: `black-friday:${campaign.id}:lead:` }, status: { in: ["failed", "needs_review", "skipped"] } },
        select: { leadId: true, error: true },
      }),
    ])

    const crmErrors = new Map(crmProblems.map((problem) => [problem.leadId, problem.error]))
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
        crmError: crmErrors.get(assignment.leadId) ?? null,
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
    pipelineId?: unknown
    stageId?: unknown
    reopenLost?: unknown
  }
  const consultantId = String(body.consultantId ?? "").trim()
  const quantity = Number(body.quantity)
  const sendCRM = body.sendToCrm === true
  const pipelineId = typeof body.pipelineId === "string" ? body.pipelineId.trim() : ""
  const stageId = typeof body.stageId === "string" ? body.stageId.trim() : ""
  if (sendCRM && process.env.CRM_EXISTING_DEALS_ENABLED !== "true") {
    return NextResponse.json({ ok: false, error: "A redistribuição de negócios existentes no CRM ainda não está habilitada. Você pode liberar os leads apenas no Painel." }, { status: 409 })
  }
  if (sendCRM && (!pipelineId || !stageId || pipelineId.length > 100 || stageId.length > 100)) {
    return NextResponse.json({ ok: false, error: "Escolha o funil e a etapa de destino no CRM." }, { status: 400 })
  }

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
      await tx.$queryRaw<{ locked: boolean }[]>(Prisma.sql`SELECT pg_advisory_xact_lock(${CLAIM_LOCK_KEY}::integer, 1::integer) IS NULL AS locked`)

      const consultant = await tx.consultant.findFirst({
        where: { id: { equals: consultantId, in: allowedConsultants.map((entry) => entry.id) }, ...(user.role === "admin" ? {} : { supervisorId: user.id }) },
        select: { id: true, name: true, supervisorId: true, crmMemberId: true },
      })
      if (!consultant) throw new Error("consultant_outside_team")

      const available = await findAvailableCampaignLeads(tx, campaign.nicho, quantity)
      if (available.length === 0) throw new Error("no_leads_available")
      const leads = await tx.lead.findMany({ where: { id: { in: available.map((lead) => lead.id) } }, orderBy: { id: "asc" } })

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

      let queuedCount = 0
      if (sendCRM) {
        const ownerId = allowedConsultants.find(entry => entry.id === consultant.id)?.crmUserId
        if (!ownerId) throw new Error("consultant_crm_id_missing")
        const deliveries = leads.map(lead => {
          const requestId = `black-friday:${campaign.id}:lead:${lead.id}`
          return {
            leadId: lead.id, consultantCrmId: ownerId, idempotencyKey: requestId,
            ...buildCrmRedistribution({ requestId, campaignKey: campaign.nicho, phone: lead.phone, dealId: lead.crmDealId,
              actorId: user.id, ownerId, pipelineId, stageId, reopenLost: body.reopenLost === true }),
          }
        })
        if (deliveries.length) queuedCount = (await tx.crmDelivery.createMany({ data: deliveries, skipDuplicates: true })).count
      }
      await tx.distributionAudit.create({
        data: {
          action: "BLACK_FRIDAY",
          requestedById: user.id,
          requestedByName: user.name,
          requestedByEmail: user.email || null,
          requestedByRole: user.role,
          consultantId: consultant.id,
          consultantCrmId: consultant.crmMemberId,
          consultantName: consultant.name,
          niche: campaign.nicho,
          quantity: leads.length,
          crmRequested: sendCRM,
          campaignId: campaign.id,
          campaignName: campaign.name,
        },
      })
      return { consultant, leads, assignedAt, queuedCount }
    })

    stage = sendCRM ? "count_crm_queue" : "complete_assignment"
    const crmResult = sendCRM ? {
      configured: !!(process.env.CRM_API_URL?.trim() && process.env.CRM_API_KEY?.trim()),
      queuedCount: created.queuedCount,
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
