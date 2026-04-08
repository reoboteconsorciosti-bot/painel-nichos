"use client"

import { cn } from "@/lib/utils"
import { NICHES, ESTADOS } from "@/lib/data"
import { Badge } from "@/components/ui/badge"
import {
  Check,
  MapPin,
  Target,
  ChevronRight,
  Sparkles,
  ArrowRight,
  X,
  CalendarDays,
  Plus,
} from "lucide-react"

interface SelectionSummaryProps {
  selectedNiches: string[]
  selectedState: string
  selectedCity: string
  leadCount: number
  onLeadCountChange: (val: number) => void
  onRemoveNiche: (id: string) => void
  onClearState: () => void
  onClearCity: () => void
  onGenerate: () => void
}

export function SelectionSummary({
  selectedNiches,
  selectedState,
  selectedCity,
  leadCount,
  onLeadCountChange,
  onRemoveNiche,
  onClearState,
  onClearCity,
  onGenerate,
}: SelectionSummaryProps) {
  const nicheItems = selectedNiches.map((id) => NICHES.find((n) => n.id === id)!)
  const estadoNome = ESTADOS.find((e) => e.sigla === selectedState)?.nome
  const hasSelection = selectedNiches.length > 0
  const hasLocation = selectedState !== ""
  const hasLeadCount = Number.isFinite(leadCount) && leadCount > 0
  const isReady = hasSelection && hasLocation && hasLeadCount

  // Calculate step progress
  const steps = [
    { done: hasSelection, label: "Nichos" },
    { done: hasLocation, label: "Local" },
    { done: hasLeadCount, label: "Qtd" },
  ]
  const completedSteps = steps.filter((s) => s.done).length

  return (
    <div
      className={cn(
        "rounded-xl border p-6 transition-all duration-300",
        isReady
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card"
      )}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
          <Target className="size-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">Nova lista</h3>
          <p className="text-xs text-muted-foreground">
            {completedSteps} de 3 etapas concluidas
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-5 flex gap-1.5">
        {steps.map((step, i) => (
          <div key={i} className="flex flex-1 flex-col gap-1">
            <div
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                step.done ? "bg-primary" : "bg-secondary"
              )}
            />
            <span className={cn(
              "text-[10px] text-center",
              step.done ? "text-primary font-medium" : "text-muted-foreground"
            )}>
              {step.label}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {/* Nichos selecionados */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Nichos ({selectedNiches.length})
            </span>
          </div>
          {hasSelection ? (
            <div className="flex flex-wrap gap-2">
              {nicheItems.map((niche) => {
                if (!niche) return null
                const Icon = niche.icon
                return (
                  <Badge
                    key={niche.id}
                    variant="secondary"
                    className="gap-1.5 pr-1.5 text-secondary-foreground"
                  >
                    <Icon className="size-3" />
                    {niche.label}
                    <button
                      onClick={() => onRemoveNiche(niche.id)}
                      className="ml-0.5 rounded-sm p-0.5 hover:bg-accent"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Nenhum nicho selecionado
            </p>
          )}
        </div>

        {/* Localização */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Localizacao
            </span>
          </div>
          {hasLocation ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="gap-1.5 pr-1.5 text-secondary-foreground">
                <MapPin className="size-3" />
                {estadoNome}
                <button
                  onClick={() => {
                    onClearState()
                    onClearCity()
                  }}
                  className="ml-0.5 rounded-sm p-0.5 hover:bg-accent"
                >
                  <X className="size-3" />
                </button>
              </Badge>
              {selectedCity && (
                <>
                  <ChevronRight className="size-3 text-muted-foreground" />
                  <Badge variant="secondary" className="gap-1.5 pr-1.5 text-secondary-foreground">
                    {selectedCity}
                    <button
                      onClick={onClearCity}
                      className="ml-0.5 rounded-sm p-0.5 hover:bg-accent"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                </>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Nenhuma localizacao selecionada
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Check className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Quantidade de leads
            </span>
          </div>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={Number.isFinite(leadCount) ? leadCount : 0}
            onChange={(e) => onLeadCountChange(Number(e.target.value))}
            className="h-10 w-full rounded-md border border-border bg-secondary/50 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          />
          <p className="text-xs text-muted-foreground">
            Defina quantos contatos voce quer gerar (1 a 500).
          </p>
        </div>
      </div>

      {/* Botão de agendar */}
      <button
        onClick={onGenerate}
        disabled={!isReady}
        className={cn(
          "mt-6 flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-all duration-200",
          isReady
            ? "bg-primary text-primary-foreground hover:brightness-110 active:scale-[0.98]"
            : "cursor-not-allowed bg-secondary text-muted-foreground opacity-60"
        )}
      >
        {isReady ? (
          <>
            <Plus className="size-4" />
            Criar Lista
            <ArrowRight className="size-4" />
          </>
        ) : (
          "Preencha todas as etapas"
        )}
      </button>
    </div>
  )
}
