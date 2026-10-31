import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"
import { canViewGlobalLeadCounts } from "@/lib/lead-visibility"

export const runtime = "nodejs"

type AvailabilityBody = {
  nicho?: unknown
  estado?: unknown
  cidade?: unknown
}

function buildNichoWhere(nicho: string) {
  const normalized = nicho.trim().toLowerCase()
  if (normalized === "empresarios" || normalized.includes("empresas")) {
    return {
      OR: [
        { nicho: { equals: "empresarios", mode: "insensitive" as const } },
        { nicho: { startsWith: "EMPRESAS", mode: "insensitive" as const } },
      ],
    }
  }
  return { nicho: { equals: nicho, mode: "insensitive" as const } }
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
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
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
    if (!(await canViewGlobalLeadCounts(user))) {
      return NextResponse.json({ ok: true, countsVisible: false, totalMatching: null, unassignedMatching: null, assignedMatching: null })
    }

    const baseWhere = {
      ...buildNichoWhere(nicho),
      state: { equals: estado, mode: "insensitive" as const },
      ...(cidade
        ? {
          city: { equals: cidade, mode: "insensitive" as const },
        }
        : {}),
    }

    const campaignEligibleWhere = { ...baseWhere, blackFridayClaim: { is: null } }
    const totalMatching = await prisma.lead.count({ where: campaignEligibleWhere })
    const unassignedMatching = await prisma.lead.count({
      where: {
        ...campaignEligibleWhere,
        listaLeads: { none: {} },
      },
    })

    return NextResponse.json({
      ok: true,
      countsVisible: true,
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
