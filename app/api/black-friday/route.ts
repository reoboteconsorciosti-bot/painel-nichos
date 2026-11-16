import { CAMPAIGN_CLAIM_LOCK_KEY, campaignDelivery, findAvailableCampaignLeads, loadCampaignDestination } from "@/lib/crm-redistribution"
import { pickCheckedLeads, stillAvailable } from "@/lib/crm-eligibility"
import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"
import { getInitialUsers } from "@/lib/server-users"
import { syncCRMConsultants } from "@/lib/crm-members"
import { canViewGlobalLeadCounts } from "@/lib/lead-visibility"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

    const [consultants, available, allocations, crmProblems] = await Promise.all([
      syncCRMConsultants(user),
      countsVisible ? findAvailableCampaignLeads(prisma, campaign.nicho, undefined, user.id).then((leads) => leads.length) : Promise.resolve(null),
      prisma.blackFridayLead.findMany({
        where: { campaignId: campaign.id, ...(user.role === "admin" ? {} : { supervisorId: user.id }) },
        orderBy: { assignedAt: "desc" },
        include: { consultant: { select: { id: true, name: true } }, lead: true },
      }),
      prisma.crmDelivery.findMany({
        where: { idempotencyKey: { startsWith: `black-friday:${campaign.id}:lead:` }, AND: [{ idempotencyKey: { not: { contains: ":refused:" } } }, { idempotencyKey: { not: { contains: ":blocked:" } } }], status: { in: ["failed", "needs_review", "skipped", "sent"] } },
        select: { leadId: true, error: true, warnings: true },
      }),
    ])

    const crmErrors = new Map(crmProblems.map((problem) => [problem.leadId, problem.error ?? (Array.isArray(problem.warnings) ? problem.warnings.join(" ") : null)]))
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
        crmError: crmErrors.get(assignment.leadId) || null,
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

  const body = (await req.json().catch(() => ({}))) as { consultantId?: unknown; quantity?: unknown }
  const consultantId = String(body.consultantId ?? "").trim()
  const quantity = Number(body.quantity)
  if (!consultantId || !Number.isSafeInteger(quantity) || quantity < 1) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 })
  }

  let stage = "load_campaign"
  try {
    const campaign = await getActiveCampaign()
    if (!campaign) return NextResponse.json({ ok: false, error: "campaign_not_active" }, { status: 409 })
    stage = "validate_consultant"
    const allowedConsultants = await syncCRMConsultants(user)
    if (!allowedConsultants.some((consultant) => consultant.id === consultantId)) {
      return NextResponse.json({ ok: false, error: "consultant_outside_team" }, { status: 403 })
    }

    // Antes de reservar: sem saber o destino no CRM, nenhum lead fica preso.
    stage = "load_crm_destination"
    const destination = await loadCampaignDestination()
    if (!destination) return NextResponse.json({ ok: false, error: "crm_unavailable" }, { status: 503 })

    stage = "allocate_leads"
    const consultant = await prisma.consultant.findFirst({
      where: { id: { equals: consultantId, in: allowedConsultants.map((entry) => entry.id) }, ...(user.role === "admin" ? {} : { supervisorId: user.id }) },
      select: { id: true, name: true, supervisorId: true, crmMemberId: true },
    })
    if (!consultant) throw new Error("consultant_outside_team")
    const ownerId = allowedConsultants.find(entry => entry.id === consultant.id)?.crmUserId
    if (!ownerId) throw new Error("consultant_crm_id_missing")

    // O supervisor pede uma quantidade; o sistema pergunta ao CRM quais leads podem ir e continua na fila até completar.
    // Entre perguntar e reservar outro supervisor pode levar um lead, então repete a busca só pelo que faltou.
    const reserved: Array<Awaited<ReturnType<typeof prisma.lead.findMany>>[number]> = []
    const assignedAt = new Date()
    let queuedCount = 0
    for (let attempt = 0; attempt < 3 && reserved.length < quantity; attempt++) {
      const picked = await pickCheckedLeads(prisma, campaign.nicho, quantity - reserved.length, { campaignKey: campaign.nicho, pipelineId: destination.pipelineId, actorId: user.id, ownerId })
      if (picked.leads.length === 0) break
      const batch = await prisma.$transaction(async (tx) => {
        // Serialize campaign allocations with regular list creation so a lead can only be claimed once.
        await tx.$queryRaw<{ locked: boolean }[]>(Prisma.sql`SELECT pg_advisory_xact_lock(${CAMPAIGN_CLAIM_LOCK_KEY}::integer, 1::integer) IS NULL AS locked`)
        const confirmed = await stillAvailable(tx, picked.leads)
        if (confirmed.length === 0) return null
        const leads = await tx.lead.findMany({ where: { id: { in: confirmed.map((lead) => lead.id) } }, orderBy: { id: "asc" } })
        await tx.blackFridayLead.createMany({
          data: leads.map((lead) => ({
            campaignId: campaign.id, leadId: lead.id, supervisorId: consultant.supervisorId, consultantId: consultant.id,
            consultantName: consultant.name, assignedAt, crmStatus: "pending",
          })),
        })
        const { count } = await tx.crmDelivery.createMany({
          data: leads.map(lead => campaignDelivery(lead, campaign, { actorId: user.id, ownerId, ...destination })),
          skipDuplicates: true,
        })
        return { leads, count }
      }, { maxWait: 10_000, timeout: 30_000 })
      if (!batch) continue
      reserved.push(...batch.leads)
      queuedCount += batch.count
    }
    if (reserved.length === 0) throw new Error("no_leads_available")

    await prisma.distributionAudit.create({
      data: {
        action: "BLACK_FRIDAY", requestedById: user.id, requestedByName: user.name, requestedByEmail: user.email || null, requestedByRole: user.role,
        consultantId: consultant.id, consultantCrmId: consultant.crmMemberId, consultantName: consultant.name, niche: campaign.nicho,
        quantity: reserved.length, crmRequested: true, campaignId: campaign.id, campaignName: campaign.name,
      },
    }).catch(() => console.error("[BLACK_FRIDAY] Não foi possível gravar a auditoria da distribuição."))

    return NextResponse.json({
      ok: true,
      consultant,
      leads: reserved,
      requested: quantity,
      crm: { queuedCount },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === "consultant_outside_team") return NextResponse.json({ ok: false, error: message }, { status: 403 })
    if (message === "no_leads_available" || message === "consultant_crm_id_missing") return NextResponse.json({ ok: false, error: message }, { status: 409 })
    console.error(`[BLACK_FRIDAY] Failed to assign campaign leads at ${stage}`, error)
    return NextResponse.json({ ok: false, error: "failed_to_assign_leads" }, { status: 500 })
  }
}
