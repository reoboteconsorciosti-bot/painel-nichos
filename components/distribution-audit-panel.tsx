"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ClipboardList, LoaderCircle, RefreshCw, Search } from "lucide-react"
import { NICHES } from "@/lib/data"

type AuditEntry = {
  id: number
  action: "LIST" | "BLACK_FRIDAY"
  requestedById: string
  requestedByName: string
  requestedByEmail: string | null
  requestedByRole: string
  consultantId: string
  consultantCrmId: string | null
  consultantName: string
  niche: string
  quantity: number
  state: string | null
  city: string | null
  crmRequested: boolean
  listId: number | null
  campaignId: number | null
  campaignName: string | null
  createdAt: string
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Cuiaba",
  }).format(new Date(value))
}

function formatNiche(value: string) {
  if (value.startsWith("black-friday-")) return `Black Friday ${value.slice(-4)}`
  return NICHES.find(niche => niche.id === value)?.label ?? value
}

export function DistributionAuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState<"all" | "LIST" | "BLACK_FRIDAY">("all")
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")

  const loadPage = useCallback(async (beforeId?: number, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError("")
    try {
      const query = beforeId ? `?beforeId=${beforeId}` : ""
      const response = await fetch(`/api/distribution-audit${query}`, { credentials: "include", cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error ?? "audit_unavailable")
      const page = Array.isArray(data.entries) ? data.entries as AuditEntry[] : []
      setEntries(current => append ? [...current, ...page] : page)
      setNextBeforeId(typeof data.nextBeforeId === "number" ? data.nextBeforeId : null)
    } catch {
      setError("Não foi possível carregar o histórico. Tente novamente.")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => { void loadPage() }, [loadPage])

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR")
    return entries.filter(entry => {
      if (actionFilter !== "all" && entry.action !== actionFilter) return false
      if (!term) return true
      return [entry.requestedByName, entry.requestedByEmail, entry.consultantName, entry.niche, entry.city, entry.state, entry.campaignName]
        .some(value => value?.toLocaleLowerCase("pt-BR").includes(term))
    })
  }, [actionFilter, entries, search])

  return (
    <section className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Rastreamento de distribuição</p>
          <h2 className="text-3xl font-semibold tracking-tight">Auditoria de listas</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Veja quem solicitou cada distribuição, qual consultor recebeu os leads e de qual nicho.</p>
        </div>
        <button type="button" onClick={() => void loadPage()} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition hover:bg-secondary disabled:opacity-50">
          {loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Atualizar
        </button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar solicitante, consultor ou nicho..." className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </label>
        <select value={actionFilter} onChange={event => setActionFilter(event.target.value as typeof actionFilter)} aria-label="Filtrar tipo de distribuição" className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="all">Todas as distribuições</option>
          <option value="LIST">Listas</option>
          <option value="BLACK_FRIDAY">Black Friday</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm">
          <span className="font-semibold">Registros</span>
          <span className="text-xs text-muted-foreground">{filteredEntries.length} nesta página</span>
        </div>
        {error && <div role="alert" className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Carregando histórico...</div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <ClipboardList className="size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">{entries.length ? "Nenhum registro corresponde à busca." : "Ainda não há registros de auditoria."}</p>
            <p className="mt-1 max-w-lg text-xs text-muted-foreground">O histórico começa a registrar distribuições após a implantação desta atualização. As listas anteriores não guardavam quem fez a solicitação.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Solicitado por</th>
                  <th className="px-4 py-3 font-medium">Consultor</th>
                  <th className="px-4 py-3 font-medium">Nicho</th>
                  <th className="px-4 py-3 font-medium">Quantidade</th>
                  <th className="px-4 py-3 font-medium">Origem / local</th>
                  <th className="px-4 py-3 font-medium">CRM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-muted/20">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(entry.createdAt)}</td>
                    <td className="px-4 py-3"><p className="font-medium">{entry.requestedByName}</p><p className="text-xs text-muted-foreground">{entry.requestedByEmail || (entry.requestedByRole === "admin" ? "Administrador" : "Supervisor")}</p></td>
                    <td className="px-4 py-3 font-medium">{entry.consultantName}</td>
                    <td className="px-4 py-3"><div className="font-medium">{formatNiche(entry.niche)}</div>{entry.campaignName && entry.action !== "BLACK_FRIDAY" && <div className="text-xs text-muted-foreground">{entry.campaignName}</div>}</td>
                    <td className="px-4 py-3">{entry.quantity.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3 text-muted-foreground">{entry.action === "BLACK_FRIDAY" ? "Black Friday" : [entry.city, entry.state].filter(Boolean).join(" / ") || "Lista"}</td>
                    <td className="px-4 py-3"><span className={entry.crmRequested ? "rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-400" : "rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"}>{entry.crmRequested ? "Solicitado" : "Não solicitado"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nextBeforeId !== null && <div className="flex justify-center"><button type="button" onClick={() => void loadPage(nextBeforeId, true)} disabled={loadingMore} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-secondary disabled:opacity-50">{loadingMore && <LoaderCircle className="size-4 animate-spin" />}Carregar registros anteriores</button></div>}
    </section>
  )
}
