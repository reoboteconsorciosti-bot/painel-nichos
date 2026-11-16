import type { Prisma } from "@prisma/client"
import { blockedUntil, blockKey, findAvailableCampaignLeads, pickAvailableCampaignLeads } from "@/lib/crm-redistribution"

// O Painel pergunta ao CRM "este telefone pode ir para um consultor?" antes de reservar o lead.
// Quem decide é o CRM; se a pergunta falhar, o Painel segue como antes e a gravação no CRM continua sendo a palavra final.
const CHECK_BATCH = 200
const MAX_SCAN = 3000
const DEADLINE_MS = 40_000
const CHECK_METHOD = "ELIGIBILITY_CHECK"

type Answer = { index: number; free: boolean; code?: string; reason?: string; retryAfter?: string | null }
type Candidate = { id: number; phone: string | null }

export async function askCrmEligibility(phones: string[], campaignKey: string, pipelineId: string): Promise<Answer[] | null> {
  const base = process.env.CRM_API_URL?.trim().replace(/\/+$/, "")
  const key = process.env.CRM_API_KEY?.trim()
  if (!base || !key || phones.length === 0) return null
  try {
    const response = await fetch(`${base}/api/v1/painel-nichos/eligibility`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ campaignKey, pipelineId, phones }), cache: "no-store", signal: AbortSignal.timeout(25_000),
    })
    const result = await response.json().catch(() => null)
    const answers = result?.data?.results
    if (!response.ok || !result?.success || !Array.isArray(answers) || answers.length !== phones.length) return null
    return answers as Answer[]
  } catch {
    return null
  }
}

/**
 * Entrega exatamente a quantidade pedida quando existir: pergunta ao CRM em lotes, guarda os bloqueados
 * (com a data em que voltam a valer a pergunta) e segue para o próximo da fila até completar.
 */
export async function pickCheckedLeads(
  db: Prisma.TransactionClient,
  nicho: string,
  quantity: number,
  ctx: { campaignKey: string; pipelineId: string; actorId: string; ownerId: string },
) {
  const deadline = Date.now() + DEADLINE_MS
  const pool: Candidate[] = await findAvailableCampaignLeads(db, nicho, MAX_SCAN, ctx.actorId)
  const picked: Candidate[] = []
  let cursor = 0; let blocked = 0; let unchecked = false
  while (picked.length < quantity && cursor < pool.length) {
    const remaining = quantity - picked.length
    const slice = pool.slice(cursor, cursor + Math.min(CHECK_BATCH, Math.max(10, remaining * 2)))
    const answers = Date.now() < deadline ? await askCrmEligibility(slice.map(lead => lead.phone ?? ""), ctx.campaignKey, ctx.pipelineId) : null
    if (!answers) {
      // Sem resposta do CRM: o restante entra sem pré-checagem e a gravação recusa o que não puder.
      unchecked = true
      picked.push(...pool.slice(cursor, cursor + remaining))
      break
    }
    cursor += slice.length
    const now = Date.now()
    const rows: Prisma.CrmDeliveryCreateManyInput[] = []
    slice.forEach((lead, position) => {
      const answer = answers.find(entry => entry.index === position)
      if (answer?.free) { if (picked.length < quantity) picked.push(lead); return }
      blocked++
      rows.push({
        leadId: lead.id, consultantCrmId: ctx.ownerId, method: CHECK_METHOD, status: "skipped", error: answer?.reason ?? "O CRM não liberou este lead.",
        payload: { code: answer?.code ?? null, retryAfter: answer?.retryAfter ?? null }, nextAttemptAt: blockedUntil(answer ? answer.retryAfter : undefined, now),
        idempotencyKey: blockKey(lead.id, now),
      })
    })
    if (rows.length) await db.crmDelivery.createMany({ data: rows, skipDuplicates: true }).catch(() => console.error("[CRM] Não foi possível guardar os leads bloqueados."))
  }
  return { leads: picked, blocked, unchecked }
}

// Entre perguntar e reservar, outro supervisor pode ter levado o lead: confere dentro da trava antes de reservar.
export async function stillAvailable(tx: Prisma.TransactionClient, leads: Candidate[]) {
  if (leads.length === 0) return []
  const [free, claims] = await Promise.all([
    tx.lead.findMany({ where: { id: { in: leads.map(lead => lead.id) }, listaLeads: { none: {} }, blackFridayClaim: { is: null } }, orderBy: { id: "asc" }, select: { id: true, phone: true } }),
    tx.blackFridayLead.findMany({ select: { lead: { select: { phone: true } } } }),
  ])
  const order = new Map(leads.map((lead, position) => [lead.id, position]))
  return pickAvailableCampaignLeads(free.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)), claims.map(claim => claim.lead.phone))
}
