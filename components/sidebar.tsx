"use client"

import { Shield, LayoutDashboard, Settings, Users } from "lucide-react"
import { cn } from "@/lib/utils"

interface SidebarProps {
    activeTab: "dashboard" | "admin" | "team"
    onTabChange: (tab: "dashboard" | "admin" | "team") => void
    isAdmin?: boolean
}

export function Sidebar({ activeTab, onTabChange, isAdmin = false }: SidebarProps) {
    return (
        <aside className="w-16 md:w-20 border-r border-border bg-background flex flex-col items-center py-6 gap-6 h-screen sticky top-0 shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
                <span className="font-bold text-xl">R</span>
            </div>

            <nav className="flex flex-col gap-4 mt-4 w-full px-3">
                <button
                    onClick={() => onTabChange("dashboard")}
                    className={cn(
                        "flex h-12 w-full items-center justify-center rounded-xl transition-all",
                        activeTab === "dashboard"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                    title="Dashboard"
                >
                    <LayoutDashboard className="size-5" />
                </button>

                <button
                    onClick={() => onTabChange("team")}
                    className={cn(
                        "flex h-12 w-full items-center justify-center rounded-xl transition-all",
                        activeTab === "team"
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                    title="Equipe"
                >
                    <Users className="size-5" />
                </button>

                {isAdmin && (
                    <button
                        onClick={() => onTabChange("admin")}
                        className={cn(
                            "flex h-12 w-full items-center justify-center rounded-xl transition-all",
                            activeTab === "admin"
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
                        )}
                        title="Admin e Supervisores"
                    >
                        <Shield className="size-5" />
                    </button>
                )}
            </nav>

            <div className="mt-auto w-full px-3">
                <button
                    className="flex h-12 w-full items-center justify-center rounded-xl bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
                    title="Configurações"
                >
                    <Settings className="size-5" />
                </button>
            </div>
        </aside>
    )
}
