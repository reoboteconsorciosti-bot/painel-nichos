import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST() {
  return NextResponse.json({ ok: false, error: "crm_sso_required" }, { status: 410 })
}
