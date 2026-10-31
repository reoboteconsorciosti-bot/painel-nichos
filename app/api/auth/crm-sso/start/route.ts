import { NextResponse } from "next/server"
import { getCRMSSOStartUrl, getPanelRedirectUrl } from "@/lib/crm-sso"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const target = getCRMSSOStartUrl()
  if (!target) {
    const errorUrl = getPanelRedirectUrl(req, "/")
    errorUrl.searchParams.set("sso_error", "crm_not_configured")
    return NextResponse.redirect(errorUrl)
  }
  return NextResponse.redirect(target)
}
