import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  try {
    const crmUrl = (process.env.CRM_API_URL ?? "").trim().replace(/\/+$/, "")
    const crmKey = (process.env.CRM_API_KEY ?? "").trim()

    if (!crmUrl || !crmKey) {
      return NextResponse.json({ ok: false, error: "CRM_NOT_CONFIGURED" }, { status: 500 })
    }

    const res = await fetch(`${crmUrl}/api/v1/members`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${crmKey}`,
        "Content-Type": "application/json",
      },
      // Revalidação gerenciada pelo Next.js na rota
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      console.error("[CRM_MEMBERS] Erro do CRM:", res.status, text.slice(0, 150) + (text.length > 150 ? "..." : ""))
      return NextResponse.json({ ok: false, error: "FALHA_FETCH_CRM", crmStatus: res.status }, { status: 502 })
    }

    const data = await res.json().catch(() => null)
    if (!data || data.success !== true || !data.data || !Array.isArray(data.data.members)) {
      console.error("[CRM_MEMBERS] Formato inesperado na resposta de /api/v1/members")
      return NextResponse.json({ ok: false, error: "RESPOSTA_CRM_INVALIDA" }, { status: 502 })
    }

    // Retornamos apenas os membros ativos
    const activeMembers = data.data.members.filter((m: any) => m.active === true);
    
    return NextResponse.json({
      ok: true,
      members: activeMembers,
    })
  } catch (error) {
    console.error("[CRM_MEMBERS] Erro interno:", error)
    const isConnectionError = error instanceof TypeError
    return NextResponse.json({ ok: false, error: isConnectionError ? "CRM_CONNECTION_FAILED" : "ERRO_INTERNO" }, { status: 500 })
  }
}
