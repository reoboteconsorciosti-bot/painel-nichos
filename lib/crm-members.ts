import { prisma } from "@/lib/prisma"

export type CRMMember = {
  id: string
  name: string
  email: string
  role: "OWNER" | "MANAGER" | "SUPERVISOR" | "MEMBER"
  area: "SALES" | "ADMINISTRATIVE"
  active: boolean
  teamId: string | null
  team: { id: string; name: string; leaderId: string | null } | null
}

function normalizeArea(value: unknown): CRMMember["area"] | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  if (normalized === "SALES" || normalized === "VENDAS") return "SALES"
  if (["ADMINISTRATIVE", "ADMINISTRATIVO", "ADMINISTRATIVA"].includes(normalized)) return "ADMINISTRATIVE"
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseMember(value: unknown): CRMMember | null {
  if (!isRecord(value)) return null
  const role = value.role
  const area = normalizeArea(value.area)
  if (
    typeof value.id !== "string" || !value.id || typeof value.name !== "string" ||
    typeof value.email !== "string" || typeof value.active !== "boolean" ||
    !["OWNER", "MANAGER", "SUPERVISOR", "MEMBER"].includes(String(role)) ||
    !area
  ) return null

  const rawTeam = value.team
  let team: CRMMember["team"] = null
  if (isRecord(rawTeam) && typeof rawTeam.id === "string" && typeof rawTeam.name === "string") {
    team = {
      id: rawTeam.id,
      name: rawTeam.name,
      leaderId: typeof rawTeam.leaderId === "string" ? rawTeam.leaderId : null,
    }
  }

  return {
    id: value.id,
    name: value.name,
    email: value.email,
    role: role as CRMMember["role"],
    area,
    active: value.active,
    teamId: typeof value.teamId === "string" ? value.teamId : null,
    team,
  }
}

export async function getCRMMembers(): Promise<CRMMember[]> {
  const crmUrl = (process.env.CRM_API_URL ?? "").trim().replace(/\/+$/, "")
  const crmKey = (process.env.CRM_API_KEY ?? "").trim()
  if (!crmUrl || !crmKey) throw new Error("CRM_NOT_CONFIGURED")

  const response = await fetch(`${crmUrl}/api/v1/members`, {
    headers: { Authorization: `Bearer ${crmKey}`, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`CRM_MEMBERS_HTTP_${response.status}`)

  const payload: unknown = await response.json().catch(() => null)
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data) || !Array.isArray(payload.data.members)) {
    throw new Error("CRM_MEMBERS_INVALID_RESPONSE")
  }

  return payload.data.members.map(parseMember).filter((member): member is CRMMember => member !== null)
}
export async function syncCRMConsultants(user: { id: string; role: "admin" | "supervisor"; teamId?: string }) {
  const members = await getCRMMembers()
  const consultants = members.filter((member) =>
    member.active && member.area === "SALES" && member.role === "MEMBER" &&
    member.team && member.teamId === member.team.id && member.team.leaderId &&
    (user.role === "admin" || (member.team.leaderId === user.id && member.teamId === user.teamId)),
  ).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

  const synced = []
  const seen = new Set<string>()
  for (const member of consultants) {
    const supervisorId = member.team!.leaderId!
    let existing = await prisma.consultant.findUnique({ where: { crmMemberId: member.id } })
    if (!existing) {
      existing = await prisma.consultant.findFirst({
        where: { supervisorId, crmMemberId: null, name: { equals: member.name, mode: "insensitive" } },
      })
    }

    const consultant = existing
      ? await prisma.consultant.update({
        where: { id: existing.id },
        data: { name: member.name, supervisorId, crmMemberId: member.id },
        select: { id: true, name: true, supervisorId: true },
      })
      : await prisma.consultant.create({
        data: { name: member.name, supervisorId, crmMemberId: member.id },
        select: { id: true, name: true, supervisorId: true },
      })

    if (!seen.has(consultant.id)) {
      seen.add(consultant.id)
      synced.push({ ...consultant, crmUserId: member.id })
    }
  }
  return synced
}
