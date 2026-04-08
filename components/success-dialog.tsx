"use client"

import { NICHES, ESTADOS } from "@/lib/data"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CheckCircle2, Copy, FileText, Plus, MapPin } from "lucide-react"
import { useState } from "react"
import type { ScheduleEntry } from "@/components/dashboard-content"

interface SuccessDialogProps {
  open: boolean
  onClose: () => void
  entry: ScheduleEntry
  onNewSchedule: () => void
  onCreatePdf: (entry: ScheduleEntry) => void
}

export function SuccessDialog({
  open,
  onClose,
  entry,
  onNewSchedule,
  onCreatePdf,
}: SuccessDialogProps) {
  const [copied, setCopied] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const nicheItems = entry.niches.map((id) => NICHES.find((n) => n.id === id))
  const estadoNome = ESTADOS.find((e) => e.sigla === entry.state)?.nome || entry.state

  const summaryText = `Lista criada\nNichos: ${nicheItems.map((n) => n?.label).join(", ")}\nLocal: ${estadoNome}${entry.city ? ` - ${entry.city}` : ""}\nQuantidade: ${entry.leadCount} leads`

  const handleCopy = () => {
    navigator.clipboard.writeText(summaryText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/20">
            <CheckCircle2 className="size-7 text-primary" />
          </div>
          <DialogTitle className="text-center text-foreground">
            Lista criada!
          </DialogTitle>
          <DialogDescription className="text-center">
            Sua lista foi criada com sucesso.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-4">
          {/* Nichos */}
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Nichos selecionados
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {nicheItems.map((niche) => {
                if (!niche) return null
                const Icon = niche.icon
                return (
                  <Badge key={niche.id} variant="secondary" className="gap-1 text-secondary-foreground">
                    <Icon className="size-3" />
                    {niche.label}
                  </Badge>
                )
              })}
            </div>
          </div>

          {/* Localização */}
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Localizacao
            </span>
            <p className="mt-1 flex items-center gap-2 text-sm text-foreground">
              <MapPin className="size-3.5 text-primary" />
              {estadoNome}{entry.city ? ` - ${entry.city}` : ""}
            </p>
          </div>

          {/* Quantidade */}
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Quantidade
            </span>
            <p className="mt-1 text-sm text-foreground">
              {entry.leadCount} leads
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={handleCopy}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {copied ? (
              <>
                <CheckCircle2 className="size-4 text-primary" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Copiar resumo
              </>
            )}
          </button>
          <button
            onClick={onNewSchedule}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/20"
          >
            <Plus className="size-4" />
            Novo agendamento
          </button>
        </DialogFooter>

        <button
          onClick={() => {
            setPdfError(null)
            try {
              onCreatePdf(entry)
            } catch (err) {
              const raw = err instanceof Error ? err.message : "failed_to_generate_pdf"
              const friendly = raw === "no_leads_returned" ? "Nenhum lead retornou da API para gerar o PDF." : raw
              setPdfError(friendly)
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110"
        >
          <FileText className="size-4" />
          Criar lista
        </button>

        {pdfError && (
          <p className="text-xs text-destructive">
            {pdfError}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
