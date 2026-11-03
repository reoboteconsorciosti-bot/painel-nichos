"use client"

import { useEffect, useState } from "react"
import { NICHES } from "@/lib/data"
import { IMPORT_TARGETS, MAX_IMPORT_BYTES, mapImportRow, validateMapping, type ColumnMapping, type ImportTarget } from "@/lib/import-mapping"

type Preview = { headers: string[]; rows: Record<string, string>[]; sheets: string[]; sheetName: string; totalRows: number; mapping: ColumnMapping }
const inputClass = "h-10 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm"

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
    setError(null)
    setPreview(null)
    setResult(null)
    setSheet("")
    setSheets([])
    setHeaderRow(1)
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
  const descriptionColumns = Object.values(mapping).filter(target => target === "dealDescription").length

  async function importFile() {
    if (!file || !preview || validation || !nicho || saving) return
    setSaving(true)
    setError(null)
    setResult(null)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("sheetName", preview.sheetName)
      form.append("headerRow", String(headerRow))
      form.append("columnMapping", JSON.stringify(mapping))
      form.append("nichoFolder", nicho)
      form.append("forceCity", forceCity)
      form.append("forceState", forceState)
      form.append("maxRowsPerFile", "5000")
      const response = await fetch("/api/import/upload", { method: "POST", body: form })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || "Não foi possível importar.")
      setResult(data)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível importar.") }
    finally { setSaving(false) }
  }

  const stats = result?.stats as Record<string, unknown> | undefined
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <div><h2 className="text-2xl font-semibold">Importar contatos</h2><p className="mt-1 text-sm text-muted-foreground">Envie a planilha, escolha o destino das colunas e confira antes de importar.</p></div>
      <fieldset disabled={saving} className="min-w-0 space-y-6 disabled:opacity-70">
        <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
          <h3 className="font-semibold">1. Escolha o arquivo e o nicho</h3>
          <label className="block space-y-2 text-sm">Arquivo Excel ou CSV<input type="file" accept=".xlsx,.csv" className="block w-full rounded-md border border-border p-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:p-2 file:text-primary" onChange={event => selectFile(event.target.files?.[0] ?? null)} /></label>
          <p className="text-xs text-muted-foreground">Até 5.000 contatos e 20 MB. O arquivo só será importado após sua confirmação.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">Nicho<select aria-label="Nicho" className={inputClass} value={nicho} onChange={e => setNicho(e.target.value)}><option value="">Selecione o nicho</option><option value={`black-friday-${new Date().getFullYear()}`}>Black Friday {new Date().getFullYear()}</option>{NICHES.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
            {sheets.length > 1 && <label className="space-y-2 text-sm">Aba da planilha<select className={inputClass} value={sheet || preview?.sheetName || sheets[0]} onChange={e => { setPreview(null); setSheet(e.target.value) }}>{sheets.map(name => <option key={name}>{name}</option>)}</select></label>}
            {file && <label className="space-y-2 text-sm">Linha com os nomes das colunas<input type="number" min={1} max={100} value={headerRow} onChange={e => { setPreview(null); setHeaderRow(Number(e.target.value)) }} className={inputClass} /></label>}
          </div>
          {file && <p className="text-xs text-muted-foreground">Arquivo: {file.name}{preview && ` · ${preview.totalRows.toLocaleString("pt-BR")} ${preview.totalRows === 1 ? "contato" : "contatos"}`}</p>}
          {reading && <p role="status" className="text-sm text-primary">Lendo a planilha...</p>}
        </section>
        {preview && <>
          <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
            <div><h3 className="font-semibold">2. Para onde vai cada coluna?</h3><p className="mt-1 text-xs text-muted-foreground">Sugerimos alguns campos. Você pode alterar todos. Escolha “Descrição do negócio” em quantas colunas quiser.</p></div>
            <div className="space-y-3">{preview.headers.map((header, index) => <div key={header} className="grid items-center gap-2 border-b border-border pb-3 sm:grid-cols-2"><div className="min-w-0"><label htmlFor={`column-${index}`} className="break-words text-sm font-medium">{header}</label><p className="truncate text-xs text-muted-foreground" title={preview.rows[0]?.[header]}>{preview.rows[0]?.[header] || "Sem valor na primeira linha"}</p></div><select id={`column-${index}`} value={mapping[header] ?? "ignore"} onChange={e => { setMapping(current => ({ ...current, [header]: e.target.value as ImportTarget })); setResult(null) }} className={inputClass}>{Object.entries(IMPORT_TARGETS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>)}</div>
            <details className="text-sm"><summary className="cursor-pointer">Definir a mesma cidade ou estado para todos</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="space-y-1">Cidade<input value={forceCity} onChange={e => setForceCity(e.target.value)} className={inputClass} placeholder="Opcional" /></label><label className="space-y-1">Estado (UF)<input value={forceState} onChange={e => setForceState(e.target.value.toUpperCase())} maxLength={2} className={inputClass} placeholder="Ex.: MT" /></label></div></details>
            {validation && <p role="status" className="text-sm text-amber-400">{validation}</p>}
          </section>
          <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
            <h3 className="font-semibold">3. Confira e importe</h3>
            {descriptionColumns > 0 && <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">As colunas da descrição serão unidas com seus nomes. Ao gerar uma lista com envio ao CRM, cada contato terá um negócio com essa descrição. Se você mapear um ID de negócio existente, o texto será acrescentado como nota, preservando a descrição atual.</div>}
            {samples.length > 0 ? <div className="space-y-3">{samples.slice(0, 3).map((row, index) => <div key={index} className="rounded-lg border border-border p-3 text-sm"><p className="font-medium">{row.name || "Sem nome"} · {row.phone || "Sem telefone"}</p><p className="text-xs text-muted-foreground">{[row.city, row.state, row.company, row.email, row.jobTitle].filter(Boolean).join(" · ")}</p>{row.dealDescription && <div className="mt-3"><p className="mb-1 text-xs font-medium text-primary">{row.crmDealId ? `Nota no negócio ${row.crmDealId}` : "Descrição do novo negócio"}</p><p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{row.dealDescription}</p></div>}</div>)}</div> : <p className="text-sm text-muted-foreground">Complete o mapeamento para ver a prévia.</p>}
            <p className="text-xs text-muted-foreground">Esta etapa salva os contatos no painel. O envio ao CRM acontece quando você gerar a lista e ativar “Enviar ao CRM”. Telefones já existentes serão ignorados, preservando seus dados.</p>
            <button type="button" onClick={importFile} disabled={saving || reading || !!validation || !nicho || !!result} className="min-h-11 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Importando..." : result ? "Arquivo importado" : `Importar ${preview.totalRows.toLocaleString("pt-BR")} ${preview.totalRows === 1 ? "contato" : "contatos"}`}</button>
            {!nicho && <p className="text-xs text-muted-foreground">Selecione o nicho para importar.</p>}
          </section>
        </>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {result && <div role="status" className="space-y-3 rounded-xl border border-border bg-card p-4"><h3 className="font-semibold">Importação concluída</h3><div className="flex flex-wrap gap-4 text-sm"><span>{String(stats?.inseridos ?? 0)} importados</span><span>{String(stats?.ignoradosDuplicados ?? 0)} duplicados ignorados</span><span>{String(stats?.linhasInvalidas ?? 0)} linhas inválidas</span><span>{String(stats?.erros ?? 0)} erros</span></div>{(Number(stats?.erros ?? 0) > 0 || Number(stats?.linhasInvalidas ?? 0) > 0) && <details className="text-xs"><summary className="cursor-pointer">Ver detalhes</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({ erros: stats?.errosDetalhes, linhas: stats?.exemplosErrosValidacao }, null, 2)}</pre></details>}</div>}
    </div>
  )
}
