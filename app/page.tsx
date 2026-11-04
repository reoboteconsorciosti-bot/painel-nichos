"use client"

import { useEffect, useState } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardContent } from "@/components/dashboard-content"
import { Sidebar } from "@/components/sidebar"
import { LogginScreen } from "@/components/loggin-screen"
import { CONSULTORES, type SupervisorConfig, type Consultant } from "@/lib/data"
import { User as UserIcon } from "lucide-react"
import { ImportPanel } from "@/components/import-panel"
import { OwnerManagementPanel } from "@/components/owner-management-panel"
import { DistributionAuditPanel } from "@/components/distribution-audit-panel"
import { type DashboardTab } from "@/components/sidebar"

export default function Page() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("dashboard")
  const [consultants, setConsultants] = useState<Consultant[]>(CONSULTORES)

  // Reset de listas

  // Controle de login (se currentUser for null, exibe a tela de login)
  const [currentUser, setCurrentUser] = useState<SupervisorConfig | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(async (d) => {
        if (d.ok && d.user) {
          setCurrentUser(d.user)
          // Se não for dono, pré-carrega as permissões de visibilidade antes de liberar o carregamento
          // Isso elimina qualquer possibilidade de reflexo/flash de nichos bloqueados na tela
          if (!d.user.isOwner) {
            try {
              const res = await fetch("/api/admin/niche-visibility")
              const vis = await res.json()
              if (vis?.ok && Array.isArray(vis.allowedNiches)) {
                sessionStorage.setItem("allowed_niches_cache", JSON.stringify(vis.allowedNiches))
              }
            } catch {}
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setAuthLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!currentUser) return

    const load = async () => {
      try {
        const res = await fetch("/api/consultants", { credentials: "include", cache: "no-store" })
        const data = (await res.json().catch(() => null)) as unknown
        if (!res.ok) return
        if (!data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) return
        const rows = (data as { consultants?: unknown }).consultants
        if (!Array.isArray(rows)) return
        const parsed: Consultant[] = rows
          .filter((r) => r && typeof r === "object")
          .map((r) => {
            const o = r as { id?: unknown; name?: unknown; supervisorId?: unknown; crmUserId?: unknown }
            return {
              id: String(o.id ?? ""),
              name: String(o.name ?? ""),
              supervisorId: String(o.supervisorId ?? ""),
              crmUserId: String(o.crmUserId ?? ""),
            }
          })
          .filter((c) => !!c.id && !!c.name && !!c.supervisorId)
        setConsultants(parsed)
      } catch {
        // mantém fallback do estado
      }
    }

    load()
  }, [currentUser])

  const handleTabChange = (tab: DashboardTab) => {
    setActiveTab(tab)
  }

  // Filtra os consultores para mostrar apenas os do supervisor logado (ou todos para admin)
  // Adicionado filtro de segurança para nunca mostrar nomes de ADM ou Supervisor no dropdown de consultor
  const myConsultants = consultants

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-3">
           <img src="/logo.png" alt="Reobote" className="h-16 w-auto opacity-50 grayscale" />
           <p className="text-sm font-medium text-muted-foreground">Verificando sessão...</p>
        </div>
      </div>
    )
  }

  // Se não estiver logado, exibe apenas a tela de login
  if (!currentUser) {
    return (
      <LogginScreen />
    )
  }

  const handleLogout = () => {
    try {
      sessionStorage.removeItem("allowed_niches_cache")
    } catch {}
    fetch("/api/auth/logout", { method: "POST" }).finally(() => setCurrentUser(null))
  }

  return (
    <div className="flex h-dvh bg-background text-foreground overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isAdmin={currentUser?.role === "admin"}
        isOwner={currentUser?.isOwner === true}
      />
      {/* Conteúdo Principal */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <DashboardHeader
          user={currentUser}
          onLogout={handleLogout}
        />
        <main className="flex-1">
          {/* Mantém DashboardContent montado para eliminar qualquer reflexo ou atraso ao alternar abas */}
          <div className={activeTab === "dashboard" ? "block" : "hidden"}>
            <DashboardContent
              consultants={myConsultants}
              canManageBlackFriday={currentUser.role === "supervisor" || currentUser.role === "admin"}
              isOwner={currentUser.isOwner === true}
            />
          </div>

          {activeTab === "team" ? (
            currentUser.role === "admin" ? <OwnerManagementPanel /> : (
            <div className="mx-auto max-w-4xl p-6">
              <div className="mb-8">
                <h2 className="text-2xl font-bold mb-1">Minha Equipe</h2>
                <p className="text-muted-foreground text-sm">
                  Gerencie os consultores vinculados a você.
                </p>
              </div>

              <p className="mb-6 text-sm text-muted-foreground">
                A equipe é sincronizada com os membros ativos de vendas cadastrados no CRM. Para incluir ou mover alguém, atualize a equipe no CRM.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {myConsultants.length === 0 ? (
                  <div className="col-span-full py-12 text-center border-2 border-dashed border-border rounded-xl">
                    <p className="text-muted-foreground italic">Nenhum consultor cadastrado na sua equipe.</p>
                  </div>
                ) : (
                  myConsultants.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-secondary/20 transition-all hover:bg-secondary/30">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <UserIcon className="size-5" />
                          </div>
                          <span className="font-medium">{c.name}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            )
          ) : activeTab === "admin" ? (
            <OwnerManagementPanel />
          ) : activeTab === "import" ? (
            currentUser.isOwner ? (
              <ImportPanel />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center">
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-destructive max-w-md mx-auto">
                  <p className="font-semibold text-base mb-1">Acesso Restrito</p>
                  <p className="text-sm text-muted-foreground">Apenas Donos do CRM têm permissão para acessar importação de dados.</p>
                </div>
              </div>
            )
          ) : activeTab === "audit" ? (
            <DistributionAuditPanel />
          ) : null}
        </main>
      </div>

      {/* Modal de Supervisores fica global na página */}
    </div>
  )
}
