import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function DELETE(_req: Request, ctx: { params: Promise<{ id?: string }> }) {
  const params = await ctx.params
  const id = String(params?.id ?? "").trim()

  if (!id) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 })
  }

  try {
    await (prisma as any).consultant.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg || "failed" }, { status: 500 })
  }
}
