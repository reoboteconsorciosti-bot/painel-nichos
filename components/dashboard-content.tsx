"use client"

import { useState, useEffect } from "react"
import { Search, SlidersHorizontal, LayoutGrid, CalendarDays } from "lucide-react"
import { NICHES } from "@/lib/data"
import { Input } from "@/components/ui/input"
import { NicheCard } from "@/components/niche-card"
import { NicheModal } from "@/components/niche-modal"
import { SuccessDialog } from "@/components/success-dialog"
import { ScheduleTimeline } from "@/components/schedule-timeline"
import { jsPDF } from "jspdf"

export interface ScheduleEntry {
  id: string
  niches: string[]
  state: string
  city: string
  leadCount: number
  consultantName: string
  createdAt: string
}

type GeneratedLead = {
  id: number
  name: string | null
  phone: string
  city: string | null
  state: string | null
  company: string | null
  fantasy: string | null
}

const normalizePhoneForWhatsApp = (phone: string | null | undefined): string | null => {
  const digitsOnly = String(phone ?? "").replace(/\D/g, "")
  if (!digitsOnly) return null

  let normalized = digitsOnly
  if (!normalized.startsWith("55")) {
    normalized = `55${normalized}`
  }

  // Minimo esperado: codigo do pais + DDD + numero local.
  if (normalized.length < 12) return null
  return normalized
}

const buildWhatsAppLink = (phone: string | null | undefined): string | null => {
  const normalizedPhone = normalizePhoneForWhatsApp(phone)
  if (!normalizedPhone) return null
  return `https://wa.me/${normalizedPhone}`
}

export interface DashboardContentProps {
  consultants: string[]
}

export function DashboardContent({ consultants }: DashboardContentProps) {
  const [activeNicheId, setActiveNicheId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [showSuccess, setShowSuccess] = useState(false)
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([])
  const [lastCreated, setLastCreated] = useState<ScheduleEntry | null>(null)
  const [generatedLeadsByEntryId, setGeneratedLeadsByEntryId] = useState<Record<string, GeneratedLead[]>>({})
  const [globalCounts, setGlobalCounts] = useState<Record<string, number> | null>(null)

  useEffect(() => {
    fetch("/api/leads-availability/all")
      .then(res => res.json())
      .then(data => {
        if (data && data.ok && data.counts) {
          setGlobalCounts(data.counts)
        }
      })
      .catch(() => {})
  }, [])

  const mapNichoForApi = (nichoId: string, uf: string): string => {
    if (nichoId === "empresarios") {
      const u = (uf ?? "").trim().toUpperCase().slice(0, 2)
      if (u === "MS") return "EMPRESAS MS"
      if (u === "MT") return "EMPRESAS MT"
      return "EMPRESAS"
    }
    return nichoId
  }

  const filteredNiches = NICHES.filter((niche) =>
    niche.label.toLowerCase().includes(search.toLowerCase()) ||
    niche.description.toLowerCase().includes(search.toLowerCase())
  )

  const handleNicheSelect = (id: string) => {
    setActiveNicheId(id)
  }

  const handleGenerate = async (
    nicheIds: string[],
    state: string,
    city: string,
    leadCount: number,
    consultantName: string,
  ): Promise<void> => {
    const consultorId = consultants.indexOf(consultantName) + 1
    const quantidade = Math.max(1, leadCount)
    const nichoId = nicheIds[0] ?? ""
    const nicho = mapNichoForApi(nichoId, state)

    if (!consultorId || !nicho || !state) {
      throw new Error("invalid_payload")
    }

    const res = await fetch("/api/gerar-lista", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        consultorId,
        estado: state,
        cidade: city,
        nicho,
        quantidade,
        consultantName,
      }),
    })

    const data = (await res.json().catch(() => null)) as unknown
    if (!res.ok) {
      const msg =
        data && typeof data === "object" && "error" in data
          ? String((data as { error?: unknown }).error)
          : "failed_to_create_list"
      throw new Error(msg)
    }

    if (!data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) {
      throw new Error("failed_to_create_list")
    }

    const leads = (data as { leads?: unknown }).leads
    if (!Array.isArray(leads)) {
      throw new Error("invalid_api_response")
    }
    if (leads.length === 0) {
      throw new Error("no_leads_available")
    }

    const listaIdRaw = (data as { lista?: unknown }).lista
    const listaId =
      listaIdRaw && typeof listaIdRaw === "object" && "id" in listaIdRaw
        ? String((listaIdRaw as { id?: unknown }).id ?? "")
        : ""
    if (!listaId) {
      throw new Error("invalid_api_response")
    }

    const entry: ScheduleEntry = {
      id: listaId,
      niches: nicheIds,
      state,
      city,
      leadCount: leads.length,
      consultantName,
      createdAt: new Date().toISOString(),
    }
    setGeneratedLeadsByEntryId((prev) => ({
      ...prev,
      [entry.id]: leads as GeneratedLead[],
    }))
    setSchedules((prev) => [...prev, entry])
    setLastCreated(entry)
    setShowSuccess(true)
  }

  const handleCheckAvailability = async (
    nicheIds: string[],
    state: string,
    city: string,
  ): Promise<{ total: number; available: number; used: number }> => {
    const nichoId = nicheIds[0] ?? ""
    const nicho = mapNichoForApi(nichoId, state)
    if (!nicho || !state) throw new Error("invalid_payload")

    const res = await fetch("/api/leads-availability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nicho, estado: state, cidade: city }),
    })

    const data = (await res.json().catch(() => null)) as unknown
    if (!res.ok) {
      const msg =
        data && typeof data === "object" && "error" in data
          ? String((data as { error?: unknown }).error)
          : "failed_to_check_availability"
      throw new Error(msg)
    }

    if (!data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) {
      throw new Error("failed_to_check_availability")
    }

    const total = Number((data as { totalMatching?: unknown }).totalMatching ?? NaN)
    const available = Number((data as { unassignedMatching?: unknown }).unassignedMatching ?? NaN)
    const used = Number((data as { assignedMatching?: unknown }).assignedMatching ?? NaN)
    if (!Number.isFinite(total) || !Number.isFinite(available) || !Number.isFinite(used)) {
      throw new Error("invalid_api_response")
    }

    return { total, available, used }
  }

  const handleResetAvailability = async (
    nicheIds: string[],
    state: string,
    city: string,
    resetToken: string,
  ): Promise<{ total: number; available: number; used: number; deletedLinks: number }> => {
    const nichoId = nicheIds[0] ?? ""
    const nicho = mapNichoForApi(nichoId, state)
    if (!nicho || !state || !resetToken) throw new Error("invalid_payload")

    const res = await fetch("/api/leads-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nicho, estado: state, cidade: city, resetToken }),
    })

    const data = (await res.json().catch(() => null)) as unknown
    if (!res.ok) {
      const msg =
        data && typeof data === "object" && "error" in data
          ? String((data as { error?: unknown }).error)
          : "failed_to_reset"
      throw new Error(msg)
    }

    if (!data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) {
      throw new Error("failed_to_reset")
    }

    const total = Number((data as { totalMatching?: unknown }).totalMatching ?? NaN)
    const available = Number((data as { unassignedMatching?: unknown }).unassignedMatching ?? NaN)
    const used = Number((data as { assignedMatching?: unknown }).assignedMatching ?? NaN)
    const deletedLinks = Number((data as { deletedLinks?: unknown }).deletedLinks ?? NaN)
    if (
      !Number.isFinite(total) ||
      !Number.isFinite(available) ||
      !Number.isFinite(used) ||
      !Number.isFinite(deletedLinks)
    ) {
      throw new Error("invalid_api_response")
    }

    return { total, available, used, deletedLinks }
  }

  const handleCloseSuccess = () => {
    setShowSuccess(false)
  }

  const handleNewSchedule = () => {
    setShowSuccess(false)
    setActiveNicheId(null)
  }

  const handleCreatePdf = (entry: ScheduleEntry) => {
    const leads = generatedLeadsByEntryId[entry.id] ?? []
    if (leads.length === 0) {
      throw new Error("no_leads_returned")
    }

    const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()

    const marginX = 30
    const marginTop = 30
    const marginBottom = 30

    const tableX = marginX
    const tableWidth = pageWidth - marginX * 2

    const ufTitle = (entry.state ?? "").trim().toUpperCase().slice(0, 2)
    const cidadeTitle = (entry.city ?? "").trim()
    const title = `${entry.niches.join(" + ").toUpperCase()} - ${cidadeTitle}${cidadeTitle ? " - " : ""}${ufTitle} - ${entry.consultantName.toUpperCase()}`
    doc.setFontSize(12)
    const titleWidth = doc.getTextWidth(title)
    doc.text(title, Math.max(marginX, (pageWidth - titleWidth) / 2), marginTop + 10)

    const headerFill = { r: 16, g: 49, b: 95 }
    const rowAltFill = { r: 232, g: 240, b: 251 }
    const border = { r: 20, g: 20, b: 20 }

    const colRatios = {
      razao: 0.34,
      cidade: 0.18,
      uf: 0.06,
      nome: 0.32,
      whats: 0.10,
    }

    const colW = {
      razao: Math.floor(tableWidth * colRatios.razao),
      cidade: Math.floor(tableWidth * colRatios.cidade),
      uf: Math.floor(tableWidth * colRatios.uf),
      nome: Math.floor(tableWidth * colRatios.nome),
      whats: tableWidth -
        (Math.floor(tableWidth * colRatios.razao) +
          Math.floor(tableWidth * colRatios.cidade) +
          Math.floor(tableWidth * colRatios.uf) +
          Math.floor(tableWidth * colRatios.nome)),
    }

    const colX = {
      razao: tableX,
      cidade: tableX + colW.razao,
      uf: tableX + colW.razao + colW.cidade,
      nome: tableX + colW.razao + colW.cidade + colW.uf,
      whats: tableX + colW.razao + colW.cidade + colW.uf + colW.nome,
    }

    const headerH = 20
    const rowH = 18
    const cellPadX = 4
    const maxRowsPerPdf = 2000

    const truncate = (text: string, maxWidth: number): string => {
      const t = (text ?? "").trim()
      if (!t) return ""
      if (doc.getTextWidth(t) <= maxWidth) return t
      const ell = "..."
      const ellW = doc.getTextWidth(ell)
      let lo = 0
      let hi = t.length
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        const s = t.slice(0, mid)
        if (doc.getTextWidth(s) + ellW <= maxWidth) lo = mid
        else hi = mid - 1
      }
      return t.slice(0, Math.max(0, lo)) + ell
    }

    const drawHeader = (y: number) => {
      doc.setDrawColor(border.r, border.g, border.b)
      doc.setFillColor(headerFill.r, headerFill.g, headerFill.b)
      doc.rect(tableX, y, tableWidth, headerH, "F")

      doc.setTextColor(255, 255, 255)
      doc.setFontSize(10)
      const yText = y + 14
      doc.text("Razao", colX.razao + cellPadX, yText)
      doc.text("Cidade", colX.cidade + cellPadX, yText)
      doc.text("UF", colX.uf + cellPadX, yText)
      doc.text("NOME", colX.nome + cellPadX, yText)
      doc.text("Whats", colX.whats + cellPadX, yText)

      doc.setTextColor(0, 0, 0)

      doc.rect(tableX, y, tableWidth, headerH)
      doc.rect(colX.cidade, y, colW.cidade, headerH)
      doc.rect(colX.uf, y, colW.uf, headerH)
      doc.rect(colX.nome, y, colW.nome, headerH)
      doc.rect(colX.whats, y, colW.whats, headerH)
    }

    let y = marginTop + 25
    drawHeader(y)
    y += headerH

    doc.setFontSize(9)
    const limited = leads.slice(0, maxRowsPerPdf)
    for (let idx = 0; idx < limited.length; idx++) {
      const l = limited[idx]!
      const razao = (l.company ?? l.fantasy ?? "").trim()
      const cidade = (l.city ?? "").trim()
      const uf = (l.state ?? "").trim()
      const nome = (l.name ?? "").trim()
      const whats = String(l.phone ?? "").trim()
      const whatsappNumber = normalizePhoneForWhatsApp(l.phone)
      const whatsappLink = buildWhatsAppLink(l.phone)

      if (y + rowH > pageHeight - marginBottom) {
        doc.addPage()
        y = marginTop
        drawHeader(y)
        y += headerH
      }

      if (idx % 2 === 1) {
        doc.setFillColor(rowAltFill.r, rowAltFill.g, rowAltFill.b)
        doc.rect(tableX, y, tableWidth, rowH, "F")
      }

      doc.setDrawColor(border.r, border.g, border.b)
      doc.rect(tableX, y, tableWidth, rowH)
      doc.rect(colX.cidade, y, colW.cidade, rowH)
      doc.rect(colX.uf, y, colW.uf, rowH)
      doc.rect(colX.nome, y, colW.nome, rowH)
      doc.rect(colX.whats, y, colW.whats, rowH)

      const yText = y + 13
      doc.text(truncate(razao, colW.razao - cellPadX * 2), colX.razao + cellPadX, yText)
      doc.text(truncate(cidade, colW.cidade - cellPadX * 2), colX.cidade + cellPadX, yText)
      doc.text(truncate(uf, colW.uf - cellPadX * 2), colX.uf + cellPadX, yText)
      doc.text(truncate(nome || razao || "(sem nome)", colW.nome - cellPadX * 2), colX.nome + cellPadX, yText)
      const whatsLabel = truncate(whatsappNumber ?? whats, colW.whats - cellPadX * 2)
      if (whatsappLink) {
        doc.setTextColor(0, 102, 204)
        doc.textWithLink(whatsLabel, colX.whats + cellPadX, yText, { url: whatsappLink })
        doc.setTextColor(0, 0, 0)
      } else {
        doc.text(whatsLabel, colX.whats + cellPadX, yText)
      }

      y += rowH
    }

    doc.save(`lista-${entry.id}.pdf`)
  }

  const handleDeleteSchedule = (id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Stats Bar */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
          <LayoutGrid className="size-4 text-primary" />
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{NICHES.length}</span> nichos disponiveis
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5">
          <CalendarDays className="size-4 text-primary" />
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{schedules.length}</span> agendamento{schedules.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Timeline de agendamentos */}
      {schedules.length > 0 && (
        <ScheduleTimeline schedules={schedules} onDelete={handleDeleteSchedule} />
      )}

      {/* Escolha o Nicho */}
      <section className="mb-8">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
            <SlidersHorizontal className="size-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Escolha um Nicho
            </h2>
            <p className="text-xs text-muted-foreground">
              Selecione o nicho desejado para prospectar e gerar sua lista
            </p>
          </div>
        </div>

        {/* Busca */}
        <div className="relative mb-5 max-w-md">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar nichos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary/50 border-border"
          />
        </div>

        {/* Grid de nichos */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredNiches.map((niche) => (
            <NicheCard
              key={niche.id}
              niche={niche}
              selected={false}
              isEmpty={globalCounts ? (globalCounts[niche.id] || 0) === 0 : false}
              onSelect={handleNicheSelect}
            />
          ))}
        </div>

        {filteredNiches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="size-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhum nicho encontrado para &quot;{search}&quot;
            </p>
          </div>
        )}
      </section>

      {/* Modal de Nicho */}
      <NicheModal
        isOpen={!!activeNicheId}
        onClose={() => setActiveNicheId(null)}
        activeNicheId={activeNicheId}
        onGenerate={handleGenerate}
        onCheckAvailability={handleCheckAvailability}
        onResetAvailability={handleResetAvailability}
        consultants={consultants}
      />

      {lastCreated && (
        <SuccessDialog
          open={showSuccess}
          onClose={handleCloseSuccess}
          entry={lastCreated}
          onNewSchedule={handleNewSchedule}
          onCreatePdf={handleCreatePdf}
        />
      )}
    </div>
  )
}
