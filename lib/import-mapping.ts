export const IMPORT_TARGETS = {
  ignore: "Ignorar",
  name: "Nome do contato",
  phone: "Telefone / WhatsApp",
  city: "Cidade",
  state: "Estado (UF)",
  company: "Empresa / razão social",
  fantasy: "Nome fantasia",
  email: "E-mail",
  jobTitle: "Cargo",
  dealDescription: "Descrição do negócio",
  crmDealId: "ID de negócio existente no CRM",
} as const

export type ImportTarget = keyof typeof IMPORT_TARGETS
export type ColumnMapping = Record<string, ImportTarget>
export const MAX_IMPORT_ROWS = 5000
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024

const aliases: Record<string, ImportTarget> = {
  nome: "name", name: "name", cliente: "name", contato: "name", nomecompleto: "name",
  telefone: "phone", celular: "phone", whatsapp: "phone", phone: "phone", fone: "phone",
  cidade: "city", municipio: "city", city: "city", estado: "state", uf: "state", state: "state",
  empresa: "company", razaosocial: "company", company: "company", nomefantasia: "fantasy",
  email: "email", cargo: "jobTitle", jobtitle: "jobTitle", crmdealid: "crmDealId",
  descricao: "dealDescription", observacoes: "dealDescription", observacao: "dealDescription",
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const used = new Set<ImportTarget>()
  return Object.fromEntries(headers.map(header => {
    const key = header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")
    let target = Object.hasOwn(aliases, key) ? aliases[key] : "ignore"
    if (target !== "dealDescription" && used.has(target)) target = "ignore"
    used.add(target)
    return [header, target]
  }))
}

export function validateMapping(input: unknown, headers: string[], forceState = "", requireState = true): ColumnMapping {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Mapeie as colunas da planilha.")
  const entries = Object.entries(input)
  const seen = new Set<string>()
  for (const [header, target] of entries) {
    if (!headers.includes(header) || typeof target !== "string" || !Object.hasOwn(IMPORT_TARGETS, target)) {
      throw new Error("O mapeamento não corresponde às colunas deste arquivo.")
    }
    if (target !== "ignore" && target !== "dealDescription") {
      if (seen.has(target)) throw new Error("Escolha apenas uma coluna para cada campo. A descrição aceita várias.")
      seen.add(target)
    }
  }
  if (!seen.has("phone")) throw new Error("Escolha a coluna de telefone / WhatsApp.")
  if (!seen.has("name")) throw new Error("Escolha a coluna de nome do contato.")
  if (requireState && !seen.has("state") && !forceState.trim()) throw new Error("Mapeie o estado ou informe um estado para toda a planilha.")
  return Object.fromEntries(entries) as ColumnMapping
}

export function mapImportRow(row: Record<string, unknown>, mapping: ColumnMapping): Record<string, string> {
  const result: Record<string, string> = {}
  const description: string[] = []
  for (const [header, target] of Object.entries(mapping)) {
    const value = String(row[header] ?? "").trim()
    if (!value || target === "ignore") continue
    if (target === "dealDescription") description.push(`${header}: ${value}`)
    else result[target] = value
  }
  result.dealDescription = description.join("\n")
  if (result.crmDealId && !/^[a-zA-Z0-9_-]{1,128}$/.test(result.crmDealId)) throw new Error("ID de negócio inválido na planilha.")
  if (result.crmDealId && result.dealDescription.length > 2000) {
    throw new Error("A nota de um negócio existente aceita até 2.000 caracteres. Reduza as colunas da descrição.")
  }
  return result
}
