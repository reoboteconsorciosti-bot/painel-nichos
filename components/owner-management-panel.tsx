"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Check,
  Eye,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Target,
  TrendingUp,
  Users,
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type ConsultantQuotaRow = {
  crmUserId: string
  name: string
  supervisorId: string
  supervisorName?: string
  teamId?: string | null
  teamName?: string
  used: number
  monthlyLimit: number
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  return (parts[0]?.[0] ?? "C").toUpperCase()
}

export function OwnerManagementPanel() {
  // Quotas & Consultants state
  const [rows, setRows] = useState<ConsultantQuotaRow[]>([])
  const [limits, setLimits] = useState<Record<string, string>>({})
  const [supervisorsCanSeeCounts, setSupervisorsCanSeeCounts] = useState(true)
  const [search, setSearch] = useState("")
  const [teamFilter, setTeamFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  // WhatsApp notification state
  const [notifyNumber, setNotifyNumber] = useState("")
  const [notifyLoading, setNotifyLoading] = useState(true)
  const [notifySaving, setNotifySaving] = useState(false)
  const [notifySaved, setNotifySaved] = useState(false)
  const [notifyError, setNotifyError] = useState("")

  // Load Quotas
  const loadQuotas = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/consultant-quotas", { credentials: "include", cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Falha ao carregar consultores")
      const nextRows = Array.isArray(data.consultants) ? (data.consultants as ConsultantQuotaRow[]) : []
      setRows(nextRows)
      setLimits(Object.fromEntries(nextRows.map((row) => [row.crmUserId, String(row.monthlyLimit)])))
      setSupervisorsCanSeeCounts(data.supervisorsCanSeeCounts !== false)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar consultores")
    } finally {
      setLoading(false)
    }
  }, [])

  // Load WhatsApp settings
  const loadWhatsApp = useCallback(async () => {
    setNotifyLoading(true)
    setNotifyError("")
    try {
      const response = await fetch("/api/admin/whatsapp-notify", { credentials: "include", cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error("Falha ao carregar número de notificação")
      setNotifyNumber(String(data.value ?? ""))
    } catch (loadError) {
      setNotifyError(loadError instanceof Error ? loadError.message : "Falha ao carregar configurações")
    } finally {
      setNotifyLoading(false)
    }
  }, [])

  const loadAll = useCallback(() => {
    void loadQuotas()
    void loadWhatsApp()
  }, [loadQuotas, loadWhatsApp])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Update Quotas / Visibility
  const updateQuota = async (body: Record<string, unknown>, rowId: string, successMessage = "Salvo com sucesso") => {
    setBusy(rowId)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/admin/consultant-quotas", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Falha ao salvar alteração")
      setNotice(successMessage)
      await loadQuotas()
      setTimeout(() => setNotice(""), 3000)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Falha ao salvar alteração")
    } finally {
      setBusy(null)
    }
  }

  // Save WhatsApp number
  const saveWhatsApp = async () => {
    setNotifySaving(true)
    setNotifyError("")
    setNotifySaved(false)
    try {
      const response = await fetch("/api/admin/whatsapp-notify", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: notifyNumber }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error("Não foi possível salvar o número.")
      setNotifyNumber(String(data.value ?? ""))
      setNotifySaved(true)
      setTimeout(() => setNotifySaved(false), 3000)
    } catch (saveError) {
      setNotifyError(saveError instanceof Error ? saveError.message : "Erro ao salvar número.")
    } finally {
      setNotifySaving(false)
    }
  }

  // Filtered rows & options
  const teams = useMemo(
    () => Array.from(new Set(rows.map((row) => row.teamName || "Equipe sem nome"))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rows],
  )

  const filteredRows = useMemo(() => {
    const query = normalizeSearch(search)
    return rows
      .filter((row) => {
        const team = row.teamName || "Equipe sem nome"
        const matchesTeam = teamFilter === "all" || teamFilter === team
        const searchable = normalizeSearch(`${row.name} ${row.supervisorName ?? ""} ${team}`)
        return matchesTeam && (!query || searchable.includes(query))
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  }, [rows, search, teamFilter])

  const totalUsed = useMemo(() => rows.reduce((acc, row) => acc + row.used, 0), [rows])
  const totalLimits = useMemo(() => rows.reduce((acc, row) => acc + row.monthlyLimit, 0), [rows])

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* 1. CABEÇALHO */}
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Painel Administrativo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Controle de limites de leads, visibilidade e configurações gerais do sistema.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Integrado ao CRM
          </span>
          <button
            type="button"
            onClick={loadAll}
            disabled={loading || notifyLoading || busy !== null}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", (loading || notifyLoading) && "animate-spin")} />
            Atualizar
          </button>
        </div>
      </header>

      {/* 2. KPIS / MÉTRICAS PRINCIPAIS */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Consultores Ativos</span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{rows.length}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Leads Usados no Mês</span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{totalUsed.toLocaleString("pt-BR")}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Capacidade Total Alocada</span>
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <Target className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{totalLimits.toLocaleString("pt-BR")}</p>
        </div>
      </div>

      {/* 3. CONFIGURAÇÕES RÁPIDAS (2 CARDS OBJETIVOS) */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Card: Visibilidade de Leads */}
        <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <Eye className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Totais Globais para Supervisores</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Permite que supervisores visualizem a disponibilidade global de leads no painel.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs font-medium text-foreground">
              {supervisorsCanSeeCounts ? "Visibilidade liberada" : "Visibilidade oculta"}
            </span>
            <Switch
              checked={supervisorsCanSeeCounts}
              disabled={busy !== null || loading}
              onCheckedChange={(checked) => {
                setSupervisorsCanSeeCounts(checked)
                void updateQuota({ supervisorsCanSeeCounts: checked }, "visibility", "Visibilidade atualizada")
              }}
              aria-label="Alternar visibilidade global para supervisores"
            />
          </div>
        </div>

        {/* Card: WhatsApp de Notificações */}
        <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">WhatsApp para Avisos</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Número de destino para alertas automáticos ao finalizar listas.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
            <input
              type="tel"
              inputMode="numeric"
              value={notifyNumber}
              onChange={(e) => {
                setNotifyNumber(e.target.value)
                setNotifySaved(false)
              }}
              placeholder="Ex.: 5511999999999"
              disabled={notifyLoading || notifySaving}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Número de WhatsApp para avisos"
            />
            <button
              type="button"
              onClick={() => void saveWhatsApp()}
              disabled={notifyLoading || notifySaving}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50"
            >
              {notifySaved ? <Check className="size-3.5" /> : <Save className="size-3.5" />}
              {notifySaving ? "Salvando..." : notifySaved ? "Salvo" : "Salvar"}
            </button>
          </div>
          {notifyError && <p className="mt-1.5 text-xs text-destructive">{notifyError}</p>}
        </div>
      </div>

      {/* 4. TABELA DE CONSULTORES E LIMITES */}
      <section className="rounded-xl border border-border bg-card shadow-sm">
        {/* Toolbar de filtros */}
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Limites por Consultor</h2>
            <Badge variant="secondary" className="text-xs">
              {filteredRows.length} {filteredRows.length === 1 ? "consultor" : "consultores"}
            </Badge>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou equipe..."
                className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">Todas as equipes</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabela de Consultores */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                <th className="px-4 py-3 font-medium">Consultor</th>
                <th className="px-4 py-3 font-medium">Equipe</th>
                <th className="px-4 py-3 font-medium">Supervisor</th>
                <th className="px-4 py-3 font-medium min-w-[180px]">Uso no Mês</th>
                <th className="px-4 py-3 font-medium text-center">Limite Mensal</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((row) => {
                const nextLimit = Number(limits[row.crmUserId])
                const limitIsValid = Number.isSafeInteger(nextLimit) && nextLimit >= 1 && nextLimit <= 10000
                const isLimitChanged = limitIsValid && nextLimit !== row.monthlyLimit
                const usagePercent = row.monthlyLimit > 0 ? Math.min(100, Math.round((row.used / row.monthlyLimit) * 100)) : 0

                return (
                  <tr key={row.crmUserId} className="transition-colors hover:bg-muted/20">
                    {/* Consultor */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                          {getInitials(row.name)}
                        </div>
                        <span className="font-semibold text-foreground">{row.name}</span>
                      </div>
                    </td>

                    {/* Equipe */}
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="inline-block rounded-md bg-secondary/80 px-2 py-0.5 text-[11px] font-medium text-foreground">
                        {row.teamName || "—"}
                      </span>
                    </td>

                    {/* Supervisor */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.supervisorName || "—"}
                    </td>

                    {/* Consumo */}
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-foreground">
                            {row.used.toLocaleString("pt-BR")} / {row.monthlyLimit.toLocaleString("pt-BR")}
                          </span>
                          <span
                            className={cn(
                              "font-medium",
                              usagePercent >= 100
                                ? "text-rose-400"
                                : usagePercent >= 75
                                  ? "text-amber-400"
                                  : "text-muted-foreground",
                            )}
                          >
                            {usagePercent}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-300",
                              usagePercent >= 100
                                ? "bg-rose-500"
                                : usagePercent >= 75
                                  ? "bg-amber-500"
                                  : "bg-primary",
                            )}
                            style={{ width: `${usagePercent}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Limite input */}
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={limits[row.crmUserId] ?? String(row.monthlyLimit)}
                        onChange={(e) =>
                          setLimits((prev) => ({ ...prev, [row.crmUserId]: e.target.value }))
                        }
                        disabled={busy !== null}
                        className="h-8 w-24 rounded-md border border-border bg-background px-2 text-center text-xs font-semibold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                        aria-label={`Limite de ${row.name}`}
                      />
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            void updateQuota(
                              { crmUserId: row.crmUserId, monthlyLimit: nextLimit },
                              row.crmUserId,
                              `Limite de ${row.name} atualizado`,
                            )
                          }
                          disabled={busy !== null || !isLimitChanged}
                          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-all hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Salvar novo limite"
                        >
                          <Save className="size-3" />
                          Salvar
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Zerar o consumo deste mês de ${row.name}?`)) {
                              void updateQuota(
                                { crmUserId: row.crmUserId, resetUsage: true },
                                row.crmUserId,
                                `Uso de ${row.name} zerado`,
                              )
                            }
                          }}
                          disabled={busy !== null || row.used === 0}
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Zerar consumo acumulado do mês"
                        >
                          <RotateCcw className="size-3" />
                          Zerar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">
                    {rows.length === 0
                      ? "Nenhum consultor ativo encontrado no CRM."
                      : "Nenhum consultor corresponde aos filtros aplicados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Notificações e status */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs">
          <div>
            {loading && <span className="text-muted-foreground">Carregando dados...</span>}
            {notice && <span className="text-emerald-500 font-medium">{notice}</span>}
            {error && <span className="text-destructive font-medium">{error}</span>}
          </div>
          <span className="text-muted-foreground">
            {rows.length} {rows.length === 1 ? "consultor vinculado" : "consultores vinculados"}
          </span>
        </div>
      </section>
    </div>
  )
}

export { OwnerManagementPanel as ConsultantQuotaPanel }
