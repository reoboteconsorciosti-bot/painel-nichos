"use client"

import { NICHES, ESTADOS } from "@/lib/data"
import { Badge } from "@/components/ui/badge"
import type { ScheduleEntry } from "@/components/dashboard-content"
import {
  CalendarDays,
  MapPin,
  Sparkles,
  Trash2,
  ChevronRight,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ScheduleTimelineProps {
  schedules: ScheduleEntry[]
  onDelete: (id: string) => void
}

export function ScheduleTimeline({ schedules, onDelete }: ScheduleTimelineProps) {
  const sorted = [...schedules].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  function formatDatePtBr(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString("pt-BR")
  }

  function isCurrentWeek(dateStr: string) {
    const d = new Date(dateStr)
    const now = new Date()
    return d.toDateString() === now.toDateString()
  }

  function isFuture(dateStr: string) {
    const d = new Date(dateStr)
    const now = new Date()
    return d > now
  }

  return (
    <section className="mb-8">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
          <Clock className="size-4 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Seus Agendamentos
          </h2>
          <p className="text-xs text-muted-foreground">
            {schedules.length} prospecao{schedules.length > 1 ? "es" : ""} agendada{schedules.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {sorted.map((entry) => {
          const nicheItems = entry.niches.map((id) => NICHES.find((n) => n.id === id)).filter(Boolean)
          const estadoNome = ESTADOS.find((e) => e.sigla === entry.state)?.nome || entry.state
          const current = isCurrentWeek(entry.createdAt)
          const future = isFuture(entry.createdAt)

          return (
            <div
              key={entry.id}
              className={cn(
                "group relative flex flex-col gap-3 rounded-xl border p-5 transition-all sm:flex-row sm:items-center sm:gap-5",
                current
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-card hover:border-border"
              )}
            >
              {/* Status indicator */}
              <div className="flex shrink-0 flex-col items-center gap-1">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    current
                      ? "bg-primary text-primary-foreground"
                      : future
                        ? "bg-secondary text-muted-foreground"
                        : "bg-secondary/50 text-muted-foreground"
                  )}
                >
                  <CalendarDays className="size-4" />
                </div>
                {current && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Ativa
                  </span>
                )}
                {future && !current && (
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Futura
                  </span>
                )}
                {!future && !current && (
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Passada
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="flex flex-1 flex-col gap-2">
                {/* Period */}
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span>{formatDatePtBr(entry.createdAt)}</span>
                </div>

                {/* Niches + Location */}
                <div className="flex flex-wrap items-center gap-2">
                  {nicheItems.map((niche) => {
                    if (!niche) return null
                    const Icon = niche.icon
                    return (
                      <Badge
                        key={niche.id}
                        variant="secondary"
                        className="gap-1 text-xs text-secondary-foreground"
                      >
                        <Icon className="size-3" />
                        {niche.label}
                      </Badge>
                    )
                  })}
                  <span className="text-muted-foreground">|</span>
                  <Badge variant="outline" className="gap-1 text-xs border-border text-muted-foreground">
                    <MapPin className="size-3" />
                    {estadoNome}{entry.city ? ` - ${entry.city}` : ""}
                  </Badge>
                  <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                    {entry.leadCount} leads
                  </Badge>
                  {entry.consultantName && (
                    <Badge variant="outline" className="gap-1 text-xs border-border text-muted-foreground">
                      <Sparkles className="size-3" />
                      {entry.consultantName}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => onDelete(entry.id)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                aria-label="Excluir agendamento"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
