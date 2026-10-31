"use client"

import { useCallback, useEffect, useState } from "react"
import { RotateCcw, Save, ShieldCheck } from "lucide-react"

type ConsultantQuotaRow = {
  crmUserId: string
  name: string
  supervisorId: string
  used: number
  monthlyLimit: number
}

export function ConsultantQuotaPanel() {
  const [rows, setRows] = useState<ConsultantQuotaRow[]>([])
  const [limits, setLimits] = useState<Record<string, string>>({})
  const [supervisorsCanSeeCounts, setSupervisorsCanSeeCounts] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/consultant-quotas", { credentials: "include", cache: "no-store" })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Falha ao carregar limites")
      const nextRows = Array.isArray(data.consultants) ? data.consultants as ConsultantQuotaRow[] : []
      setRows(nextRows)
      setLimits(Object.fromEntries(nextRows.map((row) => [row.crmUserId, String(row.monthlyLimit)])))
      setSupervisorsCanSeeCounts(data.supervisorsCanSeeCounts !== false)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar limites")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const update = async (body: Record<string, unknown>, rowId: string) => {
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
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Falha ao atualizar limite")
      setNotice("Configuração atualizada.")
      await load()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Falha ao atualizar limite")
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-secondary/20 p-4 text-left">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Limites e visibilidade dos leads</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Somente donos do CRM podem alterar estas regras. Zerar o contador mensal preserva todas as listas e os leads já entregues.
          </p>
        </div>
      </div>

      <label className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 p-3">
        <span className="text-sm">Supervisores podem ver os totais globais disponíveis</span>
        <input
          type="checkbox"
          checked={supervisorsCanSeeCounts}
          disabled={busy !== null || loading}
          onChange={(event) => {
            const enabled = event.target.checked
            setSupervisorsCanSeeCounts(enabled)
            void update({ supervisorsCanSeeCounts: enabled }, "visibility")
          }}
          className="size-4 accent-primary"
        />
      </label>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Supervisores sempre veem somente a própria equipe. Consultores não entram no painel; eles recebem as listas pelo CRM.
      </p>

      <div className="mt-5 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-secondary/70 text-xs text-muted-foreground">
            <tr><th className="p-3">Consultor</th><th className="p-3">Usados neste mês</th><th className="p-3">Limite mensal</th><th className="p-3">Ações</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.crmUserId} className="border-t border-border">
                <td className="p-3 font-medium">{row.name}</td>
                <td className="p-3">{row.used}</td>
                <td className="p-3">
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={limits[row.crmUserId] ?? String(row.monthlyLimit)}
                    onChange={(event) => setLimits((current) => ({ ...current, [row.crmUserId]: event.target.value }))}
                    className="h-9 w-28 rounded-md border border-border bg-background px-2"
                    disabled={busy !== null}
                    aria-label={`Limite mensal de ${row.name}`}
                  />
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void update({ crmUserId: row.crmUserId, monthlyLimit: Number(limits[row.crmUserId]) }, row.crmUserId)}
                      disabled={busy !== null || Number(limits[row.crmUserId]) === row.monthlyLimit}
                      className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    ><Save className="size-3.5" />Salvar</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Zerar o contador mensal de ${row.name}? As listas e os leads já entregues serão preservados.`)) {
                          void update({ crmUserId: row.crmUserId, resetUsage: true }, row.crmUserId)
                        }
                      }}
                      disabled={busy !== null || row.used === 0}
                      className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-semibold disabled:opacity-50"
                    ><RotateCcw className="size-3.5" />Zerar contador</button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="p-5 text-center text-sm text-muted-foreground">Nenhum consultor ativo encontrado no CRM.</td></tr>}
          </tbody>
        </table>
      </div>
      {loading && <p className="mt-3 text-xs text-muted-foreground">Carregando consultores...</p>}
      {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-3 text-xs text-emerald-600">{notice}</p>}
    </section>
  )
}
