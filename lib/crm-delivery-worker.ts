import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { retryDelay } from "@/lib/crm-delivery-payload"

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
    // A 429 pauses the entire integration, not just the rejected item.
    const paused = await tx.crmDelivery.findFirst({ where: { status: "pending", nextAttemptAt: { gt: new Date() } } })
    if (paused) return null
    const next = await tx.crmDelivery.findFirst({ where: { status: "pending", nextAttemptAt: { lte: new Date() } }, orderBy: { id: "asc" } })
    if (!next) return null
    return tx.crmDelivery.update({ where: { id: next.id }, data: { status: "sending", attemptedAt: new Date(), error: null } })
  })
  if (!job) return
  try {
    const response = await fetch(`${base}/api/v1/deals${job.method === "PATCH" ? `/${encodeURIComponent(job.crmDealId!)}` : ""}`, {
      method: job.method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(job.payload),
      signal: AbortSignal.timeout(25_000),
    })
    if (response.status === 429) {
      await prisma.crmDelivery.update({ where: { id: job.id }, data: { status: "pending", nextAttemptAt: new Date(Date.now() + retryDelay(response)), error: "Limite do CRM. O envio continuará automaticamente." } })
      return
    }
    const data = await response.json().catch(() => null)
    if (response.ok && data?.success === true && typeof data?.data?.id === "string") {
      await prisma.crmDelivery.update({ where: { id: job.id }, data: { status: "sent", crmDealId: data.data.id, warnings: Array.isArray(data.data.warnings) ? data.data.warnings : [], error: null } })
      if (job.listaId === null) await prisma.blackFridayLead.updateMany({ where: { leadId: job.leadId }, data: { crmStatus: data.data.warnings?.length ? "partial" : "sent" } })
    } else {
      await prisma.crmDelivery.update({ where: { id: job.id }, data: { status: response.status >= 500 || response.ok ? "needs_review" : "failed", error: typeof data?.error === "string" ? data.error : `O CRM retornou HTTP ${response.status}. Confira o negócio antes de reenviar.` } })
      if (job.listaId === null) await prisma.blackFridayLead.updateMany({ where: { leadId: job.leadId }, data: { crmStatus: "error" } })
    }
  } catch {
    await prisma.crmDelivery.update({ where: { id: job.id }, data: { status: "needs_review", error: "Não foi possível confirmar a resposta do CRM. Confira o negócio antes de reenviar para evitar duplicação." } })
    if (job.listaId === null) await prisma.blackFridayLead.updateMany({ where: { leadId: job.leadId }, data: { crmStatus: "error" } })
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
