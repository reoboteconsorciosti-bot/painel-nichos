
import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"
import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import csvParser from "csv-parser"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

type RawRow = Record<string, unknown>

type NormalizedLead = {
  nome: string
  telefone: string
  razao_social: string | null
  cidade: string | null
  estado: string | null
  nicho: string
  origem_arquivo: string
}

type DbLeadInput = {
  name?: string
  phone: string
  nicho?: string
  city?: string
  state?: string
  company?: string
  fantasy?: string
}

type EtlStats = {
  nichos: number
  arquivos: number
  arquivosPulados: number
  linhasLidas: number
  inseridos: number
  atualizados: number
  ignoradosSemTelefone: number
  ignoradosSemCidade: number
  linhasInvalidas: number
  exemplosErrosValidacao: Array<{ arquivo: string; motivo: string; debug?: Record<string, string> }>
  erros: number
  arquivosComErro: string[]
  amostraHeaders: Record<string, string[]>
  headersIgnorados: Record<string, string[]>
  errosDetalhes: Record<string, string>
}

export const runtime = "nodejs"

function normalizePhone(input: unknown): string {
  const raw = String(input ?? "").trim()
  if (!raw) return ""

  // Alguns CSVs/planilhas exportam telefone em notação científica (ex.: 6.5998136929E+10).
  // Se apenas removermos não-dígitos, acabamos “colando” o expoente e quebrando o telefone.
  if (/[eE][+-]?\d+/.test(raw)) {
    const parts = raw.split(/e/i)
    const mantissaRaw = (parts[0] ?? "").trim()
    const expRaw = (parts[1] ?? "").trim()
    const exp = Number(expRaw)

    // parse científico por string (lida com vírgula decimal e evita perdas/NaN)
    if (Number.isInteger(exp) && exp >= 0) {
      const mantissaNormalized = mantissaRaw.replace(",", ".")
      const m = mantissaNormalized.match(/^(\d+)(?:\.(\d+))?$/)
      if (m) {
        const intPart = m[1] ?? ""
        const fracPart = m[2] ?? ""
        const digits = (intPart + fracPart).replace(/^0+/, "")
        const fracLen = fracPart.length
        const zerosNeeded = exp - fracLen
        if (digits && zerosNeeded >= 0) {
          return digits + "0".repeat(zerosNeeded)
        }
      }
    }

    // fallback numérico (pode falhar com vírgula decimal)
    const n = Number(raw.replace(",", "."))
    if (Number.isFinite(n)) {
      const asInt = Math.trunc(n)
      if (asInt > 0) return String(asInt)
    }
  }

  const digits = raw.replace(/\D/g, "")
  if (!digits) return ""
  return digits
}

function isValidCpfDigits(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false
  if (/^(\d)\1{10}$/.test(digits)) return false
  const nums = digits.split("").map((c) => Number(c))
  let sum1 = 0
  for (let i = 0; i < 9; i++) sum1 += nums[i]! * (10 - i)
  let d1 = (sum1 * 10) % 11
  if (d1 === 10) d1 = 0
  if (d1 !== nums[9]) return false
  let sum2 = 0
  for (let i = 0; i < 10; i++) sum2 += nums[i]! * (11 - i)
  let d2 = (sum2 * 10) % 11
  if (d2 === 10) d2 = 0
  return d2 === nums[10]
}

function isValidCnpjDigits(digits: string): boolean {
  if (!/^\d{14}$/.test(digits)) return false
  if (/^(\d)\1{13}$/.test(digits)) return false
  const nums = digits.split("").map((c) => Number(c))
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  let sum1 = 0
  for (let i = 0; i < 12; i++) sum1 += nums[i]! * w1[i]!
  let r1 = sum1 % 11
  const d1 = r1 < 2 ? 0 : 11 - r1
  if (d1 !== nums[12]) return false
  let sum2 = 0
  for (let i = 0; i < 13; i++) sum2 += nums[i]! * w2[i]!
  let r2 = sum2 % 11
  const d2 = r2 < 2 ? 0 : 11 - r2
  return d2 === nums[13]
}

function isCpfOrCnpjDigits(digits: string): boolean {
  return isValidCpfDigits(digits) || isValidCnpjDigits(digits)
}

function isLikelyPhoneDigits(digitsRaw: string): boolean {
  let digits = digitsRaw

  // Remove DDI comum no Brasil
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2)
  }

  // Remove prefixo tronco 0 (ex.: 067...) que aparece em algumas planilhas
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1)
  }

  if (!/^\d+$/.test(digits)) return false
  if (digits.length !== 10 && digits.length !== 11) return false
  if (isCpfOrCnpjDigits(digits)) return false
  if (/^(\d)\1{9,10}$/.test(digits)) return false

  // Heurística BR: número de 11 dígitos normalmente é celular (DDD + 9xxxxxxxx).
  // Isso ajuda a evitar que CPF (11 dígitos) vire "telefone".
  if (digits.length === 11 && digits[2] !== "9") return false

  return true
}

function normalizeText(input: unknown): string {
  const s = String(input ?? "").trim()
  if (!s) return ""

  // Alguns CSVs/exports usam "\\N" como marcador de NULL.
  // Se não tratarmos isso, o PDF acaba imprimindo "\N" como se fosse nome/razão/etc.
  if (s === "\\N" || s.toUpperCase() === "\\N") return ""

  return s
}

function normalizeUpper(input: unknown): string {
  return normalizeText(input).toUpperCase()
}

function normalizeCity(input: unknown): string {
  return normalizeText(input)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

function normalizeKey(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
}

function mapFolderToNicheId(folderName: string): string {
  const folderKey = normalizeKey(folderName)

  if (folderKey.includes("EMPRESAS")) {
    // Mantemos os nomes das pastas (EMPRESAS MS/MT) para compatibilidade com dados já importados
    return folderName
  }

  if (folderKey.includes("ADVOG")) return "advogados"
  if (folderKey.includes("ARQUIT")) return "arquitetos"
  if (folderKey.includes("AUTO") && folderKey.includes("ESCOLA")) return "auto-escola"
  if (folderKey.includes("MATERIAL") && (folderKey.includes("CONSTRU") || folderKey.includes("CONSTRUCAO"))) return "material-de-construcao"
  if (folderKey.includes("MOVEIS") && folderKey.includes("PLANE")) return "moveis-planejados"
  if (folderKey.includes("PRODUTOR") && folderKey.includes("RURAL")) return "produtor-rural"
  if (folderKey.includes("AUTOSERV")) return "auto-services"
  if (folderKey.includes("DENT")) return "dentistas"
  if (folderKey.includes("ENGEN")) return "engenheiros"
  if (folderKey.includes("FARM")) return "farmaceuticos"
  if (folderKey.includes("MEDIC")) return "medicos"
  if (folderKey.includes("LOJAS") && folderKey.includes("ROUP")) return "lojas-de-roupa"

  // fallback: grava o nome da pasta
  return folderName
}

function normalizeUf(input: unknown): string {
  const uf = normalizeUpper(input)
  return uf.slice(0, 2)
}

function toOptionalNonEmptyString(input: unknown): string | undefined {
  const s = normalizeText(input)
  return s ? s : undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isDeadlockError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes("40P01") || msg.toLowerCase().includes("deadlock detected")
}

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9]+/g, "")
}

// Backwards-compat alias used in older code paths
function canonicalKey(input: string): string {
  return normalizeHeader(input)
}

function buildCanonicalMap(row: RawRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    const ck = canonicalKey(k)
    if (!ck) continue
    if (out[ck] === undefined) out[ck] = v
  }
  return out
}

type StandardRow = {
  name?: unknown
  phone?: unknown
  city?: unknown
  state?: unknown
  company?: unknown
  fantasy?: unknown
  email?: unknown
  ddd1?: unknown
  phone1?: unknown
  ddd2?: unknown
  phone2?: unknown
  phones: unknown[]
}

type StandardFieldKey = Exclude<keyof StandardRow, "phones">

const HEADER_EQUIV: Record<string, StandardFieldKey> = {
  // name
  nome: "name",
  name: "name",
  cliente: "name",
  contato: "name",
  responsavel: "name",
  nomecompleto: "name",
  nomedocontato: "name",
  nomeresponsavel: "name",
  socio: "name",
  socionome: "name",
  socioresponsavel: "name",
  Socio: "name",
  Socio1Nome: "name",
  // phone
  telefone: "phone",
  phone: "phone",
  tel: "phone",
  fone: "phone",
  celular: "phone",
  whatsapp: "phone",
  whats: "phone",
  fonecontato: "phone",
  cel: "phone",
  SOCIO1Celular1: "phone",
  // city/state
  cidade: "city",
  CIDADE: "city",
  city: "city",
  municipio: "city",
  localidade: "city",
  uf: "state",
  UF: "state",
  estado: "state",
  // company
  razaosocial: "company",
  razao: "company",
  empresa: "company",
  nomeempresa: "company",
  nomefantasia: "fantasy",
  fantasia: "fantasy",
  // email
  email: "email",
  email1: "email",
  email2: "email",
  "email-1": "email",
  // DDD/phones common in your sheets
  ddd: "ddd1",
  ddd1: "ddd1",
  telefone1: "phone1",
  fone1: "phone1",
  celular1: "phone1",
  ddd2: "ddd2",
  telefone2: "phone2",
  fone2: "phone2",
  celular2: "phone2",
}

function mapHeadersToStandard(row: RawRow): { mapped: StandardRow; ignored: string[] } {
  const mapped: StandardRow = { phones: [] }
  const ignored: string[] = []

  for (const [rawHeader, value] of Object.entries(row)) {
    const h = normalizeHeader(rawHeader)
    if (!h) continue

    // normalize common patterns: "celular1" / "celular2" etc already handled by normalizeHeader
    let stdKey = HEADER_EQUIV[h]
    if (!stdKey) {
      // Heurística: algumas planilhas vêm com headers combinados (ex.: "CIDADE/UF", "CIDADE - UF").
      // Após normalizeHeader, isso vira algo como "cidadeuf" e não bate no alias exato.
      if (h.includes("cidade") || h.includes("municipio") || h.includes("localidade")) stdKey = "city"
      else if (h === "uf" || h.includes("estado")) stdKey = "state"
      else if (h === "socio" || h.includes("socio") || h.includes("socioresponsavel") || h.includes("socionome")) stdKey = "name"
      else if (
        h.includes("telefone") ||
        h.includes("celular") ||
        h.includes("whats") ||
        h.includes("whatsapp") ||
        h === "fone" ||
        h.includes("fone")
      ) {
        stdKey = "phone"
      }
      else {
        ignored.push(rawHeader)
        continue
      }
    }

    if (stdKey === "phone") {
      mapped.phones.push(value)
      if (mapped.phone === undefined) mapped.phone = value
      continue
    }

    if (mapped[stdKey] === undefined) mapped[stdKey] = value
  }

  return { mapped, ignored }
}

function isRowCompletelyEmpty(row: RawRow): boolean {
  for (const v of Object.values(row)) {
    if (v === undefined || v === null) continue
    if (String(v).trim() !== "") return false
  }
  return true
}

const HEADER_ALIASES = {
  nome: [
    "nome",
    "nomecompleto",
    "nomedocontato",
    "nomeresponsavel",
    "contato",
    "responsavel",
    "socio",
    "sócio",
    "socionome",
    "socio nome",
    "nome do socio",
    "nome do sócio",
    "socio_nome",
    "socio-nome",
    "socioresponsavel",
    "lead",
    "cliente",
    "profissional",
    "noprofissional",
    "Socio",
  ],
  razaoSocial: [
    "razaosocial",
    "razao_social",
    "razaosocialempresa",
    "empresa",
    "nomeempresa",
    "razao",
  ],
  fantasia: ["nomefantasia", "fantasia"],
  cidade: ["cidade", "municipio", "localidade", "CIDADE"],
  estado: ["uf", "estado", "ESTADO", "UF"],
  cnpj: ["cnpj", "cpfcnpj", "documento", "socio1documento", "socio2documento"],
  email: ["email", "email1", "email2", "emailprincipal", "email-1", "email-2", "email1"],
  // phones
  ddd: ["ddd", "ddd1", "ddd2", "DDD"],
  telefone: [
    "telefone",
    "FONE",
    "tel",
    "fone",
    "whatsapp",
    "whats",
    "celular",
    "telefone1",
    "telefone2",
    "fone1",
    "fone2",
    "celular1",
    "celular2",
    "celular 1",
    "celular 2",
    "socio1celular1",
    "socio1celular2",
    "socio2celular1",
    "socio2celular2",
    "fonecontato",
  ],
} as const

type CanonicalMap = Record<string, unknown>

function toCanonicalAliases(list: readonly string[]): string[] {
  return list.map((s) => canonicalKey(s))
}

const CANONICAL_ALIASES = {
  nome: toCanonicalAliases(HEADER_ALIASES.nome),
  razaoSocial: toCanonicalAliases(HEADER_ALIASES.razaoSocial),
  fantasia: toCanonicalAliases(HEADER_ALIASES.fantasia),
  cidade: toCanonicalAliases(HEADER_ALIASES.cidade),
  estado: toCanonicalAliases(HEADER_ALIASES.estado),
  cnpj: toCanonicalAliases(HEADER_ALIASES.cnpj),
  email: toCanonicalAliases(HEADER_ALIASES.email),
  ddd: toCanonicalAliases(HEADER_ALIASES.ddd),
  telefone: toCanonicalAliases(HEADER_ALIASES.telefone),
} as const

function pickFirstFromAliases(cmap: CanonicalMap, aliases: readonly string[]): unknown {
  for (const a of aliases) {
    const v = cmap[a]
    if (v !== undefined && v !== null && String(v).trim() !== "") return v
  }
  return ""
}

function pickManyFromAliases(cmap: CanonicalMap, aliases: readonly string[]): unknown[] {
  const out: unknown[] = []
  for (const a of aliases) {
    const v = cmap[a]
    if (v !== undefined && v !== null && String(v).trim() !== "") out.push(v)
  }
  return out
}

function phoneFromDddAndNumber(dddRaw: unknown, numberRaw: unknown): string {
  const ddd = normalizePhone(dddRaw)
  const num = normalizePhone(numberRaw)
  if (!ddd || !num) return ""
  return `${ddd}${num}`
}

function phoneFromDddAndFoneFallback(mapped: StandardRow): string {
  // Layout comum: colunas "DDD" + "FONE" (sem sufixo 1/2).
  // Nesses casos, o header "FONE" cai em mapped.phone, e a junção ddd+phone1 não funciona.
  const ddd = mapped.ddd1
  const fone = mapped.phone
  const joined = phoneFromDddAndNumber(ddd, fone)
  if (joined) return joined

  // Fallback alternativo: se existir ddd (como ddd2) + phone
  const joined2 = phoneFromDddAndNumber(mapped.ddd2, fone)
  if (joined2) return joined2

  return ""
}

function pickByKeyRegex(cmap: Record<string, unknown>, regex: RegExp): unknown {
  for (const k of Object.keys(cmap)) {
    if (!regex.test(k)) continue
    const v = cmap[k]
    if (v !== undefined && v !== null && String(v).trim() !== "") return v
  }
  return ""
}

function pickLikelyPhoneValue(row: RawRow): unknown {
  // fallback: look for any cell value that resembles a phone number
  for (const [k, v] of Object.entries(row)) {
    const hk = normalizeHeader(k)
    if (hk.includes("cpf") || hk.includes("cnpj") || hk.includes("document")) continue
    const digits = String(v ?? "").replace(/\D/g, "")
    if (!digits) continue
    if (!isLikelyPhoneDigits(digits)) continue
    return v
  }
  return ""
}

function pickFirstCanonical(cmap: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = cmap[k]
    if (v !== undefined && v !== null && String(v).trim() !== "") return v
  }
  return ""
}

function concat(row: RawRow): string {
  let dddVal: unknown = undefined
  let foneVal: unknown = undefined

  for (const [k, v] of Object.entries(row ?? {})) {
    const hk = normalizeHeader(k)
    if (!hk) continue

    if (dddVal === undefined) {
      // normalizeHeader() sempre retorna minúsculo
      if (hk === "ddd" || hk === "ddd1" || hk === "ddd2" || hk.includes("ddd")) {
        if (v !== undefined && v !== null && String(v).trim() !== "") dddVal = v
      }
    }

    if (foneVal === undefined) {
      if (
        hk === "fone" ||
        hk === "tel" ||
        hk === "telefone" ||
        hk.includes("telefone") ||
        hk.includes("celular") ||
        hk.includes("whats") ||
        hk.includes("whatsapp") ||
        hk.includes("fone")
      ) {
        if (v !== undefined && v !== null && String(v).trim() !== "") foneVal = v
      }
    }

    if (dddVal !== undefined && foneVal !== undefined) break
  }

  const ddd = normalizePhone(dddVal)
  const fone = normalizePhone(foneVal)
  if (!ddd || !fone) return ""
  return `${ddd}${fone}`
}

function rowHasAnyPhoneFields(row: RawRow): boolean {
  const { mapped } = mapHeadersToStandard(row)

  if (mapped.phone !== undefined && String(mapped.phone).trim() !== "") return true
  if (Array.isArray(mapped.phones) && mapped.phones.some((v) => String(v ?? "").trim() !== "")) return true

  const p1 = phoneFromDddAndNumber(mapped.ddd1, mapped.phone1)
  const p2 = phoneFromDddAndNumber(mapped.ddd2, mapped.phone2)
  if (p1 || p2) return true

  const p0 = phoneFromDddAndFoneFallback(mapped)
  if (p0) return true

  const likely = normalizePhone(pickLikelyPhoneValue(row))
  if (likely && likely.length >= 10) return true

  return false
}

function rowHasAnyPhoneColumnsByHeader(row: RawRow): boolean {
  const keys = Object.keys(row ?? {})
  for (const k of keys) {
    const nk = normalizeKey(k)
    if (!nk) continue
    if (nk.includes("TELEFONE") || nk.includes("CELULAR") || nk.includes("WHATSAPP") || nk === "FONE" || nk.includes("FONE")) {
      return true
    }
    if (nk === "DDD" || nk === "DDD1" || nk === "DDD2" || nk.includes("DDD")) return true
  }
  return false
}

function sampleHasAnyPhoneValue(rows: RawRow[], sampleSize: number): boolean {
  const n = Math.min(rows.length, Math.max(1, sampleSize))
  for (let i = 0; i < n; i++) {
    if (rowHasAnyPhoneFields(rows[i] as RawRow)) return true
  }
  return false
}

function normalizeRow(
  row: RawRow,
  nicho: string,
  origemArquivo: string,
): { lead: NormalizedLead | null; reason?: "missing_or_invalid_phone"; debug?: Record<string, string> } {
  const { mapped } = mapHeadersToStandard(row)

  const nome = normalizeText(mapped.name)

  // normalização / padronização de telefones
  const phoneCandidates: string[] = []

  const p0 = phoneFromDddAndFoneFallback(mapped)
  if (p0) phoneCandidates.push(p0)

  const pConcat = concat(row)
  if (pConcat) phoneCandidates.push(pConcat)

  const p1 = phoneFromDddAndNumber(mapped.ddd1, mapped.phone1)
  const p2 = phoneFromDddAndNumber(mapped.ddd2, mapped.phone2)
  if (p1) phoneCandidates.push(p1)
  if (p2) phoneCandidates.push(p2)

  if (mapped.phone !== undefined) {
    const p = normalizePhone(mapped.phone)
    if (p) phoneCandidates.push(p)
  }

  for (const v of mapped.phones ?? []) {
    const p = normalizePhone(v)
    if (p) phoneCandidates.push(p)
  }

  const likely = normalizePhone(pickLikelyPhoneValue(row))
  if (likely) phoneCandidates.push(likely)

  const telefone =
    phoneCandidates
      .map((p) => normalizePhone(p))
      .filter(Boolean)
      .find((p) => isLikelyPhoneDigits(p)) ?? ""
  if (!telefone) {
    const ddd1 = normalizePhone(mapped.ddd1)
    const phoneRaw = normalizePhone(mapped.phone)
    const phone1 = normalizePhone(mapped.phone1)
    const phone2 = normalizePhone(mapped.phone2)
    return {
      lead: null,
      reason: "missing_or_invalid_phone",
      debug: {
        raw_keys_sample: Object.keys(row ?? {}).slice(0, 30).join("|"),
        ddd1,
        phone: phoneRaw,
        phone1,
        phone2,
        joined_ddd_phone: phoneFromDddAndFoneFallback(mapped),
        concat_ddd_fone: concat(row),
        joined_ddd1_phone1: phoneFromDddAndNumber(mapped.ddd1, mapped.phone1),
        joined_ddd2_phone2: phoneFromDddAndNumber(mapped.ddd2, mapped.phone2),
        likely,
      },
    }
  }

  // normalização de texto e nulls
  const razao_social = normalizeText(mapped.company || mapped.fantasy) || null
  const cidade = normalizeCity(mapped.city) || null
  const estado = normalizeUf(mapped.state) || null

  return {
    lead: {
      nome,
      telefone,
      razao_social,
      cidade,
      estado,
      nicho,
      origem_arquivo: origemArquivo,
    },
  }
}

async function listSubdirs(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
}

async function listFilesRecursive(dir: string, maxDepth: number): Promise<string[]> {
  const results: string[] = []
  const queue: Array<{ abs: string; rel: string; depth: number }> = [{ abs: dir, rel: "", depth: 0 }]

  while (queue.length > 0) {
    const cur = queue.shift()
    if (!cur) break
    if (cur.depth > maxDepth) continue

    const entries = await fs.readdir(cur.abs, { withFileTypes: true })
    for (const e of entries) {
      const abs = path.join(cur.abs, e.name)
      const rel = cur.rel ? `${cur.rel}/${e.name}` : e.name

      if (e.isDirectory()) {
        queue.push({ abs, rel, depth: cur.depth + 1 })
        continue
      }

      if (!e.isFile()) continue
      if (!/\.(xlsx|csv)$/i.test(e.name)) continue
      results.push(rel)
    }
  }

  return results
}

async function parseXlsx(filePath: string, maxRowsPerFile: number | null): Promise<RawRow[]> {
  // Prefer buffer read (works better on some network shares); fallback to readFile.
  let workbook: XLSX.WorkBook
  try {
    const buf = await fs.readFile(filePath)
    workbook = XLSX.read(buf, { type: "buffer", cellDates: true })
  } catch {
    workbook = XLSX.readFile(filePath, { cellDates: true })
  }
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]

  const ref = worksheet["!ref"]
  if (!ref) return []
  const range = XLSX.utils.decode_range(ref)

  // limit number of data rows converted to JSON to avoid OOM
  const maxRows = maxRowsPerFile ? Math.max(1, maxRowsPerFile) : null
  const endRow = maxRows ? Math.min(range.e.r, range.s.r + maxRows) : range.e.r
  const limitedRange = { s: range.s, e: { r: endRow, c: range.e.c } }

  return XLSX.utils.sheet_to_json(worksheet, {
    defval: "",
    range: limitedRange,
  }) as RawRow[]
}

async function parseCsv(filePath: string, maxRowsPerFile: number | null): Promise<RawRow[]> {
  const rows: RawRow[] = []

  let separator = ","
  try {
    const head = fsSync.readFileSync(filePath, { encoding: "utf8" }).slice(0, 2048)
    const firstLine = head.split(/\r?\n/)[0] ?? ""
    const semi = (firstLine.match(/;/g) ?? []).length
    const comma = (firstLine.match(/,/g) ?? []).length
    const tab = (firstLine.match(/\t/g) ?? []).length
    if (semi > comma && semi > tab) separator = ";"
    else if (tab > comma && tab > semi) separator = "\t"
  } catch {
    // ignore autodetect errors; keep default
  }

  await new Promise<void>((resolve, reject) => {
    const stream = fsSync.createReadStream(filePath)
    const parser = csvParser({ separator })

    const onData = (data: unknown) => {
      rows.push(data as RawRow)
      if (maxRowsPerFile && rows.length >= maxRowsPerFile) {
        // stop early to avoid OOM on huge CSVs
        stream.destroy()
      }
    }

    parser.on("data", onData)
    parser.on("end", () => resolve())
    parser.on("error", (err: unknown) => reject(err))
    stream.on("close", () => resolve())
    stream.on("error", (err: unknown) => reject(err))

    stream.pipe(parser)
  })

  return rows
}

async function upsertBatchPrisma(leads: NormalizedLead[]): Promise<{ inserted: number; updated: number }> {
  if (leads.length === 0) return { inserted: 0, updated: 0 }

  const inputs: DbLeadInput[] = leads.map((l) => ({
    phone: l.telefone,
    name: toOptionalNonEmptyString(l.nome),
    nicho: toOptionalNonEmptyString(l.nicho),
    city: toOptionalNonEmptyString(l.cidade),
    state: toOptionalNonEmptyString(l.estado),
    company: toOptionalNonEmptyString(l.razao_social),
    fantasy: undefined,
  }))

  const phones = inputs.map((i) => i.phone)
  const existing = await prisma.lead.findMany({
    where: { phone: { in: phones } },
    select: { phone: true },
  })
  const existingSet = new Set(
    existing
      .map((e) => e.phone)
      .filter((phone): phone is string => typeof phone === "string"),
  )

  const toCreate = inputs.filter((i) => !existingSet.has(i.phone)).sort((a, b) => a.phone.localeCompare(b.phone))
  const toUpdate = inputs.filter((i) => existingSet.has(i.phone)).sort((a, b) => a.phone.localeCompare(b.phone))

  if (toCreate.length > 0) {
    await prisma.lead.createMany({
      data: toCreate.map((i) => ({
        phone: i.phone,
        name: i.name ?? null,
        nicho: i.nicho ?? null,
        city: i.city ?? null,
        state: i.state ?? null,
        company: i.company ?? null,
        fantasy: i.fantasy ?? null,
      })),
      skipDuplicates: true,
    })
  }

  for (const i of toUpdate) {
    const data = {
      ...(i.name ? { name: i.name } : {}),
      ...(i.nicho ? { nicho: i.nicho } : {}),
      ...(i.city ? { city: i.city } : {}),
      ...(i.state ? { state: i.state } : {}),
      ...(i.company ? { company: i.company } : {}),
      ...(i.fantasy ? { fantasy: i.fantasy } : {}),
    }

    if (Object.keys(data).length === 0) continue

    let attempt = 0
    while (true) {
      try {
        await prisma.lead.update({ where: { phone: i.phone }, data })
        break
      } catch (err) {
        attempt += 1
        if (!isDeadlockError(err) || attempt >= 6) throw err
        await sleep(150 * attempt)
      }
    }
  }

  return { inserted: toCreate.length, updated: toUpdate.length }
}

export async function POST(req: Request) {
  const token = req.headers.get("x-etl-token")
  const expected = process.env.ETL_TOKEN

  if (!expected || token !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const sourceRoot = process.env.LEADS_SOURCE_DIR
  const databaseUrl = process.env.DATABASE_URL

  if (!sourceRoot) {
    return NextResponse.json(
      { ok: false, error: "LEADS_SOURCE_DIR_not_configured" },
      { status: 500 },
    )
  }

  if (!databaseUrl) {
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL_not_configured" },
      { status: 500 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as {
    dryRun?: boolean
    batchSize?: number
    maxFiles?: number
    maxTotalFiles?: number
    maxRowsPerFile?: number
    includeSubdirs?: boolean
    onlyNichos?: string[]
    onlyFiles?: string[]
  }
  const dryRun = body.dryRun === true
  const batchSize = Number.isFinite(body.batchSize) && (body.batchSize as number) > 0 ? Math.min(body.batchSize as number, 5000) : 1000
  const onlyNichos = Array.isArray(body.onlyNichos)
    ? (body.onlyNichos as unknown[])
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
    : []
  const onlyNichosKey = new Set(onlyNichos.map((n) => normalizeKey(n)))

  const onlyFiles = Array.isArray(body.onlyFiles)
    ? (body.onlyFiles as unknown[])
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
    : []

  const onlyFilesKey = new Set(
    onlyFiles
      .map((p) => p.replace(/\\/g, "/"))
      .map((p) => normalizeKey(p)),
  )
  const maxFiles = Number.isFinite(body.maxFiles) && (body.maxFiles as number) > 0 ? Math.min(body.maxFiles as number, 1000) : null
  const maxTotalFiles =
    Number.isFinite(body.maxTotalFiles) && (body.maxTotalFiles as number) > 0
      ? Math.min(body.maxTotalFiles as number, 5000)
      : 20
  const maxRowsPerFile =
    Number.isFinite(body.maxRowsPerFile) && (body.maxRowsPerFile as number) > 0
      ? Math.min(body.maxRowsPerFile as number, 200000)
      : 5000

  const stats: EtlStats = {
    nichos: 0,
    arquivos: 0,
    arquivosPulados: 0,
    linhasLidas: 0,
    inseridos: 0,
    atualizados: 0,
    ignoradosSemTelefone: 0,
    ignoradosSemCidade: 0,
    linhasInvalidas: 0,
    exemplosErrosValidacao: [],
    erros: 0,
    arquivosComErro: [],
    amostraHeaders: {},
    headersIgnorados: {},
    errosDetalhes: {},
  }

  try {
    const allNichos = await listSubdirs(sourceRoot)
    const nichos = onlyNichosKey.size > 0 ? allNichos.filter((n) => onlyNichosKey.has(normalizeKey(n))) : allNichos
    stats.nichos = nichos.length

    let processedFilesTotal = 0

    for (const nicho of nichos) {
      const nichoDir = path.join(sourceRoot, nicho)
      const nichoId = mapFolderToNicheId(nicho)
      const autoRecursive = nichoId === "medicos"
      const recursive = body.includeSubdirs === true || autoRecursive
      const filesAll = recursive ? await listFilesRecursive(nichoDir, 6) : await listFiles(nichoDir)
      const filesByOnlyFiles =
        onlyFilesKey.size > 0
          ? filesAll.filter((f) => {
            const fKey = normalizeKey(String(f ?? "").replace(/\\/g, "/"))
            if (onlyFilesKey.has(fKey)) return true
            for (const pref of onlyFilesKey) {
              if (pref && fKey.startsWith(pref)) return true
            }
            return false
          })
          : filesAll

      const files = maxFiles ? filesByOnlyFiles.slice(0, maxFiles) : filesByOnlyFiles

      for (const fileName of files) {
        if (maxTotalFiles && processedFilesTotal >= maxTotalFiles) break

        if (/layout/i.test(fileName)) {
          stats.arquivosPulados += 1
          continue
        }

        stats.arquivos += 1
        processedFilesTotal += 1
        const filePath = path.join(nichoDir, fileName)
        const origemArquivo = path.relative(sourceRoot, filePath).replace(/\\/g, "/")

        let rows: RawRow[] = []
        try {
          if (/\.xlsx$/i.test(fileName)) rows = await parseXlsx(filePath, maxRowsPerFile)
          else rows = await parseCsv(filePath, maxRowsPerFile)
        } catch (err) {
          stats.erros += 1
          if (stats.arquivosComErro.length < 30) stats.arquivosComErro.push(origemArquivo)
          if (Object.keys(stats.errosDetalhes).length < 30) {
            const msg = err instanceof Error ? err.message : String(err)
            stats.errosDetalhes[origemArquivo] = msg
          }
          continue
        }

        // safety slice: even with early-stop parsers, keep this guard
        if (maxRowsPerFile && rows.length > maxRowsPerFile) rows = rows.slice(0, maxRowsPerFile)

        if (rows.length > 0) {
          const hasPhoneColumns = rowHasAnyPhoneColumnsByHeader(rows[0] as RawRow)
          const hasAnyPhoneValue = sampleHasAnyPhoneValue(rows, 25)
          if (!hasPhoneColumns && !hasAnyPhoneValue) {
            stats.arquivosPulados += 1
            continue
          }
        }

        stats.linhasLidas += rows.length

        const totalRowsArquivo = rows.length
        let validRowsArquivo = 0
        let invalidRowsArquivo = 0

        if (rows.length > 0 && Object.keys(stats.amostraHeaders).length < 20) {
          const headers = Object.keys(rows[0] as RawRow)
          stats.amostraHeaders[origemArquivo] = headers.slice(0, 60)
        }

        if (rows.length > 0 && Object.keys(stats.headersIgnorados).length < 30) {
          const { ignored } = mapHeadersToStandard(rows[0] as RawRow)
          if (ignored.length > 0) stats.headersIgnorados[origemArquivo] = ignored.slice(0, 60)
        }

        let batch: NormalizedLead[] = []
        for (const row of rows) {
          const normalized = normalizeRow(row, nichoId, origemArquivo)
          if (!normalized.lead) {
            if (!isRowCompletelyEmpty(row)) {
              stats.linhasInvalidas += 1
              invalidRowsArquivo += 1

              const reason = normalized.reason ?? "missing_or_invalid_phone"
              stats.ignoradosSemTelefone += 1

              if (stats.exemplosErrosValidacao.length < 20) {
                stats.exemplosErrosValidacao.push({
                  arquivo: origemArquivo,
                  motivo: reason,
                  debug: normalized.debug,
                })
              }
            }
            continue
          }

          validRowsArquivo += 1
          batch.push(normalized.lead)

          if (batch.length >= batchSize) {
            if (!dryRun) {
              const { inserted, updated } = await upsertBatchPrisma(batch)
              stats.inseridos += inserted
              stats.atualizados += updated
            }
            batch = []
          }
        }

        if (batch.length > 0) {
          if (!dryRun) {
            const { inserted, updated } = await upsertBatchPrisma(batch)
            stats.inseridos += inserted
            stats.atualizados += updated
          }
        }

        if (!dryRun) {
          try {
            await prisma.importLog.create({
              data: {
                fileName: origemArquivo,
                totalRows: totalRowsArquivo,
                validRows: validRowsArquivo,
                invalidRows: invalidRowsArquivo,
              },
            })
          } catch (err) {
            stats.erros += 1
            if (Object.keys(stats.errosDetalhes).length < 30) {
              const msg = err instanceof Error ? err.message : String(err)
              stats.errosDetalhes[`import_log:${origemArquivo}`] = msg
            }
          }
        }
      }

      if (maxTotalFiles && processedFilesTotal >= maxTotalFiles) break
    }

    return NextResponse.json({ ok: true, dryRun, stats })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg || "etl_failed" }, { status: 500 })
  }
}
