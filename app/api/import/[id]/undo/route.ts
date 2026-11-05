import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser(req)
  if (!user || user.role !== "admin" || !user.isOwner) {
    return NextResponse.json({ ok: false, error: "forbidden_owner_only" }, { status: 403 })
  }
  const id = Number((await context.params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "invalid_batch" }, { status: 400 })

  try {
    const result = await prisma.$transaction(async tx => {
      const batch = await tx.importBatch.findUnique({ where: { id } })
      if (!batch) return { error: "not_found" as const }
      const isBlackFridayBatch = batch.niche.toLowerCase().includes("black-friday")
      if (batch.status === "undone" && (!isBlackFridayBatch || batch.removedCount >= batch.importedCount)) return { error: "already_undone" as const }
      const leadIds = Array.isArray(batch.leadIds) ? batch.leadIds.filter((value): value is number => Number.isInteger(value)) : []
      const leads = await tx.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, blackFridayClaim: { select: { id: true } }, crmDeliveries: { select: { id: true }, take: 1 }, listaLeads: { select: { id: true }, take: 1 } } })
      await tx.crmDelivery.deleteMany({ where: { idempotencyKey: { startsWith: `import:${batch.fingerprint}:` }, status: "pending" } })
      if (isBlackFridayBatch) {
        // Desfazer cancela o que ainda não saiu, mas a reserva fica: lead distribuído não volta.
        const cancelled = await tx.crmDelivery.findMany({ where: { leadId: { in: leadIds }, idempotencyKey: { startsWith: "black-friday:" }, status: "pending" }, select: { id: true, leadId: true } })
        await tx.crmDelivery.deleteMany({ where: { id: { in: cancelled.map(job => job.id) } } })
        await tx.blackFridayLead.updateMany({ where: { leadId: { in: cancelled.flatMap(job => job.leadId ?? []) } }, data: { crmStatus: "not_requested" } })
      }
      const removable = leads.filter(lead => !lead.blackFridayClaim && !lead.crmDeliveries.length && !lead.listaLeads.length).map(lead => lead.id)
      const deleted = await tx.lead.deleteMany({ where: { id: { in: removable } } })
      const preserved = leads.filter(lead => !removable.includes(lead.id)).map(lead => lead.id)
      if (isBlackFridayBatch && preserved.length) await tx.lead.updateMany({ where: { id: { in: preserved } }, data: { nicho: null } })
      const removedCount = batch.removedCount + deleted.count
      await tx.importBatch.update({ where: { id }, data: { status: "undone", removedCount, undoneAt: new Date() } })
      return { removed: deleted.count, preserved: preserved.length, removedTotal: removedCount }
    })
    if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: result.error === "not_found" ? 404 : 409 })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[IMPORT_UNDO] Failed to undo import batch", error)
    return NextResponse.json({ ok: false, error: "undo_failed" }, { status: 500 })
  }
}
