import { campaignPhoneKey } from "@/lib/phone-normalization"

export const REDISTRIBUTION_METHOD = "REDISTRIBUTE"
export const ALREADY_DISTRIBUTED_CODE = "CONTACT_ALREADY_DISTRIBUTED"

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
}) {
  if (!input.phone?.trim()) throw new Error("campaign_phone_missing")
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
    },
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
