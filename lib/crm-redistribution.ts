import { campaignPhoneKey } from "@/lib/phone-normalization"

export const REDISTRIBUTION_METHOD = "REDISTRIBUTE"
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

// Mesmos limites do CRM: um texto longo da planilha não pode fazer o lead inteiro ser recusado.
const FALLBACK_LIMITS: Record<string, number> = { city: 100, state: 100, description: 10_000 }

// Só pré-seleciona quando não há dúvida; caso contrário, o usuário escolhe na tela.
export function defaultCrmDestination(pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>) {
  const pipeline = pipelines.find(entry => entry.name.trim().toLowerCase() === "funil de vendas") ?? (pipelines.length === 1 ? pipelines[0] : null)
  const stages = pipeline?.stages.filter(stage => /black/i.test(stage.name)) ?? []
  return { pipelineId: pipeline?.id ?? "", stageId: stages.length === 1 ? stages[0].id : "" }
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
