import { prisma } from "@/lib/prisma"

export type CRMMember = {
  id: string
  name: string
  email: string
  photoUrl: string | null
  role: "OWNER" | "MANAGER" | "SUPERVISOR" | "MEMBER"
  area: "SALES" | "ADMINISTRATIVE" | "OTHER"
  active: boolean
  teamId: string | null
  team: { id: string; name: string; leaderId: string | null } | null
}

function normalizeArea(value: unknown): CRMMember["area"] | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  if (normalized === "SALES" || normalized === "VENDAS") return "SALES"
  if (["ADMINISTRATIVE", "ADMINISTRATIVO", "ADMINISTRATIVA"].includes(normalized)) return "ADMINISTRATIVE"
  // Financeiro, pós-contemplação etc.: o membro continua na lista (supervisores e gerentes podem ter outra área).
  return normalized ? "OTHER" : null
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
    photoUrl: typeof value.photoUrl === "string" && value.photoUrl.trim() ? value.photoUrl.trim() : null,
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
type SyncUser = { id: string; role: "admin" | "supervisor"; teamId?: string }

async function upsertConsultantRow(member: CRMMember, supervisorId: string) {
  let existing = await prisma.consultant.findUnique({ where: { crmMemberId: member.id } })
  if (!existing) {
    existing = await prisma.consultant.findFirst({
      where: { supervisorId, crmMemberId: null, name: { equals: member.name, mode: "insensitive" } },
    })
  }
  return existing
    ? prisma.consultant.update({
      where: { id: existing.id },
      data: { name: member.name, supervisorId, crmMemberId: member.id },
      select: { id: true, name: true, supervisorId: true },
    })
    : prisma.consultant.create({
      data: { name: member.name, supervisorId, crmMemberId: member.id },
      select: { id: true, name: true, supervisorId: true },
    })
}

export async function syncCRMConsultants(user: SyncUser, preloaded?: CRMMember[]) {
  const members = preloaded ?? await getCRMMembers()
  const consultants = members.filter((member) =>
    member.active && member.area === "SALES" && member.role === "MEMBER" &&
    member.team && member.teamId === member.team.id && member.team.leaderId &&
    (user.role === "admin" || (member.team.leaderId === user.id && member.teamId === user.teamId)),
  ).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

  const synced = []
  const seen = new Set<string>()
  for (const member of consultants) {
    const supervisorId = member.team!.leaderId!
    const supervisor = members.find((candidate) => candidate.id === supervisorId)
    const teamName = member.team?.name ?? "Equipe sem nome"
    const supervisorName = supervisor?.name ?? "Supervisor não identificado"
    const consultant = await upsertConsultantRow(member, supervisorId)

    if (!seen.has(consultant.id)) {
      seen.add(consultant.id)
      synced.push({ ...consultant, crmUserId: member.id, photoUrl: member.photoUrl, teamId: member.teamId, teamName, supervisorName, isSelf: false, leaderLabel: undefined as string | undefined })
    }
  }
  return synced
}

// Supervisores e gerentes ativos, de qualquer área: podem tirar lista para si mesmos, dentro do limite que o dono define.
export const LEADERSHIP_GROUP = "Supervisores e gerentes"
const isLeadership = (member: CRMMember) => member.active && (member.role === "SUPERVISOR" || member.role === "MANAGER")
export const leadershipLabel = (member: CRMMember) => member.role === "MANAGER" ? "Gerente" : "Supervisor"

export async function getLeadershipMembers() {
  return (await getCRMMembers()).filter(isLeadership).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
}

/**
 * Quem pode receber a lista de quem está logado: os consultores da equipe e, para supervisor e gerente,
 * ele mesmo. A própria pessoa vem por último e marcada (isSelf). O dono continua vendo só os consultores.
 */
export async function syncListRecipients(user: SyncUser) {
  const members = await getCRMMembers()
  const consultants = await syncCRMConsultants(user, members)
  if (user.role === "admin") {
    // O dono também pode entregar para supervisores e gerentes (sem posição histórica: leaderLabel marca quem são).
    const known = new Set(consultants.map(c => c.crmUserId))
    const leaders = members.filter(member => isLeadership(member) && !known.has(member.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    const rows = await Promise.all(leaders.map(async leader => {
      const row = await upsertConsultantRow(leader, leader.id)
      return { ...row, crmUserId: leader.id, photoUrl: leader.photoUrl, teamId: leader.teamId, teamName: LEADERSHIP_GROUP, supervisorName: leader.name, isSelf: false, leaderLabel: leadershipLabel(leader) }
    }))
    return [...consultants, ...rows]
  }
  const self = members.find(member => member.id === user.id)
  if (!self || !isLeadership(self)) return consultants
  const row = await upsertConsultantRow(self, self.id)
  return [...consultants, { ...row, crmUserId: self.id, photoUrl: self.photoUrl, teamId: self.teamId, teamName: self.team?.name ?? LEADERSHIP_GROUP, supervisorName: self.name, isSelf: true, leaderLabel: undefined as string | undefined }]
}
