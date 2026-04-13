import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

type AvailabilityBody = {
  nicho?: unknown
  estado?: unknown
  cidade?: unknown
}

function normalizeCity(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AvailabilityBody

  const estadoRaw = String(body.estado ?? "").trim()
  const cidadeRaw = String(body.cidade ?? "").trim()
  const nichoRaw = String(body.nicho ?? "").trim()

  const estado = estadoRaw.toUpperCase().slice(0, 2)
  const cidade = cidadeRaw ? normalizeCity(cidadeRaw) : ""
  const nicho = nichoRaw

  if (!estado || !nicho) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 })
  }

  try {
    const baseWhere = {
      nicho: { equals: nicho, mode: "insensitive" as const },
      state: { equals: estado, mode: "insensitive" as const },
      ...(cidade
        ? {
          city: { equals: cidade, mode: "insensitive" as const },
        }
        : {}),
    }

    const totalMatching = await prisma.lead.count({ where: baseWhere })
    const unassignedMatching = await prisma.lead.count({
      where: {
        ...baseWhere,
        listaLeads: { none: {} },
      },
    })

    return NextResponse.json({
      ok: true,
      nicho,
      estado,
      cidade,
      totalMatching,
      unassignedMatching,
      assignedMatching: Math.max(0, totalMatching - unassignedMatching),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg || "failed" }, { status: 500 })
  }
}
