function expandScientificNumber(raw: string): string | null {
  const match = raw.trim().match(/^\+?(\d+)(?:[.,](\d+))?[eE]([+-]?\d+)$/)
  if (!match) return null

  const integer = match[1] ?? ""
  const fraction = match[2] ?? ""
  const exponent = Number(match[3])
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 20) return null

  const digits = `${integer}${fraction}`.replace(/^0+/, "")
  const zeroCount = exponent - fraction.length
  if (!digits || zeroCount < 0 || zeroCount > 20) return null
  return `${digits}${"0".repeat(zeroCount)}`
}

export function normalizePhone(input: unknown): string {
  let raw = String(input ?? "").trim()
  if (!raw) return ""

  // Remove ramais que algumas exportações acrescentam ao telefone.
  raw = raw.replace(/\s*(?:ramal|rml|ext(?:ension)?\.?|x|#)\s*[:.]?\s*\d{1,8}\s*$/i, "")
  raw = raw.replace(/^(\+?\d+)[.,]0+$/, "$1")

  const scientific = expandScientificNumber(raw)
  if (scientific) return scientific

  return raw.replace(/\D/g, "")
}

function normalizeBrazilianPrefixes(value: string): string {
  let digits = value

  // Prefixo de discagem internacional para o Brasil (0055 ou 00 + operadora + 55).
  if (digits.startsWith("0055") && [14, 15].includes(digits.length)) digits = digits.slice(4)
  else if (digits.startsWith("00") && [16, 17].includes(digits.length) && digits.slice(4, 6) === "55") digits = digits.slice(4)

  // DDI do Brasil.
  if (digits.startsWith("55") && [12, 13].includes(digits.length)) digits = digits.slice(2)

  // Prefixo nacional 0 + código de operadora + DDD (ex.: 0 21 11...).
  if (digits.startsWith("0") && [13, 14].includes(digits.length)) digits = digits.slice(3)

  // Prefixo nacional 0 + DDD.
  if (digits.startsWith("0") && !digits.startsWith("00")) digits = digits.slice(1)

  return digits
}

export function isLikelyPhoneDigits(input: string): boolean {
  let digits = normalizeBrazilianPrefixes(input)
  if (!/^\d+$/.test(digits)) return false

  // Celulares antigos tinham 8 dígitos locais. Insere o nono dígito quando
  // o primeiro dígito local (após o DDD) indica celular (6 a 9).
  if (digits.length === 10 && /^[6-9]/.test(digits.slice(2, 3))) {
    digits = `${digits.slice(0, 2)}9${digits.slice(2)}`
  }

  if (digits.length !== 10 && digits.length !== 11) return false
  if (isValidCpfDigits(digits)) return false
  if (/^(\d)\1{9,10}$/.test(digits)) return false
  if (digits.length === 11 && digits[2] !== "9") return false
  return true
}

function isValidCpfDigits(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false
  const nums = digits.split("").map(Number)
  let sum = 0
  for (let i = 0; i < 9; i++) sum += nums[i]! * (10 - i)
  let check = (sum * 10) % 11
  if (check === 10) check = 0
  if (check !== nums[9]) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += nums[i]! * (11 - i)
  check = (sum * 10) % 11
  if (check === 10) check = 0
  return check === nums[10]
}

export function normalizeImportPhone(input: unknown): string | null {
  let normalized = normalizeBrazilianPrefixes(normalizePhone(input))
  if (!normalized) return null
  if (normalized.length === 10 && /^[6-9]/.test(normalized.slice(2, 3))) {
    normalized = `${normalized.slice(0, 2)}9${normalized.slice(2)}`
  }
  return isLikelyPhoneDigits(normalized) ? normalized : null
}

// Corrige o formato no envio inclusive para registros importados antes das
// regras atuais. Preserva o número informado quando faltam dados: não inventa
// DDD/dígitos e não remove o WhatsApp do contato.
export function normalizeCrmPhone(input: unknown): string {
  const raw = String(input ?? "").trim()
  const digits = normalizePhone(raw)
  if (raw.startsWith("+") && !digits.startsWith("55")) return digits ? `+${digits}` : ""
  return normalizeImportPhone(raw) ?? normalizeBrazilianPrefixes(digits)
}

/** Campanhas antigas usam o telefone para BUSCAR no CRM, não para criar cadastros. */
export function normalizeCampaignPhone(input: unknown): string | null {
  const raw = String(input ?? "").trim()
  const digits = normalizePhone(raw)
  if (digits.length < 7 || digits.length > 17 || /^(\d)\1+$/.test(digits)) return null
  return raw.startsWith("+") && !digits.startsWith("55") ? `+${digits}` : digits
}

/**
 * Identidade de um telefone na campanha: formatos diferentes da mesma pessoa
 * geram a mesma chave. Serve só para comparar, nunca para gravar ou enviar.
 */
export function campaignPhoneKey(input: unknown): string | null {
  const phone = normalizeCampaignPhone(input)
  if (!phone) return null
  if (phone.startsWith("+")) return phone

  let digits = normalizeBrazilianPrefixes(phone.startsWith("0055") ? phone.slice(4) : phone)
  // 55 + DDD + fixo antigo de 7 dígitos. Com 9 no terceiro dígito é um celular do DDD 55.
  if (digits.length === 11 && digits.startsWith("55") && digits[2] !== "9") digits = digits.slice(2)
  // DDD + últimos 8 dígitos une celulares com e sem o nono dígito sem misturar DDDs.
  return digits.length === 10 || digits.length === 11 ? `${digits.slice(0, 2)}${digits.slice(-8)}` : digits
}
