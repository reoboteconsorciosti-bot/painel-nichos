"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Check, FileSpreadsheet, History, LoaderCircle, RotateCcw, Upload, Users } from "lucide-react"
import { NICHES } from "@/lib/data"
import { IMPORT_TARGETS, MAX_IMPORT_BYTES, mapImportRow, validateMapping, type ColumnMapping, type ImportTarget } from "@/lib/import-mapping"

type Preview = { headers: string[]; rows: Record<string, string>[]; sheets: string[]; sheetName: string; totalRows: number; mapping: ColumnMapping }
type ImportBatch = { id: number; fileName: string; niche: string; importedCount: number; existingCount: number; removedCount: number; status: string; createdAt: string }
const inputClass = "h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
const cardClass = "rounded-2xl border border-border bg-card/80 p-5 shadow-sm sm:p-6"

export function ImportPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState("")
  const [sheets, setSheets] = useState<string[]>([])
  const [headerRow, setHeaderRow] = useState(1)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [nicho, setNicho] = useState("")
  const [forceCity, setForceCity] = useState("")
  const [forceState, setForceState] = useState("")
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [history, setHistory] = useState<ImportBatch[]>([])
  const [undoing, setUndoing] = useState<number | null>(null)

  async function loadHistory() {
    try {
      const response = await fetch("/api/import/history")
      const data = await response.json()
      if (response.ok && data.ok) setHistory(data.batches)
    } catch { /* O histórico pode ser carregado novamente após uma importação. */ }
  }
  useEffect(() => { void loadHistory() }, [])

  useEffect(() => {
    setPreview(null)
    setResult(null)
    if (!file) return
    const controller = new AbortController()
    setReading(true)
    setError(null)
    const timer = setTimeout(async () => {
      try {
        const form = new FormData()
        form.append("file", file)
        form.append("sheetName", sheet)
        form.append("headerRow", String(headerRow))
        const response = await fetch("/api/import/preview", { method: "POST", body: form, signal: controller.signal })
        const data = await response.json()
        if (!controller.signal.aborted && Array.isArray(data.sheets)) setSheets(data.sheets)
        if (!response.ok || !data.ok) throw new Error(data.error === "unauthorized" ? "Entre como administrador para importar." : data.error || "Não foi possível ler o arquivo.")
        if (!controller.signal.aborted) { setPreview(data); setMapping(data.mapping) }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Não foi possível ler o arquivo.")
      } finally { if (!controller.signal.aborted) setReading(false) }
    }, 250)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [file, sheet, headerRow])

  function selectFile(next: File | null) {
    setError(null); setPreview(null); setResult(null); setSheet(""); setSheets([]); setHeaderRow(1)
    if (next && (!/\.(xlsx|csv)$/i.test(next.name) || next.size > MAX_IMPORT_BYTES)) {
      setFile(null)
      setError("Escolha um arquivo .xlsx ou .csv de até 20 MB.")
    } else setFile(next)
  }

  let validation: string | null = null
  let samples: Record<string, string>[] = []
  if (preview) {
    try {
      validateMapping(mapping, preview.headers, forceState)
      samples = preview.rows.map(row => ({ ...mapImportRow(row, mapping), ...(forceCity ? { city: forceCity } : {}), ...(forceState ? { state: forceState } : {}) }))
    } catch (cause) { validation = cause instanceof Error ? cause.message : "Confira o mapeamento." }
  }
  const mappedCount = Object.values(mapping).filter(target => target !== "ignore").length
  const descriptionColumns = Object.values(mapping).filter(target => target === "dealDescription").length

  async function importFile() {
    if (!file || !preview || validation || !nicho || saving) return
    setSaving(true); setError(null); setResult(null)
    try {
      const form = new FormData()
      form.append("file", file); form.append("sheetName", preview.sheetName); form.append("headerRow", String(headerRow))
      form.append("columnMapping", JSON.stringify(mapping)); form.append("nichoFolder", nicho)
      form.append("forceCity", forceCity); form.append("forceState", forceState); form.append("maxRowsPerFile", "5000")
      const response = await fetch("/api/import/upload", { method: "POST", body: form })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || "Não foi possível importar.")
      setResult(data)
      void loadHistory()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível importar.") }
    finally { setSaving(false) }
  }

  async function undoImport(id: number) {
    if (!window.confirm("Desimportar este lote? Os contatos novos serão removidos do Painel. Contatos antigos serão preservados.")) return
    setUndoing(id); setError(null)
    try {
      const response = await fetch(`/api/import/${id}/undo`, { method: "POST" })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error("Não foi possível desimportar este lote.")
      await loadHistory()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível desimportar este lote.") }
    finally { setUndoing(null) }
  }

  const stats = result?.stats as Record<string, unknown> | undefined
  const crmImport = result?.crmImport as { configured?: boolean; contactsCount?: number; contactBatchesQueued?: number; dealsCount?: number } | null | undefined
  const steps = ["Arquivo e destino", "Mapeamento", "Revisão"]

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7 p-4 pb-10 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-5 border-b border-border pb-6 sm:flex-row sm:items-end">
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Base de contatos</p><h2 className="text-3xl font-semibold tracking-tight">Importar contatos</h2><p className="mt-2 max-w-xl text-sm text-muted-foreground">Traga sua planilha, confira os campos e envie tudo em poucos passos.</p></div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary"><History className="h-4 w-4" /></span>{history.length} {history.length === 1 ? "importação no histórico" : "importações no histórico"}</div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3" aria-label="Etapas da importação">
        {steps.map((label, index) => {
          const active = index === 0 ? !preview : index === 1 ? !!preview && !result : !!preview
          const complete = index === 0 ? !!preview : index === 1 ? !!preview && !validation : !!result
          return <div key={label} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${active ? "border-primary/50 bg-primary/5" : "border-border bg-card/50"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${complete ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{complete ? <Check className="h-4 w-4" /> : index + 1}</span><span className={`text-sm ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}>{label}</span></div>
        })}
      </div>

      <fieldset disabled={saving} className="min-w-0 space-y-5 disabled:opacity-70">
        <section className={cardClass}>
          <div className="mb-5"><h3 className="text-lg font-semibold">1. Escolha o arquivo e o nicho</h3><p className="mt-1 text-sm text-muted-foreground">Excel ou CSV · até 5.000 linhas · 20 MB</p></div>
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <label className="group relative flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/60 px-5 py-6 text-center transition hover:border-primary/60 hover:bg-primary/[0.03]">
              <input type="file" accept=".xlsx,.csv" className="absolute inset-0 cursor-pointer opacity-0" onChange={event => selectFile(event.target.files?.[0] ?? null)} aria-label="Escolher planilha Excel ou CSV" />
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Upload className="h-5 w-5" /></span>
              <span className="text-sm font-medium">{file ? file.name : "Clique para escolher uma planilha"}</span>
              <span className="mt-1 text-xs text-muted-foreground">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Formatos .xlsx e .csv"}</span>
            </label>
            <div className="grid content-center gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <label className="space-y-2 text-sm font-medium">Nicho<select aria-label="Nicho" className={inputClass} value={nicho} onChange={event => setNicho(event.target.value)}><option value="">Selecione o nicho</option><option value={`black-friday-${new Date().getFullYear()}`}>Black Friday {new Date().getFullYear()}</option>{NICHES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              {sheets.length > 1 && <label className="space-y-2 text-sm font-medium">Aba da planilha<select className={inputClass} value={sheet || preview?.sheetName || sheets[0]} onChange={event => { setPreview(null); setSheet(event.target.value) }}>{sheets.map(name => <option key={name}>{name}</option>)}</select></label>}
              {file && <label className="space-y-2 text-sm font-medium">Linha do cabeçalho<input type="number" min={1} max={100} value={headerRow} onChange={event => { setPreview(null); setHeaderRow(Number(event.target.value) || 1) }} className={inputClass} /></label>}
            </div>
          </div>
          {reading && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-primary"><LoaderCircle className="h-4 w-4 animate-spin" />Lendo a planilha...</p>}
        </section>

        {preview && <>
          <section className={cardClass}>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">2. Confira o mapeamento</h3><p className="mt-1 text-sm text-muted-foreground">Diga onde cada coluna da planilha deve aparecer.</p></div><span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">{preview.totalRows.toLocaleString("pt-BR")} linhas · {mappedCount} campos mapeados</span></div>
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="hidden grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)] gap-4 bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid"><span>Coluna da planilha</span><span>Destino</span></div>
              <div className="divide-y divide-border">{preview.headers.map((header, index) => <div key={header} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)] sm:items-center sm:gap-4 sm:px-4"><div className="min-w-0"><label htmlFor={`column-${index}`} className="block truncate text-sm font-medium" title={header}>{header}</label><p className="truncate text-xs text-muted-foreground" title={preview.rows[0]?.[header]}>{preview.rows[0]?.[header] || "Sem exemplo"}</p></div><select id={`column-${index}`} value={mapping[header] ?? "ignore"} onChange={event => { setMapping(current => ({ ...current, [header]: event.target.value as ImportTarget })); setResult(null) }} className={inputClass}>{Object.entries(IMPORT_TARGETS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>)}</div>
            </div>
            <details className="mt-4 rounded-xl border border-border px-4 py-3 text-sm"><summary className="cursor-pointer font-medium">Localização para todos os contatos <span className="font-normal text-muted-foreground">(opcional)</span></summary><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="space-y-1.5">Cidade<input value={forceCity} onChange={event => setForceCity(event.target.value)} className={inputClass} placeholder="Ex.: Cuiabá" /></label><label className="space-y-1.5">Estado (UF)<input value={forceState} onChange={event => setForceState(event.target.value.toUpperCase())} maxLength={2} className={inputClass} placeholder="Ex.: MT" /></label></div></details>
            {validation && <p role="alert" className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-400">{validation}</p>}
          </section>

          <section className={cardClass}>
            <div className="mb-5"><h3 className="text-lg font-semibold">3. Revise e importe</h3><p className="mt-1 text-sm text-muted-foreground">Confira um exemplo antes de enviar.</p></div>
            <div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-background/70 p-3"><p className="text-xs text-muted-foreground">Arquivo</p><p className="mt-1 truncate text-sm font-medium">{file?.name}</p></div><div className="rounded-xl bg-background/70 p-3"><p className="text-xs text-muted-foreground">Destino</p><p className="mt-1 text-sm font-medium">{NICHES.find(item => item.id === nicho)?.label ?? (nicho.startsWith("black-friday-") ? `Black Friday ${nicho.slice(-4)}` : nicho || "Não selecionado")}</p></div><div className="rounded-xl bg-background/70 p-3"><p className="text-xs text-muted-foreground">Contatos na planilha</p><p className="mt-1 text-sm font-medium">{preview.totalRows.toLocaleString("pt-BR")}</p></div></div>
            {descriptionColumns > 0 && <p className="mb-4 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">Campos de descrição serão enviados ao CRM como negócio ou nota, conforme o ID mapeado.</p>}
            <div className="mb-4 grid gap-3 sm:grid-cols-3">{samples.slice(0, 3).map((row, index) => <article key={index} className="min-w-0 rounded-xl border border-border bg-background/50 p-3"><p className="truncate text-sm font-semibold">{row.name || "Sem nome"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{row.phone || "Sem telefone"}</p><p className="mt-2 truncate text-xs text-muted-foreground">{[row.city, row.state, row.company, row.email, row.jobTitle].filter(Boolean).join(" · ")}</p>{row.dealDescription && <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">{row.dealDescription}</p>}</article>)}</div>
            <p className="mb-4 flex items-start gap-2 text-xs text-muted-foreground"><Users className="mt-0.5 h-4 w-4 shrink-0" />Contatos que já existem não serão duplicados no Painel e continuam sendo sincronizados com o CRM.</p>
            <button type="button" onClick={importFile} disabled={saving || reading || !!validation || !nicho || !!result} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{saving ? <><LoaderCircle className="h-4 w-4 animate-spin" />Importando...</> : result ? <>Importação concluída <Check className="h-4 w-4" /></> : <>Importar {preview.totalRows.toLocaleString("pt-BR")} {preview.totalRows === 1 ? "contato" : "contatos"}<ArrowRight className="h-4 w-4" /></>}</button>
          </section>
        </>}
      </fieldset>

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
      {result && <section role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-5"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"><Check className="h-5 w-5" /></span><div><h3 className="font-semibold">Importação concluída</h3><p className="mt-1 text-sm text-muted-foreground">{String(stats?.inseridos ?? 0)} contatos novos no Painel · {String(stats?.linhasInvalidas ?? 0)} linhas inválidas · {String(stats?.erros ?? 0)} erros</p>{crmImport && <p className="mt-2 text-sm text-muted-foreground">{crmImport.contactsCount ?? 0} contatos enviados para a fila do CRM{(crmImport.dealsCount ?? 0) > 0 ? ` · ${crmImport.dealsCount} negócios ou notas` : ""}.</p>}{crmImport && !crmImport.configured && <p className="mt-2 text-sm text-amber-400">A fila aguarda a configuração do CRM no servidor.</p>}</div></div>{(Number(stats?.erros ?? 0) > 0 || Number(stats?.linhasInvalidas ?? 0) > 0) && <details className="mt-4 text-sm"><summary className="cursor-pointer">Ver detalhes</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify({ erros: stats?.errosDetalhes, linhas: stats?.exemplosErrosValidacao }, null, 2)}</pre></details>}</section>}

      <section className={cardClass}>
        <div className="mb-4 flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"><History className="h-4 w-4" /></span><div><h3 className="font-semibold">Histórico</h3><p className="mt-1 text-xs text-muted-foreground">Desimporte um lote para remover do Painel os contatos novos daquele arquivo.</p></div></div>
        {history.length === 0 ? <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center"><FileSpreadsheet className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">Suas importações aparecerão aqui.</p></div> : <ul className="divide-y divide-border">{history.map(batch => { const canUndo = batch.status !== "undone" || (batch.niche.toLowerCase().includes("black-friday") && batch.removedCount < batch.importedCount); return <li key={batch.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="flex min-w-0 items-start gap-3"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="truncate text-sm font-medium">{batch.fileName}</p><p className="mt-1 text-xs text-muted-foreground">{batch.niche} · {new Date(batch.createdAt).toLocaleString("pt-BR")} · {batch.importedCount} novos · {batch.existingCount} já existentes{batch.status === "undone" ? ` · ${batch.removedCount < batch.importedCount ? "parcialmente desfeito" : "desfeito"} (${batch.removedCount}/${batch.importedCount} removidos)` : ""}</p></div></div>{canUndo && <button type="button" onClick={() => void undoImport(batch.id)} disabled={undoing !== null} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm transition hover:border-destructive/50 hover:text-destructive disabled:opacity-50">{undoing === batch.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}{undoing === batch.id ? "Desfazendo..." : batch.status === "undone" ? "Concluir remoção" : "Desimportar"}</button>}</li>})}</ul>}
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">Desfazer afeta o Painel. Envios já concluídos no CRM precisam ser tratados diretamente nele.</p>
      </section>
    </div>
  )
}
