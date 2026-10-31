import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"

export const runtime = "nodejs"

export async function DELETE(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  return NextResponse.json({ ok: false, error: "consultants_managed_in_crm" }, { status: 405 })
}
