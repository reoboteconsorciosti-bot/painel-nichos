import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user || user.role !== "admin" || !user.isOwner) {
    return NextResponse.json({ ok: false, error: "forbidden_owner_only" }, { status: 403 })
  }
  const batches = await prisma.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, fileName: true, niche: true, importedCount: true, existingCount: true, removedCount: true, status: true, createdAt: true, undoneAt: true },
  })
  return NextResponse.json({ ok: true, batches })
}
