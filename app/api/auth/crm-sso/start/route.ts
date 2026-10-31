import { NextResponse } from "next/server"
import { getCRMSSOStartUrl } from "@/lib/crm-sso"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const target = getCRMSSOStartUrl()
  if (!target) return NextResponse.redirect(new URL("/?sso_error=crm_not_configured", req.url))
  return NextResponse.redirect(target)
}
