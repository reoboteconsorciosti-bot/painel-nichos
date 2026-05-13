import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const listaId = parseInt(id)

  if (isNaN(listaId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: {
        listaLeads: {
          some: {
            listaId: listaId,
          },
        },
      },
      orderBy: { id: "asc" },
    })

    return NextResponse.json({ ok: true, leads })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
