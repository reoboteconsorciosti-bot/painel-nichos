import { NextResponse } from "next/server"
import { POST as runImportFromFolder } from "@/app/api/criar-lista/route"

export const runtime = "nodejs"

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const etlToken = process.env.ETL_TOKEN
    if (!etlToken) {
      return NextResponse.json({ ok: false, error: "ETL_TOKEN_not_configured" }, { status: 500 })
    }

    const proxiedReq = new Request("http://internal/api/criar-lista", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-etl-token": etlToken,
      },
      body: JSON.stringify(body),
    })

    return runImportFromFolder(proxiedReq)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
