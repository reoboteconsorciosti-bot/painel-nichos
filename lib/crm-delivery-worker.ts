import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeCrmPayloadPhones, retryDelay } from "@/lib/crm-delivery-payload"
import { ALREADY_DISTRIBUTED_CODE, crmErrorCode, isLegacyCampaignDelivery, REDISTRIBUTION_METHOD } from "@/lib/crm-redistribution"

// One request per 2.2 seconds globally across replicas. Jobs survive deploys.
export async function processNextCrmDelivery() {
  const base = process.env.CRM_API_URL?.trim().replace(/\/+$/, "")
  const key = process.env.CRM_API_KEY?.trim()
  if (!base || !key) return
  const job = await prisma.$transaction(async tx => {
    const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`SELECT pg_try_advisory_xact_lock(1330008644, 3) AS locked`)
    if (!lock?.locked) return null
    // A previous process may have died after the CRM accepted a request. Never replay it blindly.
    await tx.crmDelivery.updateMany({ where: { status: "sending", attemptedAt: { lt: new Date(Date.now() - 120_000) } }, data: { status: "needs_review", error: "Envio interrompido. Confira no CRM antes de reenviar para evitar duplicação." } })
    const last = await tx.crmDelivery.findFirst({ where: { attemptedAt: { not: null } }, orderBy: { attemptedAt: "desc" } })
    if (last?.attemptedAt && last.attemptedAt.getTime() > Date.now() - 2200) return null
    const next = await tx.crmDelivery.findFirst({ where: { status: "pending", nextAttemptAt: { lte: new Date() } }, orderBy: { id: "asc" } })
    if (!next) return null
    const contactsBatch = next.method === "CONTACTS_BULK"
    // A 429 pauses jobs for the same CRM endpoint. Other endpoint limits remain independent.
    const paused = await tx.crmDelivery.findFirst({
      where: {
        status: "pending",
        method: contactsBatch ? "CONTACTS_BULK" : { in: ["POST", "PATCH", REDISTRIBUTION_METHOD] },
        nextAttemptAt: { gt: new Date() },
      },
    })
    if (paused) return null
    const requestLimit = contactsBatch ? 10 : 30
    const recentRequests = await tx.crmDelivery.findMany({
      where: {
        method: contactsBatch ? "CONTACTS_BULK" : { in: ["POST", "PATCH", REDISTRIBUTION_METHOD] },
        attemptedAt: { gte: new Date(Date.now() - 60_000) },
      },
      orderBy: { attemptedAt: "desc" },
      take: requestLimit,
      select: { attemptedAt: true },
    })
    if (recentRequests.length >= requestLimit) {
      const oldestRequest = recentRequests[requestLimit - 1]?.attemptedAt
      if (oldestRequest) {
        await tx.crmDelivery.update({ where: { id: next.id }, data: { nextAttemptAt: new Date(oldestRequest.getTime() + 60_100) } })
      }
      return null
    }
    return tx.crmDelivery.update({ where: { id: next.id }, data: { status: "sending", attemptedAt: new Date(), error: null } })
  })
  if (!job) return
  const redistribute = job.method === REDISTRIBUTION_METHOD
  if (isLegacyCampaignDelivery(job) || (redistribute && process.env.CRM_EXISTING_DEALS_ENABLED !== "true")) {
    await prisma.crmDelivery.update({ where: { id: job.id }, data: {
      status: "needs_review",
      error: "Envio de campanha suspenso: esta ação precisa redistribuir um negócio existente no CRM. Confira a configuração antes de confirmar o envio.",
    } })
    if (job.listaId === null && job.leadId !== null) await prisma.blackFridayLead.updateMany({ where: { leadId: job.leadId }, data: { crmStatus: "error" } })
    return
  }
  try {
    const endpoint = job.method === "CONTACTS_BULK"
      ? "/api/v1/contacts/bulk"
      : redistribute ? "/api/v1/painel-nichos/redistributions"
      : "/api/v1/deals" + (job.method === "PATCH" ? "/" + encodeURIComponent(job.crmDealId!) : "")
    const response = await fetch(`${base}${endpoint}`, {
      method: job.method === "PATCH" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(redistribute ? job.payload : normalizeCrmPayloadPhones(job.payload)),
      signal: AbortSignal.timeout(25_000),
    })
    if (response.status === 429) {
      await prisma.crmDelivery.update({ where: { id: job.id }, data: { status: "pending", nextAttemptAt: new Date(Date.now() + retryDelay(response)), error: "Limite do CRM. O envio continuará automaticamente." } })
      return
    }
    const data = await response.json().catch(() => null)
    if (job.method === "CONTACTS_BULK" && response.ok && data?.success === true && data?.data?.summary) {
      const warnings = Array.isArray(data.data.results)
        ? data.data.results.flatMap((result: { index?: number; status?: string; error?: string; warnings?: string[] }) => [
            ...(result.status === "error" ? [`Contato ${Number(result.index ?? 0) + 1}: ${result.error || "o CRM recusou os dados."}`] : []),
            ...(Array.isArray(result.warnings) ? result.warnings.map(String) : []),
          ]).slice(0, 100)
        : []
      await prisma.crmDelivery.update({ where: { id: job.id }, data: { status: "sent", warnings, error: null } })
      return
    }
    if (response.ok && data?.success === true && typeof data?.data?.id === "string" && (!redistribute || (data.data.outcome === "updated" && typeof data.data.contactId === "string" && typeof data.data.auditId === "string"))) {
      await prisma.crmDelivery.update({ where: { id: job.id }, data: { status: "sent", crmDealId: data.data.id, warnings: Array.isArray(data.data.warnings) ? data.data.warnings : [], error: null } })
      if (job.listaId === null && job.leadId !== null) await prisma.blackFridayLead.updateMany({ where: { leadId: job.leadId }, data: { crmStatus: data.data.warnings?.length ? "partial" : "sent" } })
    } else if (redistribute && crmErrorCode(data) === ALREADY_DISTRIBUTED_CODE) {
      // A trava do CRM funcionou: nada foi alterado e não há o que revisar nem reenviar.
      await prisma.crmDelivery.update({ where: { id: job.id }, data: { status: "skipped", error: typeof data?.error === "string" ? data.error : "Este contato já foi redistribuído nesta campanha." } })
      if (job.listaId === null && job.leadId !== null) await prisma.blackFridayLead.updateMany({ where: { leadId: job.leadId }, data: { crmStatus: "already_distributed" } })
    } else {
      const target = job.method === "CONTACTS_BULK" ? "os contatos" : "o negócio"
      await prisma.crmDelivery.update({ where: { id: job.id }, data: { status: redistribute || response.status >= 500 || response.ok ? "needs_review" : "failed", error: typeof data?.error === "string" ? data.error : `O CRM retornou HTTP ${response.status}. Confira ${target} no CRM antes de reenviar.` } })
      if (job.listaId === null && job.leadId !== null) await prisma.blackFridayLead.updateMany({ where: { leadId: job.leadId }, data: { crmStatus: "error" } })
    }
  } catch {
    const target = job.method === "CONTACTS_BULK" ? "os contatos" : "o negócio"
    await prisma.crmDelivery.update({ where: { id: job.id }, data: { status: "needs_review", error: `Não foi possível confirmar a resposta do CRM. Confira ${target} antes de reenviar para evitar duplicação.` } })
    if (job.listaId === null && job.leadId !== null) await prisma.blackFridayLead.updateMany({ where: { leadId: job.leadId }, data: { crmStatus: "error" } })
  }
}

const workerGlobal = globalThis as unknown as { crmDeliveryTimer?: ReturnType<typeof setInterval> }
export function startCrmDeliveryWorker() {
  if (workerGlobal.crmDeliveryTimer) return
  let busy = false
  workerGlobal.crmDeliveryTimer = setInterval(async () => {
    if (busy) return
    busy = true
    try { await processNextCrmDelivery() } catch { console.error("[CRM] Falha ao processar a fila de negócios.") } finally { busy = false }
  }, 2300)
  workerGlobal.crmDeliveryTimer.unref()
}
