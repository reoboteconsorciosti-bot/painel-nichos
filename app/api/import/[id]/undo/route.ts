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
      if (batch.status === "undone") return { error: "already_undone" as const }
      const leadIds = Array.isArray(batch.leadIds) ? batch.leadIds.filter((value): value is number => Number.isInteger(value)) : []
      const leads = await tx.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, blackFridayClaim: { select: { id: true } }, crmDeliveries: { select: { id: true }, take: 1 } } })
      const removable = leads.filter(lead => !lead.blackFridayClaim && lead.crmDeliveries.length === 0).map(lead => lead.id)
      await tx.crmDelivery.deleteMany({ where: { idempotencyKey: { startsWith: `import:${batch.fingerprint}:` }, status: "pending" } })
      const deleted = await tx.lead.deleteMany({ where: { id: { in: removable } } })
      await tx.importBatch.update({ where: { id }, data: { status: "undone", removedCount: deleted.count, undoneAt: new Date() } })
      return { removed: deleted.count, protected: leadIds.length - deleted.count }
    })
    if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: result.error === "not_found" ? 404 : 409 })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[IMPORT_UNDO] Failed to undo import batch", error)
    return NextResponse.json({ ok: false, error: "undo_failed" }, { status: 500 })
  }
}
