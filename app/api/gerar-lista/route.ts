import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma, type Prisma as PrismaType } from "@prisma/client"
import { getAuthenticatedUser } from "@/lib/auth"
import { syncCRMConsultants } from "@/lib/crm-members"
import { consumeConsultantMonthlyQuota } from "@/lib/consultant-quotas"
import { buildCrmDelivery, type CrmLead } from "@/lib/crm-delivery-payload"
import { normalizeCrmPhone } from "@/lib/phone-normalization"

export const runtime = "nodejs"

type CreateListaBody = {
  consultorId?: unknown
  consultantCrmId?: unknown
  quantidade?: unknown
  estado?: unknown
  cidade?: unknown
  nicho?: unknown
  consultantName?: unknown
  enviarParaCrm?: unknown
  crmOwnerId?: unknown
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

function parsePositiveInt(input: unknown): number | null {
  const n = typeof input === "number" ? input : Number(String(input ?? ""))
  if (!Number.isFinite(n)) return null
  const i = Math.trunc(n)
  if (i <= 0) return null
  return i
}

async function getDefaultNotifyNumber(): Promise<string> {
  const fromEnv = normalizeNotifyNumber(process.env.WHATSAPP_NOTIFY_NUMBER)
  try {
    const rows = await prisma.$queryRaw<Array<{ value: string }>>(
      Prisma.sql`SELECT value FROM app_settings WHERE key = ${"whatsapp_notify_number"} LIMIT 1`,
    )
    const fromDb = normalizeNotifyNumber(rows[0]?.value)
    return fromDb || fromEnv
  } catch {
    return fromEnv
  }
}

function normalizeNotifyNumber(input: unknown): string {
  const raw = String(input ?? "").trim()
  if (!raw) return ""
  const digits = raw.replace(/\D+/g, "")
  if (!digits) return ""
  // aceita 55 + DDD + numero, ou DDD + numero
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length === 12 || digits.length === 13) return digits
  return digits
}

function formatLeadListWhatsAppMessage(args: {
  consultantName: string
  nicho: string
  cidade: string
  estado: string
  leadCount: number
  listaId: number
}): string {
  const consultor = (args.consultantName ?? "").trim().toUpperCase() || "(SEM CONSULTOR)"
  const uf = (args.estado ?? "").trim().toUpperCase().slice(0, 2)
  const cidade = (args.cidade ?? "").trim()
  const nicho = (args.nicho ?? "").trim().toUpperCase()
  return [
    "Lista gerada com sucesso.",
    `Consultor: ${consultor}`,
    `Nicho: ${nicho}`,
    `Regiao: ${cidade}${cidade ? " - " : ""}${uf}`,
    `Leads: ${args.leadCount}`,
    `Lista ID: ${args.listaId}`,
  ].join("\n")
}

async function sendWhatsAppMessage(params: { to: string; message: string }) {
  const baseUrl = (process.env.WHATSAPP_API_URL ?? "").trim().replace(/\/+$/, "")
  const userId = (process.env.WHATSAPP_USER_ID ?? "").trim()
  if (!baseUrl || !userId) {
    throw new Error("whatsapp_not_configured")
  }

  const res = await fetch(`${baseUrl}/message/send-text/${encodeURIComponent(userId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ number: params.to, message: params.message }),
  })

  const data = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const err =
      data && typeof data === "object" && data && "error" in data
        ? String((data as { error?: unknown }).error)
        : `whatsapp_send_failed_status_${res.status}`
    throw new Error(err)
  }
}

// ---------------------------------------------------------------------------
// CRM External Integration
// ---------------------------------------------------------------------------

type CrmContact = {
  name: string
  phone?: string
  whatsapp?: string
  city?: string
  state?: string
  company?: string
  source?: string
  ownerId?: string
  email?: string
  jobTitle?: string
}

async function pushLeadsToCRM(
  leads: CrmLead[],
  nicho: string,
  ownerId: string | null,
): Promise<{ warnings: string[]; createdCount: number; ignoredCount: number }> {
  if (!leads.length) return { warnings: [], createdCount: 0, ignoredCount: 0 }
  const crmUrl = (process.env.CRM_API_URL ?? "").trim().replace(/\/+$/, "")
  const crmKey = (process.env.CRM_API_KEY ?? "").trim()
  const allWarnings: string[] = []
  let createdCount = 0
  let ignoredCount = 0

  if (!crmUrl || !crmKey) {
    console.warn("[CRM] CRM_API_URL ou CRM_API_KEY não configurados — pulando envio.")
    return { warnings: allWarnings, createdCount, ignoredCount }
  }

  const contacts: CrmContact[] = leads
    .filter((l) => l.name) // nome é obrigatório pelo CRM
    .map((l) => ({
      name: l.name ?? "",
      ...(l.email ? { email: l.email } : {}),
      ...(l.jobTitle ? { jobTitle: l.jobTitle } : {}),
      ...(l.phone ? { whatsapp: normalizeCrmPhone(l.phone) } : {}),
      ...(l.city ? { city: l.city } : {}),
      ...(l.state ? { state: l.state } : {}),
      ...(l.company || l.fantasy ? { company: l.company || l.fantasy || undefined } : {}),
      source: `Painel Nichos - ${nicho}`,
      ...(ownerId ? { ownerId } : {}),
    }))

  // Respeita o limite de 500 por chamada do CRM
  const CHUNK_SIZE = 500
  for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
    const chunk = contacts.slice(i, i + CHUNK_SIZE)
    try {
      const res = await fetch(`${crmUrl}/api/v1/contacts/bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${crmKey}`,
        },
        body: JSON.stringify({ contacts: chunk }),
      })

      const data = (await res.json().catch(() => null)) as any

      if (!res.ok) {
        console.error(`[CRM] Erro ao enviar lote ${i / CHUNK_SIZE + 1}:`, res.status, data)
        // Se houver erro na requisição, todos os leads do chunk são considerados ignorados
        ignoredCount += chunk.length
      } else {
        const summary = data?.data?.summary
        console.log(`[CRM] Lote ${i / CHUNK_SIZE + 1} enviado com sucesso:`, summary)
        
        // Coleta warnings dos resultados individuais e contabiliza
        if (Array.isArray(data?.data?.results)) {
          data.data.results.forEach((r: any) => {
            if (r.status === 'created') {
              createdCount++
            } else if (r.status === 'ignored') {
              ignoredCount++
            }
            if (Array.isArray(r.warnings)) {
              allWarnings.push(...r.warnings)
            }
          })
        } else {
          // Se não houver results, usa o summary se disponível
          if (summary?.created) createdCount += summary.created
          if (summary?.ignored) ignoredCount += summary.ignored
        }
      }
    } catch (err) {
      console.error(`[CRM] Falha de rede no lote ${i / CHUNK_SIZE + 1}:`, err)
      // Se houver erro de rede, todos os leads do chunk são considerados ignorados
      ignoredCount += chunk.length
    }
  }

  // Remove duplicates
  return { 
    warnings: Array.from(new Set(allWarnings)), 
    createdCount, 
    ignoredCount 
  }
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as CreateListaBody

  const consultantCrmId = String(body.consultantCrmId ?? "").trim()
  const quantidadeRaw = parsePositiveInt(body.quantidade)
  const estadoRaw = String(body.estado ?? "").trim()
  const cidadeRaw = String(body.cidade ?? "").trim()
  const nichoRaw = String(body.nicho ?? "").trim()
  const consultantNameRaw = String(body.consultantName ?? "").trim()
  const enviarParaCrm = body.enviarParaCrm === true
  const crmOwnerIdRaw = body.crmOwnerId ? String(body.crmOwnerId).trim() : null

  const quantidade = quantidadeRaw
  const estado = estadoRaw.toUpperCase().slice(0, 2)
  const cidade = cidadeRaw ? normalizeCity(cidadeRaw) : ""
  const nicho = nichoRaw
  const consultantName = consultantNameRaw

  if (nicho.toLowerCase().startsWith("black-friday-")) {
    return NextResponse.json({ ok: false, error: "campaign_requires_supervisor_release" }, { status: 403 })
  }

  // Bloqueio de nichos desativados para supervisores e gerentes (não-donos)
  if (!user.isOwner) {
    try {
      const setting = await prisma.appSetting.findUnique({
        where: { key: "niche_visibility_rules" },
      })
      if (setting?.value) {
        const rules = JSON.parse(setting.value) as Record<string, { supervisors?: boolean }>
        if (rules && typeof rules === "object") {
          const rule = rules[nicho]
          if (rule && rule.supervisors === false) {
            return NextResponse.json({ ok: false, error: "niche_forbidden_for_role" }, { status: 403 })
          }
        }
      }
    } catch {}
  }

  if (!consultantCrmId || !quantidade || !estado || !nicho || !consultantName) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload" },
      { status: 400 },
    )
  }

  const currentConsultants = await syncCRMConsultants(user).catch(() => null)
  if (!currentConsultants) return NextResponse.json({ ok: false, error: "crm_members_unavailable" }, { status: 502 })
  const selectedConsultantIndex = currentConsultants.findIndex((consultant) =>
    consultant.crmUserId === consultantCrmId &&
    consultant.name.localeCompare(consultantName, undefined, { sensitivity: "accent" }) === 0 &&
    (user.role === "admin" || consultant.supervisorId === user.id),
  )
  if (selectedConsultantIndex < 0) return NextResponse.json({ ok: false, error: "consultant_outside_team" }, { status: 403 })
  const consultorId = selectedConsultantIndex + 1

  try {
    const result = await prisma.$transaction(async (tx: PrismaType.TransactionClient) => {
      // Serialize regular extraction with campaign allocations to avoid double claims.
      await tx.$queryRaw<{ locked: boolean }[]>(Prisma.sql`SELECT pg_advisory_xact_lock(1330008644, 1) IS NULL AS locked`)
      // 1. Validar se o limite não estourou (proteção contra concorrência via transaction)

      // Opção B (sem coluna nicho em leads): não filtra no banco.
      // Seleciona leads que ainda não foram atribuídos a nenhuma lista.
      const baseWhere = {
        ...buildNichoWhere(nicho),
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
          blackFridayClaim: { is: null },
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
            blackFridayClaim: { is: null },
          },
        })

        throw new Error(
          `no_leads_available|total_matching=${totalMatching}|unassigned_matching=${unassignedMatching}|assigned_matching=${Math.max(
            0,
            totalMatching - unassignedMatching,
          )}`,
        )
      }

      await consumeConsultantMonthlyQuota(tx, {
        crmUserId: consultantCrmId,
        legacyConsultantIndex: consultorId,
        quantity: leads.length,
      })

      // 2. Criar a nova lista agora que sabemos exatamente quantos leads teremos
      const lista = await tx.lista.create({
        data: {
          consultorId,
          crmConsultantId: consultantCrmId,
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

      if (enviarParaCrm) {
        const deliveries = leads.flatMap(lead => {
          const delivery = buildCrmDelivery(lead, nicho, consultantCrmId)
          return delivery ? [{ leadId: lead.id, listaId: lista.id, consultantCrmId, idempotencyKey: `list:${lista.id}:lead:${lead.id}`, ...delivery }] : []
        })
        if (deliveries.length) await tx.crmDelivery.createMany({ data: deliveries, skipDuplicates: true })
      }
      await tx.distributionAudit.create({
        data: {
          action: "LIST",
          requestedById: user.id,
          requestedByName: user.name,
          requestedByEmail: user.email || null,
          requestedByRole: user.role,
          consultantId: currentConsultants[selectedConsultantIndex]!.id,
          consultantCrmId,
          consultantName,
          niche: nicho,
          quantity: leads.length,
          state: estado,
          city: cidade || null,
          crmRequested: enviarParaCrm,
          listId: lista.id,
        },
      })
      return { lista, leads }
    })

    // Disparar WhatsApp após a criação bem-sucedida
    try {
      const notifyNumber = await getDefaultNotifyNumber()
      if (!notifyNumber) throw new Error("whatsapp_notify_number_missing")
      const msg = formatLeadListWhatsAppMessage({
        consultantName,
        nicho,
        cidade: cidadeRaw,
        estado,
        leadCount: result.leads.length,
        listaId: result.lista.id,
      })
      await sendWhatsAppMessage({ to: notifyNumber, message: msg })
    } catch {
      // não falhar a geração da lista se o WhatsApp falhar
    }

    // Disparar envio ao CRM
    let crmWarnings: string[] = []
    let crmCreatedCount: number = 0
    let crmIgnoredCount: number = 0
    const crmQueuedCount = enviarParaCrm ? await prisma.crmDelivery.count({ where: { listaId: result.lista.id, status: { in: ["pending", "sending"] } } }) : 0
    if (enviarParaCrm) {
      try {
        const crmResult = await pushLeadsToCRM(result.leads.filter(lead => !lead.dealDescription?.trim()), nicho, crmOwnerIdRaw || consultantCrmId)
        crmWarnings = crmResult.warnings
        crmCreatedCount = crmResult.createdCount
        crmIgnoredCount = crmResult.ignoredCount
      } catch (err) {
        console.error("[CRM] Erro inesperado no push:", err)
      }
    }

    return NextResponse.json({ ok: true, ...result, crmWarnings, crmCreatedCount, crmIgnoredCount, crmQueuedCount })
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
