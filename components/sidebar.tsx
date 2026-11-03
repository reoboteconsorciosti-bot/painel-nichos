"use client"

import { LayoutDashboard, Shield, Users } from "lucide-react"
import { cn } from "@/lib/utils"

export type DashboardTab = "dashboard" | "admin" | "team" | "import"

interface SidebarProps {
  activeTab: DashboardTab
  onTabChange: (tab: DashboardTab) => void
  isAdmin?: boolean
}

export function Sidebar({ activeTab, onTabChange, isAdmin = false }: SidebarProps) {
  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col items-center gap-6 border-r border-border bg-background py-6 md:w-20">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
        <span className="text-xl font-bold">R</span>
      </div>

      <nav className="mt-4 flex w-full flex-col gap-4 px-3" aria-label="Navegação principal">
        <button
          type="button"
          onClick={() => onTabChange("dashboard")}
          className={cn(
            "flex h-12 w-full items-center justify-center rounded-xl transition-all",
            activeTab === "dashboard"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
          title="Dashboard"
          aria-label="Dashboard"
        >
          <LayoutDashboard className="size-5" />
        </button>

        <button
          type="button"
          onClick={() => onTabChange("team")}
          className={cn(
            "flex h-12 w-full items-center justify-center rounded-xl transition-all",
            activeTab === "team"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
          title={isAdmin ? "Equipe e limites" : "Minha equipe"}
          aria-label={isAdmin ? "Equipe e limites" : "Minha equipe"}
        >
          <Users className="size-5" />
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => onTabChange("import")}
            className={cn(
              "flex h-12 w-full items-center justify-center rounded-xl transition-all",
              activeTab === "import"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
            title="Importar dados"
            aria-label="Importar dados"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="size-5"
            >
              <ellipse cx="12" cy="5" rx="7" ry="3"></ellipse>
              <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"></path>
              <path d="M5 11v6c0 1.7 3.1 3 7 3 1.5 0 2.8-.2 3.9-.6"></path>
              <path d="M19 14v6"></path>
              <path d="M16.5 17.5 19 20l2.5-2.5"></path>
              <path d="M9 2v3"></path>
              <path d="M12 2v3"></path>
              <path d="M15 2v3"></path>
            </svg>
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={() => onTabChange("admin")}
            className={cn(
              "flex h-12 w-full items-center justify-center rounded-xl transition-all",
              activeTab === "admin"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
            title="Painel Administrativo"
            aria-label="Painel Administrativo"
          >
            <Shield className="size-5" />
          </button>
        )}
      </nav>
    </aside>
  )
}
