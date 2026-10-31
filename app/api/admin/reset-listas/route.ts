import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  if (!user.isOwner) return NextResponse.json({ ok: false, error: "owner_only" }, { status: 403 })
  return NextResponse.json({ ok: false, error: "global_reset_disabled", message: "Use o reset individual de contador mensal do consultor." }, { status: 410 })
}
