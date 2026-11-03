"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"

type Status = { counts: Record<string, number>; problems: Array<{ id: number; listaId: number | null; error: string }>; warnings: Array<{ id: number; listaId: number | null; warnings: string[] }> }

export function CrmDeliveryStatus() {
  const [status, setStatus] = useState<Status | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch("/api/crm/deliveries", { cache: "no-store" })
        const data = await response.json()
        if (!response.ok || !data.ok) throw new Error()
        if (!cancelled) { setStatus(data); setUnavailable(false) }
      } catch { if (!cancelled) setUnavailable(true) }
    }
    void load()
    const timer = setInterval(load, 10_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])
  if (!status) return unavailable ? <p className="mb-4 text-xs text-muted-foreground">Acompanhamento de envios ao CRM indisponível no momento.</p> : null
  const pending = (status.counts.pending ?? 0) + (status.counts.sending ?? 0)
  const failed = (status.counts.failed ?? 0) + (status.counts.needs_review ?? 0)
  if (!pending && !failed && !status.counts.sent) return null
  return (
    <div className="mb-6 space-y-2 rounded-xl border border-border bg-card p-4" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold">{pending > 0 && <RefreshCw className="size-4 animate-spin text-primary" />}Negócios no CRM</p>
      <p className="text-xs text-muted-foreground">{status.counts.sent ?? 0} enviados{pending > 0 && ` · ${pending} na fila`}{failed > 0 && ` · ${failed} precisam de atenção`}</p>
      {pending > 0 && <p className="text-xs text-muted-foreground">O envio continua em segundo plano. Você pode sair desta tela.</p>}
      {(failed > 0 || status.warnings.length > 0) && <details className="text-xs"><summary className="cursor-pointer">Ver avisos</summary><ul className="mt-2 space-y-2">{status.problems.map(p => <li key={p.id}>{p.listaId ? `Lista ${p.listaId}` : "Campanha"}: {p.error}</li>)}{status.warnings.map(p => <li key={p.id}>{p.listaId ? `Lista ${p.listaId}` : "Campanha"}: {p.warnings.join(" ")}</li>)}</ul></details>}
      {unavailable && <p className="text-xs text-muted-foreground">Não foi possível atualizar o acompanhamento agora.</p>}
    </div>
  )
}
