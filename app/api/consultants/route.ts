import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { syncCRMConsultants } from "@/lib/crm-members"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  try {
    const consultants = await syncCRMConsultants(user)
    return NextResponse.json({ ok: true, consultants })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[CONSULTANTS] CRM sync failed", msg)
    return NextResponse.json({ ok: false, error: "crm_members_unavailable" }, { status: 502 })
  }
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  return NextResponse.json({ ok: false, error: "consultants_managed_in_crm" }, { status: 405 })
}
