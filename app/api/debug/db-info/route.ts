import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

function getToken(req: Request): string | null {
  const url = new URL(req.url)
  const tokenFromQuery = url.searchParams.get("token")
  const tokenFromHeader = req.headers.get("x-etl-token")
  const auth = req.headers.get("authorization")
  const tokenFromBearer = auth && auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null
  return tokenFromQuery || tokenFromHeader || tokenFromBearer
}

export async function GET(req: Request) {
  const token = getToken(req)
  const expected = process.env.ETL_TOKEN

  if (!expected || token !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  try {
    const [leadCount, listaCount, listaLeadCount, importLogCount, lastImportLogs, dbRow] = await Promise.all([
      prisma.lead.count(),
      prisma.lista.count(),
      prisma.listaLead.count(),
      prisma.importLog.count(),
      prisma.importLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.$queryRaw<Array<{ db: string; schema: string; user: string }>>`
        select current_database() as db, current_schema() as schema, current_user as user;
      `,
    ])

    return NextResponse.json({
      ok: true,
      db: dbRow?.[0] ?? null,
      counts: {
        leads: leadCount,
        listas: listaCount,
        listaLeads: listaLeadCount,
        importLogs: importLogCount,
      },
      lastImportLogs,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg || "failed" }, { status: 500 })
  }
}
