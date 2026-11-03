import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { NICHES } from "@/lib/data"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export type RoleVisibility = {
  consultants: boolean
  supervisors: boolean
  managers: boolean
}

export type NicheVisibilityConfig = Record<string, RoleVisibility>

export const DEFAULT_ROLE_VISIBILITY: RoleVisibility = {
  consultants: true,
  supervisors: true,
  managers: true,
}

const SETTING_KEY = "niche_visibility_rules"

async function getSavedVisibility(): Promise<NicheVisibilityConfig> {
  const row = await prisma.appSetting.findUnique({
    where: { key: SETTING_KEY },
  })
  if (!row?.value) {
    return {}
  }
  try {
    const parsed = JSON.parse(row.value) as unknown
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as NicheVisibilityConfig
    }
  } catch {
    // fallback
  }
  return {}
}

export async function GET(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const saved = await getSavedVisibility()

  // Monta a configuração completa para todos os nichos
  const fullConfig: NicheVisibilityConfig = {}
  for (const n of NICHES) {
    fullConfig[n.id] = {
      consultants: saved[n.id]?.consultants ?? DEFAULT_ROLE_VISIBILITY.consultants,
      supervisors: saved[n.id]?.supervisors ?? DEFAULT_ROLE_VISIBILITY.supervisors,
      managers: saved[n.id]?.managers ?? DEFAULT_ROLE_VISIBILITY.managers,
    }
  }

  // Se for dono, devolve a matriz completa
  if (user.role === "admin" && user.isOwner) {
    return NextResponse.json({
      ok: true,
      rules: fullConfig,
      isOwner: true,
    })
  }

  // Se for supervisor, devolve a lista dos nichos que o supervisor tem permissão de ver
  const allowedNiches = NICHES.filter((n) => {
    const rule = fullConfig[n.id]
    return rule ? rule.supervisors !== false : true
  }).map((n) => n.id)

  return NextResponse.json({
    ok: true,
    allowedNiches,
    isOwner: false,
  })
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user || user.role !== "admin" || !user.isOwner) {
    return NextResponse.json({ ok: false, error: "forbidden_owner_only" }, { status: 403 })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { rules?: unknown }
    if (!body || typeof body.rules !== "object" || body.rules === null) {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 })
    }

    const inputRules = body.rules as Record<string, Partial<RoleVisibility>>
    const sanitized: NicheVisibilityConfig = {}

    for (const n of NICHES) {
      const incoming = inputRules[n.id]
      sanitized[n.id] = {
        consultants: typeof incoming?.consultants === "boolean" ? incoming.consultants : true,
        supervisors: typeof incoming?.supervisors === "boolean" ? incoming.supervisors : true,
        managers: typeof incoming?.managers === "boolean" ? incoming.managers : true,
      }
    }

    await prisma.appSetting.upsert({
      where: { key: SETTING_KEY },
      create: {
        key: SETTING_KEY,
        value: JSON.stringify(sanitized),
      },
      update: {
        value: JSON.stringify(sanitized),
      },
    })

    return NextResponse.json({ ok: true, rules: sanitized })
  } catch (error) {
    console.error("[NICHE_VISIBILITY] Failed to save", error)
    return NextResponse.json({ ok: false, error: "failed_to_save" }, { status: 500 })
  }
}

