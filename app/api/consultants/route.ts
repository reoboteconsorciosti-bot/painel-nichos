import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

function toNonEmptyString(v: unknown): string | null {
  const s = String(v ?? "").trim()
  return s ? s : null
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const supervisorId = toNonEmptyString(searchParams.get("supervisorId"))

  try {
    const consultants = await (prisma as any).consultant.findMany({
      where: supervisorId ? { supervisorId } : {},
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, supervisorId: true },
      take: 5000,
    })

    return NextResponse.json({ ok: true, consultants })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg || "failed" }, { status: 500 })
  }
}

type CreateBody = {
  name?: unknown
  supervisorId?: unknown
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CreateBody
  const name = toNonEmptyString(body.name)
  const supervisorId = toNonEmptyString(body.supervisorId)

  if (!name || !supervisorId) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 })
  }

  try {
    const created = await (prisma as any).consultant.create({
      data: { name, supervisorId },
      select: { id: true, name: true, supervisorId: true },
    })

    return NextResponse.json({ ok: true, consultant: created })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg || "failed" }, { status: 500 })
  }
}
