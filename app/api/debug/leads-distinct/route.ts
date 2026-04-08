import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const tokenFromQuery = url.searchParams.get("token")
  const tokenFromHeader = req.headers.get("x-etl-token")
  const auth = req.headers.get("authorization")
  const tokenFromBearer = auth && auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null

  const token = tokenFromQuery || tokenFromHeader || tokenFromBearer
  const expected = process.env.ETL_TOKEN

  if (!expected || token !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  try {
    const [nichoCounts, stateCounts, cityCounts, totalLeads] = await Promise.all([
      prisma.lead.groupBy({
        by: ["nicho"],
        _count: { _all: true },
        orderBy: { nicho: "asc" },
        take: 100,
      }),
      prisma.lead.groupBy({
        by: ["state"],
        _count: { _all: true },
        orderBy: { state: "asc" },
        take: 100,
      }),
      prisma.lead.groupBy({
        by: ["city"],
        _count: { _all: true },
        orderBy: { city: "asc" },
        take: 200,
      }),
      prisma.lead.count(),
    ])

    const nichoRows = nichoCounts as unknown as Array<{ nicho: string | null; _count: { _all: number } }>
    const stateRows = stateCounts as unknown as Array<{ state: string | null; _count: { _all: number } }>
    const cityRows = cityCounts as unknown as Array<{ city: string | null; _count: { _all: number } }>

    nichoRows.sort((a, b) => b._count._all - a._count._all)
    stateRows.sort((a, b) => b._count._all - a._count._all)
    cityRows.sort((a, b) => b._count._all - a._count._all)

    return NextResponse.json({
      ok: true,
      totalLeads,
      nicho: nichoRows.map((r) => ({ value: r.nicho, count: r._count._all })),
      state: stateRows.map((r) => ({ value: r.state, count: r._count._all })),
      city: cityRows.map((r) => ({ value: r.city, count: r._count._all })),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg || "failed" }, { status: 500 })
  }
}
