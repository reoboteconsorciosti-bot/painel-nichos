import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Pegamos também as listas, para somar o historico (quantidade original solicitada/gerada)
    const listasMes = await prisma.lista.findMany({
      where: {
        createdAt: { gte: startOfMonth },
      },
      select: {
        consultorId: true,
        quantidade: true,
        id: true
        // Para ter a contagem "ativa" a gente só precisaria dar um _count na relação leads, 
        // mas a Prisma Client pode fazer as duas coisas:
      }
    })

    // Quantidade "Ativa" de leads por lista
    const activeLeadsGroup = await prisma.listaLead.groupBy({
      by: ['listaId'],
      _count: { leadId: true }
    })
    
    // Map listId -> qt ativa
    const activeCountByLista = new Map<number, number>()
    for (const group of activeLeadsGroup) {
      activeCountByLista.set(group.listaId, group._count.leadId)
    }

    // Agrupamos agora por consultorId (usando o id numérico index que o app usa)
    const stats: Record<number, { historic: number, active: number }> = {}

    for (const l of listasMes) {
      if (!stats[l.consultorId]) {
        stats[l.consultorId] = { historic: 0, active: 0 }
      }
      stats[l.consultorId].historic += l.quantidade
      stats[l.consultorId].active += activeCountByLista.get(l.id) || 0
    }

    return NextResponse.json({ ok: true, stats })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
