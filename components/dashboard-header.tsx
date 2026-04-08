"use client"

import { MapPin, User, LogOut } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { type SupervisorConfig } from "@/lib/data"

export interface DashboardHeaderProps {
  onLogout: () => void
  user: SupervisorConfig
}

export function DashboardHeader({ onLogout, user }: DashboardHeaderProps) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground leading-none">
                <img src="/logo.png" alt="Reobote Consórcios" className="h-18 w-auto object-contain" />
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-xs text-muted-foreground border-border">
            <MapPin className="size-3" />
            Brasil
          </Badge>
          <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20">
              <User className="size-3.5 text-primary" />
            </div>
            <span className="text-sm text-foreground">{user.name}</span>
          </div>
          <button
            onClick={onLogout}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Sair"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
