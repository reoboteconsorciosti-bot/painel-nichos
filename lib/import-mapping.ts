import { normalizeImportPhone } from "@/lib/phone-normalization"

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
  nome: "name", name: "name", cliente: "name", contato: "name", nomecompleto: "name", nomedocontato: "name", nomecliente: "name",
  telefone: "phone", telefonecelular: "phone", numerotelefone: "phone", numerodetelefone: "phone", telefonecontato: "phone", telefoneprincipal: "phone", telefonecomercial: "phone", telefone1: "phone", telefone2: "phone", celular: "phone", numerocelular: "phone", celularprincipal: "phone", celularcomercial: "phone", celular1: "phone", whatsapp: "phone", whatsappnumber: "phone", numerowhatsapp: "phone", whatsapp1: "phone", whats: "phone", phone: "phone", phonenumber: "phone", telephone: "phone", telephone1: "phone", mobile: "phone", mobilephone: "phone", mobilephone1: "phone", fone: "phone", fonecontato: "phone", fonecomercial: "phone", fone1: "phone", tel: "phone",
  cidade: "city", municipio: "city", localidade: "city", city: "city", estado: "state", uf: "state", state: "state",
  empresa: "company", razaosocial: "company", company: "company", nomefantasia: "fantasy",
  email: "email", emailaddress: "email", correioeletronico: "email", cargo: "jobTitle", funcao: "jobTitle", jobtitle: "jobTitle", crmdealid: "crmDealId", idnegocio: "crmDealId", dealid: "crmDealId",
  descricao: "dealDescription", description: "dealDescription", descricaonegocio: "dealDescription", businessdescription: "dealDescription", dealnotes: "dealDescription", notes: "dealDescription", observacoes: "dealDescription", observacao: "dealDescription", anotacoes: "dealDescription", notas: "dealDescription",
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
  // Mostra na prévia e envia ao importador o telefone já corrigido quando
  // há um formato brasileiro reconhecível. Números irrecuperáveis seguem
  // para o relatório de linhas inválidas, sem cancelar o lote inteiro.
  result.phone = normalizeImportPhone(result.phone) ?? result.phone
  if (result.crmDealId && !/^[a-zA-Z0-9._~:-]{1,128}$/.test(result.crmDealId)) throw new Error("ID de negócio inválido na planilha.")
  if (result.crmDealId && result.dealDescription.length > 2000) {
    throw new Error("A nota de um negócio existente aceita até 2.000 caracteres. Reduza as colunas da descrição.")
  }
  return result
}
