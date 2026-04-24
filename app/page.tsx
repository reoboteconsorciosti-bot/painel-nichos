"use client"

import { type DragEvent, useEffect, useState } from "react"
import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardContent } from "@/components/dashboard-content"
import { Sidebar } from "@/components/sidebar"
import { SupervisorDialog } from "@/components/supervisor-dialog"
import { LogginScreen } from "@/components/loggin-screen"
import { CONSULTORES, NICHES, type SupervisorConfig, type Consultant } from "@/lib/data"
import { Plus, X, User as UserIcon } from "lucide-react"

export default function Page() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "admin" | "team" | "import">("dashboard")
  const [supervisors, setSupervisors] = useState<SupervisorConfig[]>([])
  const [consultants, setConsultants] = useState<Consultant[]>(CONSULTORES)
  const [isSupervisorDialogOpen, setIsSupervisorDialogOpen] = useState(false)
  const [newConsultantName, setNewConsultantName] = useState("")
  const [teamStats, setTeamStats] = useState<Record<number, { historic: number, active: number }> | null>(null)

  const [whatsNotifyNumber, setWhatsNotifyNumber] = useState("")
  const [whatsNotifyLoading, setWhatsNotifyLoading] = useState(false)
  const [whatsNotifyError, setWhatsNotifyError] = useState<string | null>(null)
  const [whatsNotifySaved, setWhatsNotifySaved] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importDragActive, setImportDragActive] = useState(false)
  const [importNicheId, setImportNicheId] = useState("")
  const [importForceCity, setImportForceCity] = useState("")
  const [importForceState, setImportForceState] = useState("")
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null)

  // Controle de login (se currentUser for null, exibe a tela de login)
  const [currentUser, setCurrentUser] = useState<SupervisorConfig | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.user) {
          setCurrentUser(d.user)
        }
      })
      .catch(() => {})
      .finally(() => {
        setAuthLoading(false)
      })

    fetch("/api/supervisors")
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.supervisors) setSupervisors(d.supervisors)
      })
      .catch(() => {})
  }, [])

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

  useEffect(() => {
    if (activeTab !== "admin" || !currentUser || currentUser.role !== "admin") return

    setWhatsNotifyLoading(true)
    setWhatsNotifyError(null)
    setWhatsNotifySaved(false)
    fetch("/api/admin/whatsapp-notify", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.ok) setWhatsNotifyNumber(String(d.value ?? ""))
      })
      .catch(() => {
        setWhatsNotifyError("Falha ao carregar o numero do WhatsApp")
      })
      .finally(() => setWhatsNotifyLoading(false))
  }, [activeTab, currentUser])

  const handleTabChange = (tab: "dashboard" | "admin" | "team" | "import") => {
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
      <LogginScreen
        supervisors={supervisors}
        onLogin={(user) => setCurrentUser(user)}
      />
    )
  }

  const handleLogout = () => {
    fetch("/api/auth/logout", { method: "POST" }).finally(() => setCurrentUser(null))
  }

  const handleSaveWhatsNotifyNumber = async () => {
    if (!currentUser || currentUser.role !== "admin") return
    setWhatsNotifyLoading(true)
    setWhatsNotifyError(null)
    setWhatsNotifySaved(false)
    try {
      const res = await fetch("/api/admin/whatsapp-notify", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: whatsNotifyNumber }),
      })
      const data = (await res.json().catch(() => null)) as unknown
      if (!res.ok || !data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) {
        throw new Error("failed")
      }
      setWhatsNotifyNumber(String((data as { value?: unknown }).value ?? ""))
      setWhatsNotifySaved(true)
    } catch {
      setWhatsNotifyError("Nao foi possivel salvar o numero")
    } finally {
      setWhatsNotifyLoading(false)
    }
  }

  const handleImportUpload = async () => {
    if (!importFile) {
      setImportError("Selecione um arquivo .xlsx ou .csv")
      return
    }
    if (!importNicheId) {
      setImportError("Selecione o nicho que deve ser populado")
      return
    }

    setImportLoading(true)
    setImportError(null)
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append("file", importFile)
      formData.append("nichoFolder", importNicheId)
      formData.append("forceCity", importForceCity)
      formData.append("forceState", importForceState)
      formData.append("dryRun", "false")
      formData.append("maxRowsPerFile", "5000")

      const res = await fetch("/api/import/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      })

      const data = (await res.json().catch(() => null)) as unknown
      if (!res.ok || !data || typeof data !== "object") {
        throw new Error("Falha ao importar arquivo")
      }

      const payload = data as { ok?: unknown; error?: unknown }
      if (payload.ok !== true) {
        throw new Error(String(payload.error ?? "Falha ao importar arquivo"))
      }

      setImportResult(data as Record<string, unknown>)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao importar arquivo"
      setImportError(msg)
    } finally {
      setImportLoading(false)
    }
  }

  const handleClearImportSelection = () => {
    setImportFile(null)
    setImportNicheId("")
    setImportForceCity("")
    setImportForceState("")
    setImportError(null)
    setImportResult(null)
  }

  const handleImportDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setImportDragActive(true)
  }

  const handleImportDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setImportDragActive(false)
  }

  const handleImportDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setImportDragActive(false)
    const droppedFile = e.dataTransfer.files?.[0] ?? null
    if (!droppedFile) return
    setImportFile(droppedFile)
    setImportError(null)
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
          onLogout={handleLogout}
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
          ) : activeTab === "import" ? (
            <div className="mx-auto w-full max-w-3xl p-6">
              <div className="rounded-xl border border-border bg-secondary/20 p-6 text-left space-y-4">
                <h2 className="text-2xl font-semibold">Importacao de planilha</h2>
                <p className="text-sm text-muted-foreground">
                  Envie um arquivo Excel/CSV. A higienizacao, normalizacao de headers e padronizacao
                  continuam sendo feitas no backend.
                </p>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label htmlFor="import-niche" className="text-sm font-medium text-foreground">
                      Nicho para popular no banco
                    </label>
                    <select
                      id="import-niche"
                      value={importNicheId}
                      onChange={(e) => setImportNicheId(e.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      disabled={importLoading}
                    >
                      <option value="">Selecione um nicho</option>
                      {NICHES.map((niche) => (
                        <option key={niche.id} value={niche.id}>
                          {niche.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Cidade e estado continuam sendo lidos da planilha e higienizados pelo backend.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="import-force-city" className="text-sm font-medium text-foreground">
                        Cidade destino (opcional)
                      </label>
                      <input
                        id="import-force-city"
                        type="text"
                        value={importForceCity}
                        onChange={(e) => setImportForceCity(e.target.value)}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Ex: Sao Paulo"
                        disabled={importLoading}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="import-force-state" className="text-sm font-medium text-foreground">
                        Estado destino (opcional)
                      </label>
                      <input
                        id="import-force-state"
                        type="text"
                        value={importForceState}
                        onChange={(e) => setImportForceState(e.target.value)}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Ex: SP"
                        maxLength={2}
                        disabled={importLoading}
                      />
                    </div>
                  </div>

                  <label
                    htmlFor="import-file"
                    onDragEnter={handleImportDragOver}
                    onDragOver={handleImportDragOver}
                    onDragLeave={handleImportDragLeave}
                    onDrop={handleImportDrop}
                    className={`flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-background/50 px-4 text-center transition-colors ${
                      importDragActive
                        ? "border-primary/80"
                        : "border-border hover:border-primary/60"
                    }`}
                  >
                    <p className="text-sm font-medium text-foreground">
                      Arraste e solte seu arquivo aqui
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ou clique para selecionar (.xlsx ou .csv)
                    </p>
                    {importFile && (
                      <p className="mt-3 text-xs text-primary">
                        Arquivo selecionado: {importFile.name}
                      </p>
                    )}
                  </label>
                  <input
                    id="import-file"
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                    disabled={importLoading}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleImportUpload}
                    disabled={importLoading || !importFile}
                    className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
                  >
                    {importLoading ? "Importando..." : "Importar arquivo"}
                  </button>
                  <button
                    onClick={handleClearImportSelection}
                    disabled={importLoading || !importFile}
                    className="h-10 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                  >
                    Desimportar arquivo
                  </button>
                </div>

                {importError && (
                  <p className="text-xs text-destructive">{importError}</p>
                )}

                {importResult && (
                  <div className="rounded-md border border-border bg-background p-3">
                    <p className="text-sm font-semibold mb-2">Resultado da importacao</p>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">
                      {JSON.stringify(importResult, null, 2)}
                    </pre>
                  </div>
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
                  <div className="mx-auto max-w-lg space-y-4">
                    <button
                      onClick={() => setIsSupervisorDialogOpen(true)}
                      className="rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:brightness-110"
                    >
                      Gerenciar Equipe ({supervisors.length})
                    </button>

                    <div className="rounded-xl border border-border bg-secondary/20 p-4 text-left">
                      <p className="text-sm font-semibold text-foreground">WhatsApp - Numero de notificacao</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Numero fixo que recebe a mensagem quando uma lista for gerada.
                      </p>

                      <div className="mt-3 flex gap-2">
                        <input
                          type="tel"
                          inputMode="numeric"
                          value={whatsNotifyNumber}
                          onChange={(e) => setWhatsNotifyNumber(e.target.value)}
                          className="flex-1 h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Ex: 5599999999999"
                          disabled={whatsNotifyLoading}
                        />
                        <button
                          onClick={handleSaveWhatsNotifyNumber}
                          className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
                          disabled={whatsNotifyLoading}
                        >
                          {whatsNotifyLoading ? "Salvando..." : "Salvar"}
                        </button>
                      </div>
                      {whatsNotifySaved && (
                        <p className="text-xs text-emerald-600 mt-2">Salvo com sucesso.</p>
                      )}
                      {whatsNotifyError && (
                        <p className="text-xs text-destructive mt-2">{whatsNotifyError}</p>
                      )}
                    </div>
                  </div>
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
