import type { Prisma } from "@prisma/client"
import { campaignPhoneKey } from "@/lib/phone-normalization"

export const REDISTRIBUTION_METHOD = "REDISTRIBUTE"
export const CAMPAIGN_CLAIM_LOCK_KEY = 1330008644
export const OTHER_TEAM_CODE = "CURRENT_OWNER_OUTSIDE_TEAM"
// Lead de outra equipe volta à distribuição, e este sufixo impede que o mesmo supervisor o receba de novo.
export const otherTeamRefusalKey = (idempotencyKey: string, actorId: string) => `${idempotencyKey}:refused:${actorId}`
export const ALREADY_DISTRIBUTED_CODE = "CONTACT_ALREADY_DISTRIBUTED"
// O CRM recusou este lead sem alterar nada e reenviar não mudaria o resultado: não exige revisão.
export const NOT_TRANSFERABLE_CODES = new Set(["CONTACT_NOT_FOUND", "PHONE_NOT_SEARCHABLE", "PHONE_NOT_CREATABLE", "CONTACT_POSSIBLE_MATCH", "CREATION_LIMIT_REACHED", "DEAL_NOT_FOUND", "CURRENT_OWNER_OUTSIDE_TEAM", "STAGE_REQUIRED_FIELDS"])

export function crmErrorCode(body: unknown): string | null {
  const details = (body as { details?: unknown } | null)?.details
  const code = Array.isArray(details) ? (details[0] as { code?: unknown } | null)?.code : null
  return typeof code === "string" ? code : null
}

// Um telefone distribuído em qualquer edição não volta, mesmo em outro formato.
// Leads sem telefone utilizável também ficam de fora: não há como localizá-los no CRM.
export function pickAvailableCampaignLeads<T extends { phone: string | null }>(candidates: T[], claimedPhones: Array<string | null>, limit = Infinity): T[] {
  const taken = new Set(claimedPhones.map(campaignPhoneKey))
  const picked: T[] = []
  for (const lead of candidates) {
    if (picked.length >= limit) break
    const key = campaignPhoneKey(lead.phone)
    if (!key || taken.has(key)) continue
    taken.add(key)
    picked.push(lead)
  }
  return picked
}

export async function findAvailableCampaignLeads(db: Prisma.TransactionClient, nicho: string, limit?: number, actorId?: string) {
  const refused = actorId ? await db.crmDelivery.findMany({ where: { idempotencyKey: { endsWith: `:refused:${actorId}` } }, select: { leadId: true } }) : []
  const refusedIds = new Set(refused.map((delivery) => delivery.leadId))
  const [candidates, claims] = await Promise.all([
    db.lead.findMany({
      where: { nicho, listaLeads: { none: {} }, blackFridayClaim: { is: null } },
      orderBy: { id: "asc" },
      select: { id: true, phone: true },
    }),
    db.blackFridayLead.findMany({ select: { lead: { select: { phone: true } } } }),
  ])
  return pickAvailableCampaignLeads(candidates.filter((lead) => !refusedIds.has(lead.id)), claims.map((claim) => claim.lead.phone), limit)
}

// Mesmos limites do CRM: um texto longo da planilha não pode fazer o lead inteiro ser recusado.
const FALLBACK_LIMITS: Record<string, number> = { city: 100, state: 100, description: 10_000 }

// O destino da campanha é decidido aqui, nunca pela tela. Na dúvida, não escolhe e nada é enviado.
export function defaultCrmDestination(pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>) {
  const pipeline = pipelines.find(entry => entry.name.trim().toLowerCase() === "funil de vendas") ?? (pipelines.length === 1 ? pipelines[0] : null)
  const exact = pipeline?.stages.find(stage => stage.name.trim().toLowerCase() === "black november")
  const stages = pipeline?.stages.filter(stage => /black/i.test(stage.name)) ?? []
  return { pipelineId: pipeline?.id ?? "", stageId: exact?.id ?? (stages.length === 1 ? stages[0].id : "") }
}

export function buildCrmRedistribution(input: {
  requestId: string
  campaignKey: string
  phone: string | null
  dealId?: string | null
  actorId: string
  ownerId: string
  pipelineId: string
  stageId: string
  reopenLost: boolean
  // Último recurso. O CRM decide se pode criar, sob as próprias travas; o Painel só envia os dados.
  createIfMissing?: { name: string | null; email?: string | null; company?: string | null; city?: string | null; state?: string | null; description?: string | null } | null
}) {
  if (!input.phone?.trim()) throw new Error("campaign_phone_missing")
  const fallback = input.createIfMissing?.name?.trim()
    ? Object.fromEntries(Object.entries(input.createIfMissing).flatMap(([key, value]) => value?.trim() ? [[key, value.trim().slice(0, FALLBACK_LIMITS[key] ?? 200).trim()]] : []))
    : null
  return {
    method: REDISTRIBUTION_METHOD,
    crmDealId: input.dealId ?? null,
    payload: {
      requestId: input.requestId,
      campaignKey: input.campaignKey,
      actorId: input.actorId,
      ownerId: input.ownerId,
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      reopenLost: input.reopenLost,
      phone: input.phone.trim(),
      ...(input.dealId ? { dealId: input.dealId } : {}),
      ...(fallback ? { createIfMissing: true, fallback } : {}),
    },
  }
}

export async function loadCampaignDestination() {
  const base = process.env.CRM_API_URL?.trim().replace(/\/+$/, "")
  const key = process.env.CRM_API_KEY?.trim()
  if (!base || !key) return null
  try {
    const response = await fetch(`${base}/api/v1/painel-nichos/stages`, {
      headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(12_000),
    })
    const result = await response.json()
    if (!response.ok || !result.success || !Array.isArray(result.data?.pipelines)) return null
    const destination = defaultCrmDestination(result.data.pipelines)
    return destination.pipelineId && destination.stageId ? destination : null
  } catch {
    return null
  }
}

type CampaignLead = { id: number; phone: string | null; name: string | null; email: string | null; company: string | null; fantasy: string | null; city: string | null; state: string | null; dealDescription: string | null; crmDealId: string | null }

// Regras fixas da campanha: reabre perdidos e, em último caso, o CRM pode criar sob as próprias travas.
export function campaignDelivery(lead: CampaignLead, campaign: { id: number; nicho: string }, target: { actorId: string; ownerId: string; pipelineId: string; stageId: string }) {
  const requestId = `black-friday:${campaign.id}:lead:${lead.id}`
  return {
    leadId: lead.id, consultantCrmId: target.ownerId, idempotencyKey: requestId,
    ...buildCrmRedistribution({ requestId, campaignKey: campaign.nicho, phone: lead.phone, dealId: lead.crmDealId, ...target, reopenLost: true,
      createIfMissing: { name: lead.name, email: lead.email, company: lead.company || lead.fantasy, city: lead.city, state: lead.state, description: lead.dealDescription } }),
  }
}

// Requisições antigas de campanha não podem criar contatos/negócios depois
// da mudança para redistribuir os registros que já existem no CRM.
export function isLegacyCampaignDelivery(job: { method: string; idempotencyKey: string; payload: unknown }) {
  if (job.method === REDISTRIBUTION_METHOD) return false
  if (job.idempotencyKey.startsWith("black-friday:")) return true
  if (!job.idempotencyKey.startsWith("import:") || !job.payload || typeof job.payload !== "object") return false
  const payload = job.payload as Record<string, unknown>
  const sources = [payload.source, (payload.contact as Record<string, unknown> | undefined)?.source]
  if (Array.isArray(payload.contacts)) {
    for (const contact of payload.contacts) if (contact && typeof contact === "object") sources.push(contact.source)
  }
  return sources.some(source => typeof source === "string" && /black[\s_-]*friday/i.test(source))
}
