"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowDownToLine, LoaderCircle, Sparkles, Zap } from "lucide-react"
import * as XLSX from "xlsx"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type CampaignData = {
  campaign: { id: number; year: number; name: string; endsAt: string } | null
  consultants: Array<{ id: string; name: string; supervisorId: string }>
  available: number | null
  countsVisible: boolean
  allocations: Array<{
    id: number
    assignedAt: string
    crmStatus: string
    crmError: string | null
    consultant: { id: string; name: string }
    lead: { id: number; name: string | null; phone: string | null; city: string | null; state: string | null; company: string | null; fantasy: string | null }
  }>
}

const CRM_STATUS_LABELS: Record<string, string> = {
  pending: "Enviando",
  sent: "Transferido",
  created: "Negócio criado",
  partial: "Transferido com aviso",
  not_transferred: "Não transferido",
  already_distributed: "Já distribuído",
  error: "Com erro",
}
const crmStatusLabel = (status: string) => CRM_STATUS_LABELS[status] ?? "Não enviado"

export function BlackFridayPanel() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<CampaignData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedConsultant, setSelectedConsultant] = useState("")
  const [quantity, setQuantity] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const refresh = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError("")
    }
    try {
      const response = await fetch("/api/black-friday", { credentials: "include", cache: "no-store" })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Não foi possível carregar a campanha.")
      setData(result as CampaignData)
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a campanha.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // Enquanto houver envio em andamento, o histórico se atualiza sozinho.
  const sending = open && !!data?.allocations.some((allocation) => allocation.crmStatus === "pending")
  useEffect(() => {
    if (!sending) return
    const timer = setInterval(() => void refresh(true), 10_000)
    return () => clearInterval(timer)
  }, [sending, refresh])

  const maxQuantity = data?.available ?? null
  const formattedDate = useMemo(() => {
    if (!data?.campaign?.endsAt) return ""
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(data.campaign.endsAt))
  }, [data?.campaign?.endsAt])

  const handleAssign = async () => {
    setError("")
    setNotice("")
    const numericQuantity = Number(quantity)
    if (!selectedConsultant || !Number.isSafeInteger(numericQuantity) || numericQuantity < 1) {
      setError("Escolha um consultor e informe uma quantidade válida.")
      return
    }
    if (maxQuantity !== null && numericQuantity > maxQuantity) {
      setError(`Há ${maxQuantity} leads disponíveis para esta campanha.`)
      return
    }
    setSubmitting(true)
    try {
      const response = await fetch("/api/black-friday", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          consultantId: selectedConsultant,
          quantity: numericQuantity,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) {
        const friendlyError = result.error === "no_leads_available"
          ? "Não há mais leads disponíveis. Atualize a campanha para conferir a quantidade."
          : result.error === "consultant_outside_team"
            ? "Esse consultor não está mais disponível para sua equipe. Atualize a tela e escolha outro."
            : result.error === "crm_unavailable"
              ? "Não foi possível falar com o CRM agora. Nada foi enviado. Tente de novo em instantes e, se continuar, avise o administrador."
            : result.error === "consultant_crm_id_missing"
              ? "Esse consultor não está vinculado a um usuário do CRM. Nada foi enviado. Avise o administrador."
            : result.error === "campaign_not_active"
              ? "A campanha não está ativa neste momento. Atualize a tela ou fale com o administrador."
              : result.error === "failed_to_assign_leads"
                ? "Não conseguimos confirmar a importação. Confira a lista de leads antes de tentar novamente."
                : result.error ?? "Não foi possível importar os leads."
        throw new Error(friendlyError)
      }
      setNotice(`${result.leads.length} leads enviados para ${result.consultant.name}. O resultado aparece no histórico abaixo.`)
      setQuantity("")
      await refresh(true)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao importar os leads.")
    } finally {
      setSubmitting(false)
    }
  }

  const exportAllocations = () => {
    if (!data?.allocations.length) return
    const rows = data.allocations.map(({ lead, consultant, assignedAt, crmStatus, crmError }) => ({
      Consultor: consultant.name,
      Nome: lead.name ?? "",
      Telefone: lead.phone ?? "",
      Cidade: lead.city ?? "",
      UF: lead.state ?? "",
      Empresa: lead.company ?? lead.fantasy ?? "",
      "Liberado em": new Date(assignedAt).toLocaleString("pt-BR"),
      Resultado: crmStatusLabel(crmStatus),
      Motivo: crmError ?? "",
    }))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Black Friday")
    XLSX.writeFile(workbook, `black-friday-${data.campaign?.year ?? "campanha"}.xlsx`)
  }

  if (loading || !data?.campaign) {
    return (
      <div className="flex min-h-[280px] w-full flex-col justify-between rounded-2xl border border-amber-400/25 bg-card p-6 shadow-lg">
        <div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-400/10">
            <Sparkles className="size-6 text-amber-400" />
          </div>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-amber-300/80">Campanha sazonal</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Black Friday</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {loading
              ? "Verificando a campanha..."
              : error
                ? error === "failed_to_load_campaign"
                  ? "Falha ao carregar a campanha. Confira as migrações no banco de produção e os logs do painel."
                  : error
                : "Não há campanha ativa. Confira se ela foi cadastrada e se as datas estão vigentes."}
          </p>
        </div>
        {!loading && (
          <button type="button" onClick={() => void refresh()} className="mt-4 self-start rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary">
            Tentar novamente
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); void refresh(true); setError(""); setNotice("") }}
        className="group relative flex h-[280px] w-full flex-col justify-between overflow-hidden rounded-2xl border border-amber-400/25 bg-card p-6 text-left shadow-lg transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:border-amber-300/50 hover:shadow-2xl"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent opacity-80 transition-opacity group-hover:opacity-100" />
        <div className="relative z-10 flex w-full items-start justify-between">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-300/20 bg-background/70 shadow-sm">
              <Sparkles className="size-6 text-amber-400" />
            </div>
            <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-amber-300/80">Campanha sazonal</p>
          </div>
          <span className="rounded-full border border-amber-300/20 bg-background/50 px-2.5 py-1 text-xs font-semibold text-amber-200">{data.campaign.year}</span>
        </div>
        <div className="relative z-10 flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Black Friday</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">Libere leads da campanha para os consultores da sua equipe.</p>
          {data.available !== null && <span className="mt-2 self-start rounded-lg border border-amber-300/20 bg-background/50 px-4 py-2 text-xs font-semibold text-amber-100">{data.available.toLocaleString("pt-BR")} disponiveis</span>}
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl"><Sparkles className="size-5 text-amber-400" />{data.campaign.name}</DialogTitle>
            <DialogDescription>{data.available !== null && `${data.available.toLocaleString("pt-BR")} leads disponíveis · `}Até {formattedDate}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              <label className="space-y-2 text-sm font-medium">
                Consultor
                <select value={selectedConsultant} onChange={(event) => setSelectedConsultant(event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" disabled={submitting}>
                  <option value="">Selecione um consultor</option>
                  {data.consultants.map((consultant) => <option key={consultant.id} value={consultant.id}>{consultant.name}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium">
                Quantidade
                <input type="number" min={1} max={maxQuantity ?? undefined} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Ex.: 50" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" disabled={submitting || maxQuantity === 0} />
              </label>
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="text-sm text-emerald-500">{notice}</p>}
            <button type="button" onClick={handleAssign} disabled={submitting || data.consultants.length === 0 || !selectedConsultant || !quantity || maxQuantity === 0} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Zap className="size-4" />}
              {submitting ? "Importando…" : "Importar no CRM"}
            </button>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Histórico de envios ({data.allocations.length})</h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <button type="button" onClick={exportAllocations} disabled={data.allocations.length === 0} className="flex items-center gap-1 underline underline-offset-4 disabled:opacity-50"><ArrowDownToLine className="size-3.5" />Exportar</button>
              </div>
            </div>
            {data.allocations.length === 0 ? <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhum envio ainda.</p> : (
              <div className="max-h-64 overflow-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-secondary text-muted-foreground"><tr><th className="p-2">Consultor</th><th className="p-2">Lead</th><th className="p-2">Telefone</th><th className="p-2">Resultado</th></tr></thead>
                  <tbody>{data.allocations.map((allocation) => <tr key={allocation.id} className="border-t border-border"><td className="p-2">{allocation.consultant.name}</td><td className="p-2">{allocation.lead.name ?? "—"}</td><td className="p-2">{allocation.lead.phone ?? "—"}</td><td className="p-2">{crmStatusLabel(allocation.crmStatus)}{allocation.crmError && <p className="mt-1 max-w-64 text-muted-foreground">{allocation.crmError}</p>}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        </DialogContent>
      </Dialog>
    </>
  )
}
