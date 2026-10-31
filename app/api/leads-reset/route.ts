import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST() {
  return NextResponse.json({ ok: false, error: "global_reset_disabled", message: "Este endpoint nao redefine a disponibilidade global de leads." }, { status: 410 })
}
