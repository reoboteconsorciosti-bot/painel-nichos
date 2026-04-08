import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export const runtime = "nodejs"

type CreateListaBody = {
  consultorId?: unknown
  quantidade?: unknown
  estado?: unknown
  cidade?: unknown
  nicho?: unknown
}

function normalizeCity(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

function parsePositiveInt(input: unknown): number | null {
  const n = typeof input === "number" ? input : Number(String(input ?? ""))
  if (!Number.isFinite(n)) return null
  const i = Math.trunc(n)
  if (i <= 0) return null
  return i
}

async function checkMonthlyLimit(tx: Prisma.TransactionClient, consultorId: number, requestedQuantity: number) {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const count = await tx.listaLead.count({
    where: {
      lista: {
        consultorId,
        createdAt: {
          gte: startOfMonth,
        },
      }
    },
  })

  // Limite mensal de LEADS (contatos) por consultor
  if (count + requestedQuantity > 300) {
    const remaining = Math.max(0, 300 - count)
    if (remaining === 0) {
      throw new Error(`limit_exceeded|O seu limite mensal de 300 leads foi atingido. Tente novamente no próximo mês.`)
    } else {
      throw new Error(`limit_exceeded|Limite excedido: você já gerou ${count} leads neste mês. Você só pode gerar mais ${remaining} leads (solicitado: ${requestedQuantity}).`)
    }
  }
}


export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CreateListaBody

  const consultorId = parsePositiveInt(body.consultorId)
  const quantidadeRaw = parsePositiveInt(body.quantidade)
  const estadoRaw = String(body.estado ?? "").trim()
  const cidadeRaw = String(body.cidade ?? "").trim()
  const nichoRaw = String(body.nicho ?? "").trim()

  const quantidade = quantidadeRaw
  const estado = estadoRaw.toUpperCase().slice(0, 2)
  const cidade = cidadeRaw ? normalizeCity(cidadeRaw) : ""
  const nicho = nichoRaw

  if (!consultorId || !quantidade || !estado || !nicho) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload" },
      { status: 400 },
    )
  }

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Validar se o limite não estourou (proteção contra concorrência via transaction)
      await checkMonthlyLimit(tx, consultorId, quantidade)

      // Opção B (sem coluna nicho em leads): não filtra no banco.
      // Seleciona leads que ainda não foram atribuídos a nenhuma lista.
      const baseWhere = {
        nicho: { equals: nicho, mode: "insensitive" as const },
        state: { equals: estado, mode: "insensitive" as const },
        ...(cidade
          ? {
              city: { equals: cidade, mode: "insensitive" as const },
            }
          : {}),
      }

      const leads = await tx.lead.findMany({
        where: {
          ...baseWhere,
          listaLeads: { none: {} },
        },
        orderBy: { id: "asc" },
        take: quantidade,
      })

      if (leads.length === 0) {
        const totalMatching = await tx.lead.count({ where: baseWhere })
        const unassignedMatching = await tx.lead.count({
          where: {
            ...baseWhere,
            listaLeads: { none: {} },
          },
        })

        throw new Error(
          `no_leads_available|total_matching=${totalMatching}|unassigned_matching=${unassignedMatching}|assigned_matching=${Math.max(
            0,
            totalMatching - unassignedMatching,
          )}`,
        )
      }

      // 2. Criar a nova lista agora que sabemos exatamente quantos leads teremos
      const lista = await tx.lista.create({
        data: {
          consultorId,
          nicho,
          quantidade: leads.length,
        },
      })

      await tx.listaLead.createMany({
        data: leads.map((l: { id: number }) => ({
          listaId: lista.id,
          leadId: l.id,
        })),
        skipDuplicates: true,
      })

      return { lista, leads }
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    
    // Tratamento de erros específicos
    if (msg.startsWith("limit_exceeded")) {
      const parts = msg.split("|")
      return NextResponse.json({ ok: false, error: parts[1] || "limite mensal excedido" }, { status: 400 })
    }
    
    const status = msg.startsWith("no_leads_available") ? 404 : 500
    return NextResponse.json({ ok: false, error: msg || "failed_to_create_list" }, { status })
  }
}
