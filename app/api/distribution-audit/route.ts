import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PAGE_SIZE = 50

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const beforeIdParam = new URL(req.url).searchParams.get("beforeId")
  const beforeId = beforeIdParam ? Number(beforeIdParam) : null
  if (beforeIdParam && (!Number.isSafeInteger(beforeId) || beforeId! < 1)) {
    return NextResponse.json({ ok: false, error: "invalid_cursor" }, { status: 400 })
  }

  try {
    const entries = await prisma.distributionAudit.findMany({
      where: {
        ...(user.role === "admin" ? {} : { requestedById: user.id }),
        ...(beforeId ? { id: { lt: beforeId } } : {}),
      },
      orderBy: { id: "desc" },
      take: PAGE_SIZE + 1,
    })
    const hasMore = entries.length > PAGE_SIZE
    const page = entries.slice(0, PAGE_SIZE)

    return NextResponse.json({
      ok: true,
      entries: page,
      nextBeforeId: hasMore ? page[page.length - 1]?.id ?? null : null,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[DISTRIBUTION_AUDIT] Failed to load", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ ok: false, error: "audit_unavailable" }, { status: 503 })
  }
}
