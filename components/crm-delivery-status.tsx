"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"

type Status = {
  counts: Record<string, number>
  problems: Array<{ id: number; listaId: number | null; consultantCrmId: string; method: string; error: string }>
  warnings: Array<{ id: number; listaId: number | null; consultantCrmId: string; warnings: string[] }>
}

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

  if (!status) return unavailable ? <p className="mb-4 text-xs text-muted-foreground">Não foi possível carregar o acompanhamento dos envios ao CRM.</p> : null
  const pending = (status.counts.pending ?? 0) + (status.counts.sending ?? 0)
  const failed = (status.counts.failed ?? 0) + (status.counts.needs_review ?? 0)
  if (!pending && !failed && !status.counts.sent) return null

  const label = (item: { listaId: number | null; consultantCrmId: string; method?: string }) =>
    item.listaId ? `Lista ${item.listaId}` : item.consultantCrmId === "import" ? item.method === "CONTACTS_BULK" ? "Importação · contatos" : "Importação · negócio/nota" : "Campanha"
  const friendlyError = (message: string) => /HTTP 5\d\d/i.test(message)
    ? "O CRM teve uma falha interna durante o envio. Confira se os dados chegaram antes de tentar novamente."
    : message.replace("Confira o negócio antes de reenviar.", "Confira o registro no CRM antes de tentar novamente.")

  return (
    <div className="mb-6 space-y-2 rounded-xl border border-border bg-card p-4" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold">{pending > 0 && <RefreshCw className="size-4 animate-spin text-primary" />}Envios para o CRM</p>
      <p className="text-xs text-muted-foreground">{status.counts.sent ?? 0} solicitações concluídas{pending > 0 && ` · ${pending} aguardando`}{failed > 0 && ` · ${failed} precisam de atenção`}</p>
      <p className="text-xs text-muted-foreground">A contagem é de solicitações da fila, não de contatos. Inclui listas, campanhas e importações; uma solicitação pode agrupar vários contatos.</p>
      {pending > 0 && <p className="text-xs text-muted-foreground">Os itens já enfileirados continuam sendo processados em segundo plano.</p>}
      {(failed > 0 || status.warnings.length > 0) && <details className="text-xs"><summary className="cursor-pointer">Ver avisos</summary><ul className="mt-2 space-y-2">{status.problems.map(item => <li key={item.id}>{label(item)}: {friendlyError(item.error)}</li>)}{status.warnings.map(item => <li key={item.id}>{label(item)}: {item.warnings.join(" ")}</li>)}</ul></details>}
      {unavailable && <p className="text-xs text-muted-foreground">Não foi possível atualizar o acompanhamento agora.</p>}
    </div>
  )
}
