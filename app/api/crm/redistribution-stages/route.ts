import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  const base = process.env.CRM_API_URL?.trim().replace(/\/+$/, "")
  const key = process.env.CRM_API_KEY?.trim()
  if (!base || !key) return NextResponse.json({ ok: false, error: "crm_not_configured" }, { status: 503 })
  try {
    const response = await fetch(`${base}/api/v1/painel-nichos/stages`, {
      headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(12_000),
    })
    const result = await response.json()
    if (!response.ok || !result.success || !Array.isArray(result.data?.pipelines)) throw new Error("stages_unavailable")
    return NextResponse.json({ ok: true, configured: true, pipelines: result.data.pipelines }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ ok: false, error: "Não foi possível carregar as etapas do CRM. Tente novamente." }, { status: 502 })
  }
}
