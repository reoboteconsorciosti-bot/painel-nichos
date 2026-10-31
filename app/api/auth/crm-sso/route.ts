import { NextResponse } from "next/server"
import { establishCRMSSOSession, getPanelRedirectUrl } from "@/lib/crm-sso"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function loginError(req: Request, error: string) {
  const target = getPanelRedirectUrl(req, "/")
  target.searchParams.set("sso_error", error)
  const response = NextResponse.redirect(target)
  response.headers.set("Cache-Control", "no-store, max-age=0")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("crm_sso_token")?.trim()
  if (!token || token.length > 4096) {
    return loginError(req, "missing_token")
  }

  try {
    const result = await establishCRMSSOSession(token)
    if (!result.user || !result.cookie) {
      return loginError(req, result.error ?? "unauthorized")
    }

    const response = NextResponse.redirect(getPanelRedirectUrl(req, "/"))
    response.headers.set("Set-Cookie", result.cookie)
    response.headers.set("Cache-Control", "no-store, max-age=0")
    response.headers.set("Referrer-Policy", "no-referrer")
    return response
  } catch (error) {
    console.error("[CRM_SSO] Login failed", error instanceof Error ? error.message : "unknown error")
    return loginError(req, "crm_unavailable")
  }
}
