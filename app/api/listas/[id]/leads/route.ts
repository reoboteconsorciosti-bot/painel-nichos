import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"
import { syncCRMConsultants } from "@/lib/crm-members"

export const runtime = "nodejs"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  const { id } = await params
  const listaId = parseInt(id)

  if (isNaN(listaId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 })
  }

  try {
    if (user.role !== "admin") {
      const lista = await prisma.lista.findUnique({ where: { id: listaId }, select: { crmConsultantId: true } })
      if (!lista?.crmConsultantId) return NextResponse.json({ ok: false, error: "lista_outside_team" }, { status: 403 })
      const teamConsultants = await syncCRMConsultants(user)
      if (!teamConsultants.some((consultant) => consultant.crmUserId === lista.crmConsultantId)) {
        return NextResponse.json({ ok: false, error: "lista_outside_team" }, { status: 403 })
      }
    }

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
