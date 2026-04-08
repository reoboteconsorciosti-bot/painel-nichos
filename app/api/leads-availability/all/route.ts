import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const groups = await prisma.lead.groupBy({
      by: ['nicho'],
      _count: {
        id: true,
      },
    })

    const result: Record<string, number> = {}

    for (const g of groups) {
      if (!g.nicho) continue
      
      const key = g.nicho.toLowerCase()
      // Normalizing the specialized cases
      if (key.includes("empresas")) {
        result["empresarios"] = (result["empresarios"] || 0) + g._count.id
      } else {
        result[key] = (result[key] || 0) + g._count.id
      }
    }

    return NextResponse.json({ ok: true, counts: result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg || "failed" }, { status: 500 })
  }
}
