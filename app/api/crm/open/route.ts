import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })

  const configuredUrl = (process.env.CRM_API_URL ?? "").trim()
  if (!configuredUrl) return NextResponse.json({ ok: false, error: "crm_not_configured" }, { status: 503 })

  try {
    const crmUrl = new URL(configuredUrl)
    if (crmUrl.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && crmUrl.hostname === "localhost")) {
      return NextResponse.json({ ok: false, error: "crm_url_invalid" }, { status: 503 })
    }
    crmUrl.pathname = "/"
    crmUrl.search = ""
    crmUrl.hash = ""
    return NextResponse.redirect(crmUrl)
  } catch {
    return NextResponse.json({ ok: false, error: "crm_url_invalid" }, { status: 503 })
  }
}
