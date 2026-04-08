"use client"

import { useEffect, useState } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardContent } from "@/components/dashboard-content"
import { Sidebar } from "@/components/sidebar"
import { SupervisorDialog } from "@/components/supervisor-dialog"
import { LogginScreen } from "@/components/loggin-screen"
import { INITIAL_USERS, CONSULTORES, type SupervisorConfig, type Consultant } from "@/lib/data"
import { Plus, X, User as UserIcon } from "lucide-react"

export default function Page() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "admin" | "team">("dashboard")
  const [supervisors, setSupervisors] = useState<SupervisorConfig[]>(INITIAL_USERS)
  const [consultants, setConsultants] = useState<Consultant[]>(CONSULTORES)
  const [isSupervisorDialogOpen, setIsSupervisorDialogOpen] = useState(false)
  const [newConsultantName, setNewConsultantName] = useState("")
  const [teamStats, setTeamStats] = useState<Record<number, { historic: number, active: number }> | null>(null)

  // Controle de login (se currentUser for null, exibe a tela de login)
  const [currentUser, setCurrentUser] = useState<SupervisorConfig | null>(null)

  useEffect(() => {
    if (!currentUser) return

    const load = async () => {
      try {
        const supervisorId = currentUser.role === "admin" ? "" : currentUser.id
        const url = supervisorId ? `/api/consultants?supervisorId=${encodeURIComponent(supervisorId)}` : "/api/consultants"
        const res = await fetch(url)
        const data = (await res.json().catch(() => null)) as unknown
        if (!res.ok) return
        if (!data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) return
        const rows = (data as { consultants?: unknown }).consultants
        if (!Array.isArray(rows)) return
        const parsed: Consultant[] = rows
          .filter((r) => r && typeof r === "object")
          .map((r) => {
            const o = r as { id?: unknown; name?: unknown; supervisorId?: unknown }
            return {
              id: String(o.id ?? ""),
              name: String(o.name ?? ""),
              supervisorId: String(o.supervisorId ?? ""),
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

  useEffect(() => {
    if (activeTab === "team" && currentUser) {
      fetch("/api/consultants/stats")
        .then(r => r.json())
        .then(d => {
          if (d.ok && d.stats) setTeamStats(d.stats)
        })
        .catch(() => {})
    }
  }, [activeTab, currentUser])

  const handleTabChange = (tab: "dashboard" | "admin" | "team") => {
    setActiveTab(tab)
    if (tab === "admin") {
      setIsSupervisorDialogOpen(true)
    }
  }

  const handleAddSupervisor = (newSup: SupervisorConfig) => {
    // Evita emails duplicados
    if (!supervisors.find(s => s.email === newSup.email)) {
      setSupervisors((prev) => [...prev, newSup])
    }
  }

  const handleRemoveSupervisor = (id: string) => {
    setSupervisors((prev) => prev.filter((s) => s.id !== id))
  }

  const handleAddConsultant = () => {
    if (!newConsultantName.trim() || !currentUser) return

    const name = newConsultantName.trim()
    const supervisorId = currentUser.id

    ;(async () => {
      try {
        const res = await fetch("/api/consultants", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, supervisorId }),
        })
        const data = (await res.json().catch(() => null)) as unknown
        if (!res.ok) return
        if (!data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) return
        const c = (data as { consultant?: unknown }).consultant
        if (!c || typeof c !== "object") return
        const cc = c as { id?: unknown; name?: unknown; supervisorId?: unknown }
        const created: Consultant = {
          id: String(cc.id ?? ""),
          name: String(cc.name ?? ""),
          supervisorId: String(cc.supervisorId ?? ""),
        }
        if (!created.id || !created.name || !created.supervisorId) return
        setConsultants((prev) => [...prev, created])
        setNewConsultantName("")
      } catch {
        // ignore
      }
    })()
  }

  const handleRemoveConsultant = (id: string) => {
    if (!id) return
    ;(async () => {
      try {
        await fetch(`/api/consultants/${encodeURIComponent(id)}`, { method: "DELETE" })
      } catch {
        // ignore
      } finally {
        setConsultants((prev) => prev.filter((c) => c.id !== id))
      }
    })()
  }

  // Filtra os consultores para mostrar apenas os do supervisor logado (ou todos para admin)
  // Adicionado filtro de segurança para nunca mostrar nomes de ADM ou Supervisor no dropdown de consultor
  const myConsultants = consultants.filter(c => {
    const isOwner = currentUser?.role === "admin" ? true : c.supervisorId === currentUser?.id;
    const isSystemUser = supervisors.some(s => s.name === c.name);
    return isOwner && !isSystemUser;
  })

  // Se não estiver logado, exibe apenas a tela de login
  if (!currentUser) {
    return (
      <LogginScreen
        supervisors={supervisors}
        onLogin={(user) => setCurrentUser(user)}
      />
    )
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isAdmin={currentUser?.role === "admin"}
      />
      {/* Conteúdo Principal */}
      <div className="flex-1 flex flex-col w-full h-screen overflow-y-auto">
        <DashboardHeader
          user={currentUser}
          onLogout={() => setCurrentUser(null)}
        />
        <main className="flex-1">
          {activeTab === "dashboard" ? (
            <DashboardContent consultants={myConsultants.map(c => c.name)} />
          ) : activeTab === "team" ? (
            <div className="mx-auto max-w-4xl p-6">
              <div className="mb-8">
                <h2 className="text-2xl font-bold mb-1">Minha Equipe</h2>
                <p className="text-muted-foreground text-sm">
                  Gerencie os consultores vinculados a você.
                </p>
              </div>

              <div className="flex gap-2 mb-6">
                <div className="flex-1 relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    className="flex h-10 w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Nome do novo consultor"
                    value={newConsultantName}
                    onChange={(e) => setNewConsultantName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddConsultant()}
                  />
                </div>
                <button
                  onClick={handleAddConsultant}
                  className="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:brightness-110 flex items-center gap-2"
                >
                  <Plus className="size-4" /> Adicionar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {myConsultants.length === 0 ? (
                  <div className="col-span-full py-12 text-center border-2 border-dashed border-border rounded-xl">
                    <p className="text-muted-foreground italic">Nenhum consultor cadastrado na sua equipe.</p>
                  </div>
                ) : (
                  myConsultants.map((c, index) => (
                    <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-secondary/20 transition-all hover:bg-secondary/30">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <UserIcon className="size-5" />
                          </div>
                          <span className="font-medium">{c.name}</span>
                        </div>
                        {teamStats && teamStats[index + 1] && (
                          <div className="text-[11px] text-muted-foreground mt-2 pl-14">
                            Neste mês: <span className="font-semibold text-foreground">{teamStats[index + 1].historic}</span> extraídos 
                            {' '}(<span className="text-emerald-500">{teamStats[index + 1].active}</span> ativos,{' '}
                            <span className="text-destructive/80">{teamStats[index + 1].historic - teamStats[index + 1].active}</span> resets)
                          </div>
                        )}
                        {teamStats && !teamStats[index + 1] && (
                          <div className="text-[11px] text-muted-foreground mt-2 pl-14">
                            Neste mês: 0 extraídos
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveConsultant(c.id)}
                        className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title="Remover da equipe"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div>
                <h2 className="text-2xl font-semibold mb-2">Painel Administrativo</h2>
                <p className="text-muted-foreground mb-6">
                  Gerencie o acesso de supervisores e configurações do sistema. (Logado como {currentUser.name})
                </p>
                {currentUser.role !== "admin" ? (
                  <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive max-w-sm mx-auto">
                    Acesso negado. Apenas administradores podem gerenciar outros usuários.
                  </div>
                ) : (
                  <button
                    onClick={() => setIsSupervisorDialogOpen(true)}
                    className="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:brightness-110"
                  >
                    Gerenciar Equipe ({supervisors.length})
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modal de Supervisores fica global na página */}
      <SupervisorDialog
        open={isSupervisorDialogOpen}
        onClose={() => setIsSupervisorDialogOpen(false)}
        supervisors={supervisors}
        onAdd={handleAddSupervisor}
        onRemove={handleRemoveSupervisor}
      />
    </div>
  )
}
