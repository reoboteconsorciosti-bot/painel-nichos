import { normalizeCrmPhone } from "@/lib/phone-normalization"

export type CrmLead = {
  id: number
  name: string | null
  phone: string | null
  city: string | null
  state: string | null
  company: string | null
  fantasy: string | null
  email?: string | null
  jobTitle?: string | null
  dealDescription?: string | null
  crmDealId?: string | null
}

export function buildCrmDelivery(lead: CrmLead, nicho: string, ownerId: string | null) {
  const description = lead.dealDescription?.trim()
  if (!description) return null
  if (lead.crmDealId) {
    if (description.length > 2000) throw new Error("A nota do negócio excede 2.000 caracteres.")
    return { method: "PATCH", crmDealId: lead.crmDealId, payload: { note: description } }
  }
  if (!lead.name?.trim()) throw new Error("O contato precisa ter nome para criar um negócio no CRM.")
  const source = `Painel Nichos - ${nicho}`
  return {
    method: "POST",
    crmDealId: null,
    payload: {
      contact: {
        name: lead.name,
        ...(lead.phone ? { whatsapp: normalizeCrmPhone(lead.phone) } : {}),
        ...(lead.email ? { email: lead.email } : {}),
        ...(lead.jobTitle ? { jobTitle: lead.jobTitle } : {}),
        ...(lead.city ? { city: lead.city } : {}),
        ...(lead.state ? { state: lead.state } : {}),
        ...(lead.company || lead.fantasy ? { company: lead.company || lead.fantasy } : {}),
        ...(ownerId ? { ownerId } : {}),
        source,
      },
      ...(ownerId ? { ownerId } : {}),
      description,
      source,
    },
  }
}

export function normalizeCrmPayloadPhones(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload
  const value = payload as Record<string, unknown>
  const normalizeContact = (contact: unknown): unknown => {
    if (!contact || typeof contact !== "object" || Array.isArray(contact)) return contact
    const fields = contact as Record<string, unknown>
    return typeof fields.whatsapp === "string" && fields.whatsapp.trim()
      ? { ...fields, whatsapp: normalizeCrmPhone(fields.whatsapp) }
      : contact
  }
  return {
    ...value,
    ...(value.contact ? { contact: normalizeContact(value.contact) } : {}),
    ...(Array.isArray(value.contacts) ? { contacts: value.contacts.map(normalizeContact) } : {}),
  }
}

export function retryDelay(response: Pick<Response, "headers">): number {
  const raw = response.headers.get("Retry-After")
  if (!raw) return 60_000
  const seconds = Number(raw)
  return Math.max(2200, Number.isFinite(seconds) ? seconds * 1000 : (Date.parse(raw) || Date.now() + 60_000) - Date.now())
}
