"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowDownToLine, CalendarDays, Check, LoaderCircle, Sparkles, Users, Zap } from "lucide-react"
import * as XLSX from "xlsx"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

type CampaignData = {
  campaign: { id: number; year: number; name: string; endsAt: string } | null
  consultants: Array<{ id: string; name: string; supervisorId: string }>
  available: number | null
  countsVisible: boolean
  allocations: Array<{
    id: number
    assignedAt: string
    crmStatus: string
    consultant: { id: string; name: string }
    lead: { id: number; name: string | null; phone: string | null; city: string | null; state: string | null; company: string | null; fantasy: string | null }
  }>
}

export function BlackFridayPanel() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<CampaignData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedConsultant, setSelectedConsultant] = useState("")
  const [quantity, setQuantity] = useState("")
  const [sendToCrm, setSendToCrm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/black-friday", { credentials: "include", cache: "no-store" })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Não foi possível carregar a campanha.")
      setData(result as CampaignData)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a campanha.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

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
          sendToCrm,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error === "no_leads_available" ? "Não há mais leads disponíveis." : result.error ?? "Falha ao liberar os leads.")
      const crm = result.crm as { configured?: boolean; queuedCount?: number; createdCount?: number; ignoredCount?: number; warnings?: string[] } | null
      setNotice(sendToCrm
        ? crm?.configured
          ? crm.queuedCount ? `${result.leads.length} leads liberados. ${crm.queuedCount} envios na fila do CRM. Acompanhe no painel.` : `${result.leads.length} leads liberados. ${crm.createdCount ?? 0} negócios criados no CRM e ${crm.ignoredCount ?? 0} não criados.${crm.warnings?.length ? ` Aviso: ${crm.warnings.join(", ")}` : ""}`
          : `${result.leads.length} leads liberados, mas o CRM não está configurado neste ambiente.`
        : `${result.leads.length} leads liberados para ${result.consultant.name}.`)
      setQuantity("")
      await refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao liberar os leads.")
    } finally {
      setSubmitting(false)
    }
  }

  const exportAllocations = () => {
    if (!data?.allocations.length) return
    const rows = data.allocations.map(({ lead, consultant, assignedAt, crmStatus }) => ({
      Consultor: consultant.name,
      Nome: lead.name ?? "",
      Telefone: lead.phone ?? "",
      Cidade: lead.city ?? "",
      UF: lead.state ?? "",
      Empresa: lead.company ?? lead.fantasy ?? "",
      "Liberado em": new Date(assignedAt).toLocaleString("pt-BR"),
      "Status CRM": crmStatus,
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
  const selectedCount = Number(quantity)

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setSendToCrm(false); setError(""); setNotice("") }}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl"><Sparkles className="size-5 text-amber-400" />{data.campaign.name}</DialogTitle>
            <DialogDescription>Escolha um consultor da sua equipe e a quantidade de leads que deseja liberar. A campanha não pede estado ou cidade.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-4 rounded-xl border border-border bg-secondary/20 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-medium">
                  Consultor da equipe
                  <select value={selectedConsultant} onChange={(event) => setSelectedConsultant(event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" disabled={submitting}>
                    <option value="">Selecione um consultor</option>
                    {data.consultants.map((consultant) => <option key={consultant.id} value={consultant.id}>{consultant.name}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Quantidade de leads
                  <input type="number" min={1} max={maxQuantity ?? undefined} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Ex.: 50" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" disabled={submitting || maxQuantity === 0} />
                </label>
              </div>
              {data.available !== null ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="size-4" />Disponiveis: {data.available.toLocaleString("pt-BR")}</div> : <p className="text-xs text-muted-foreground">A quantidade disponivel foi ocultada pelo proprietario. O sistema validara a liberacao.</p>}

              <div className="flex items-start gap-3 rounded-lg border border-border bg-background/60 p-3">
                <Checkbox id="black-friday-send-crm" checked={sendToCrm} onCheckedChange={(checked) => setSendToCrm(checked === true)} disabled={submitting} />
                <div className="space-y-1">
                  <Label htmlFor="black-friday-send-crm" className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Zap className="size-4 text-amber-400" />Enviar para o CRM</Label>
                  <p className="text-xs text-muted-foreground">Os leads serão liberados mesmo se o CRM estiver indisponível.</p>
                </div>
              </div>
              {sendToCrm && <p className="text-xs text-muted-foreground">O consultor escolhido recebe os contatos e os negócios no CRM. Acompanhe o envio no painel.</p>}

              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              {notice && <p role="status" className="text-sm text-emerald-500">{notice}</p>}
              <button type="button" onClick={handleAssign} disabled={submitting || data.consultants.length === 0 || !selectedConsultant || maxQuantity === 0} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? <LoaderCircle className="size-4 animate-spin" /> : sendToCrm ? <Zap className="size-4" /> : <Check className="size-4" />}
                {submitting ? "Liberando leads…" : sendToCrm ? "Liberar e enviar ao CRM" : "Liberar leads"}
              </button>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disponibilidade</p>
                {data.available !== null ? <>
                  <p className="mt-2 text-3xl font-bold">{data.available.toLocaleString("pt-BR")}</p>
                  <p className="text-sm text-muted-foreground">leads para distribuir</p>
                </> : <p className="mt-2 text-sm text-muted-foreground">Quantidade disponivel oculta pelo proprietario.</p>}
                <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-4" />Campanha até {formattedDate}</div>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Users className="size-4" />{data.consultants.length} consultores na equipe</div>
              </div>
              <button type="button" onClick={exportAllocations} disabled={data.allocations.length === 0} className="flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium disabled:opacity-50"><ArrowDownToLine className="size-4" />Exportar liberações</button>
            </div>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Leads liberados pela equipe ({data.allocations.length})</h3>
              <button type="button" onClick={() => void refresh()} className="text-xs text-muted-foreground underline underline-offset-4">Atualizar</button>
            </div>
            {data.allocations.length === 0 ? <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhum lead liberado ainda.</p> : (
              <div className="max-h-64 overflow-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-secondary text-muted-foreground"><tr><th className="p-2">Consultor</th><th className="p-2">Lead</th><th className="p-2">Telefone</th><th className="p-2">CRM</th></tr></thead>
                  <tbody>{data.allocations.map((allocation) => <tr key={allocation.id} className="border-t border-border"><td className="p-2">{allocation.consultant.name}</td><td className="p-2">{allocation.lead.name ?? "—"}</td><td className="p-2">{allocation.lead.phone ?? "—"}</td><td className="p-2">{allocation.crmStatus === "sent" ? "Enviado" : allocation.crmStatus === "partial" ? "Parcial" : allocation.crmStatus === "error" ? "Com erro" : allocation.crmStatus === "pending" ? "Pendente" : "—"}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        </DialogContent>
      </Dialog>
    </>
  )
}
