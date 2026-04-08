import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

type CleanupBody = {
  dryRun?: unknown
  maxScan?: unknown
  maxDelete?: unknown
  mode?: unknown
  phones?: unknown
  nicho?: unknown
}

type Classified = {
  tipo: "CPF" | "CNPJ" | "TELEFONE" | "INVALIDO"
  valido: boolean
  digits: string
}

function normalizeDigits(input: unknown): string {
  return String(input ?? "").replace(/\D/g, "")
}

function isValidCPF(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf)) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const nums = cpf.split("").map(Number)
  
  let sum1 = 0
  for (let i = 0; i < 9; i++) sum1 += nums[i]! * (10 - i)
  let rest1 = (sum1 * 10) % 11
  if (rest1 === 10 || rest1 === 11) rest1 = 0
  if (rest1 !== nums[9]) return false
  
  let sum2 = 0
  for (let i = 0; i < 10; i++) sum2 += nums[i]! * (11 - i)
  let rest2 = (sum2 * 10) % 11
  if (rest2 === 10 || rest2 === 11) rest2 = 0
  return rest2 === nums[10]
}

function isValidCNPJ(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj)) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  const nums = cnpj.split("").map(Number)
  
  const calc = (length: number) => {
    let sum = 0
    let pos = length - 7
    for (let i = length; i >= 1; i--) {
      sum += nums[length - i]! * pos--
      if (pos < 2) pos = 9
    }
    return sum % 11 < 2 ? 0 : 11 - (sum % 11)
  }

  if (calc(12) !== nums[12]) return false
  return calc(13) === nums[13]
}

function isValidPhone(digits: string): boolean {
  let phone = digits
  
  if (phone.startsWith("55") && (phone.length === 12 || phone.length === 13)) {
    phone = phone.slice(2)
  }
  
  if (phone.startsWith("0") && (phone.length === 11 || phone.length === 12)) {
    phone = phone.slice(1)
  }

  if (!/^\d{10,11}$/.test(phone)) return false
  
  const ddd = Number(phone.slice(0, 2))
  
  // REGRA EXCLUSIVA: Somente DDDs 11, 65 e 66 são aceitos
  if (ddd !== 11 && ddd !== 65 && ddd !== 66) return false
  
  // O dígito principal do telefone (após o DDD) obrigatoriamente tem que ser 9 ou 8
  const firstDigitAfterDdd = phone[2]
  if (firstDigitAfterDdd !== "9" && firstDigitAfterDdd !== "8") return false
  
  return true
}

export function classifyNumber(value: string): Classified {
  const digits = normalizeDigits(value)
  
  if (!digits) return { tipo: "INVALIDO", valido: false, digits: "" }

  if (digits.length === 11 && isValidCPF(digits)) {
    return { tipo: "CPF", valido: true, digits }
  }
  
  if (digits.length === 14 && isValidCNPJ(digits)) {
    return { tipo: "CNPJ", valido: true, digits }
  }
  
  if (isValidPhone(digits)) {
    return { tipo: "TELEFONE", valido: true, digits }
  }
  
  if (digits.length === 11) return { tipo: "CPF", valido: false, digits }
  if (digits.length === 14) return { tipo: "CNPJ", valido: false, digits }

  return { tipo: "INVALIDO", valido: false, digits }
}

function extractDigitCandidatesFromMixedField(input: unknown): string[] {
  const s = String(input ?? "")
  if (!s) return []

  const runs = s.match(/\d{10,14}/g) ?? []
  return runs
}

export async function POST(req: Request) {
  const token = req.headers.get("x-etl-token")
  const expected = process.env.ETL_TOKEN

  if (!expected || token !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as CleanupBody
  const dryRun = body.dryRun === true
  const maxScan = Number.isFinite(body.maxScan) ? Math.max(1, Number(body.maxScan)) : 50000
  const maxDelete = Number.isFinite(body.maxDelete) ? Math.max(1, Number(body.maxDelete)) : 5000
  const mode = body.mode === "heuristic" || body.mode === "ddd_9_8_only" || body.mode === "explicit_list" || body.mode === "delete_all" || body.mode === "empty_phone" ? body.mode : "strict"

  const nicho = typeof body.nicho === "string" && body.nicho.trim() ? body.nicho.trim() : null

  const explicitPhones = Array.isArray(body.phones)
    ? (body.phones as unknown[])
        .map((p) => normalizeDigits(p))
        .filter((p) => !!p)
    : null

  try {
    if (mode === "explicit_list") {
      if (!explicitPhones || explicitPhones.length === 0) {
        return NextResponse.json({ ok: false, error: "missing_phones" }, { status: 400 })
      }

      const unique = Array.from(new Set(explicitPhones))
      const limited = unique.slice(0, maxDelete)

      const matched = await prisma.lead.count({
        where: {
          phone: { in: limited },
          ...(nicho ? { nicho } : {}),
        },
      })

      if (dryRun) {
        return NextResponse.json({
          ok: true,
          dryRun: true,
          mode,
          nicho,
          provided: unique.length,
          limited: limited.length,
          matched,
          sample: limited.slice(0, 20),
        })
      }

      const deletedLinks = await prisma.listaLead.deleteMany({
        where: {
          lead: {
            phone: { in: limited },
            ...(nicho ? { nicho } : {}),
          },
        },
      })

      const deletedLeads = await prisma.lead.deleteMany({
        where: {
          phone: { in: limited },
          ...(nicho ? { nicho } : {}),
        },
      })

      return NextResponse.json({
        ok: true,
        dryRun: false,
        mode,
        nicho,
        provided: unique.length,
        limited: limited.length,
        matched,
        deletedLinks: deletedLinks.count,
        deletedLeads: deletedLeads.count,
        sample: limited.slice(0, 20),
      })
    }

    // Não dependemos apenas do comprimento do "phone".
    // Muitos dados contaminados vêm como "CPF: ... / TEL: ..." (vários números + texto),
    // então o total de dígitos pode passar de 14 e o filtro antigo não via.
    const candidates = mode === "empty_phone"
      ? (nicho
          ? ((await prisma.$queryRaw<Array<{ id: number; phone: string }>>`
              SELECT id, phone
              FROM "leads"
              WHERE nicho = ${nicho}
                AND (phone IS NULL OR phone = '')
              LIMIT ${maxScan}
            `) as Array<{ id: number; phone: string }> )
          : ((await prisma.$queryRaw<Array<{ id: number; phone: string }>>`
              SELECT id, phone
              FROM "leads"
              WHERE (phone IS NULL OR phone = '')
              LIMIT ${maxScan}
            `) as Array<{ id: number; phone: string }> ))
      : (nicho
          ? ((await prisma.$queryRaw<Array<{ id: number; phone: string }>>`
              SELECT id, phone
              FROM "leads"
              WHERE nicho = ${nicho}
                AND phone IS NOT NULL
              LIMIT ${maxScan}
            `) as Array<{ id: number; phone: string }> )
          : ((await prisma.$queryRaw<Array<{ id: number; phone: string }>>`
              SELECT id, phone
              FROM "leads"
              WHERE phone IS NOT NULL
              LIMIT ${maxScan}
            `) as Array<{ id: number; phone: string }> ))

    const leadIdsToDelete: number[] = []
    const sampleDigitsToDelete: string[] = []
    
    // Tratamento direto para os modos de deleção massiva e fantasmas
    if (mode === "empty_phone" || mode === "delete_all") {
      for (const c of candidates) {
        leadIdsToDelete.push(c.id)
        if (sampleDigitsToDelete.length < 50) {
           sampleDigitsToDelete.push(mode === "empty_phone" ? "SEM_TELEFONE_FANTASMA_CORROMPIDO" : (c.phone || "DELETADO"))
        }
        if (leadIdsToDelete.length >= maxDelete) break
      }
    } else {
      for (const c of candidates) {
      const digitCandidates = extractDigitCandidatesFromMixedField(c.phone)
      if (digitCandidates.length === 0) continue

      let shouldDelete = false
      let sampleDigits = ""

      for (const cand of digitCandidates) {
        const classified = classifyNumber(cand)
        if (!classified.digits) continue

        if (mode === "ddd_9_8_only") {
          // remove se não for telefone plausível
          if (classified.tipo !== "TELEFONE" || !classified.valido) {
            shouldDelete = true
            sampleDigits = classified.digits
            break
          }
          continue
        }

        if (mode === "strict") {
          if ((classified.tipo === "CPF" || classified.tipo === "CNPJ") && classified.valido) {
            shouldDelete = true
            sampleDigits = classified.digits
            break
          }
          continue
        }

        // heuristic
        if (classified.tipo === "CNPJ") {
          // mesmo se inválido, 14 dígitos dentro do campo phone quase sempre é documento
          shouldDelete = true
          sampleDigits = classified.digits
          break
        }
        if (classified.tipo === "CPF") {
          shouldDelete = true
          sampleDigits = classified.digits
          break
        }
        if (classified.tipo === "TELEFONE" && classified.valido) {
          // ok, não delete por esse candidato
          continue
        }
      }

      if (!shouldDelete) continue

      leadIdsToDelete.push(c.id)
      if (sampleDigitsToDelete.length < 50) sampleDigitsToDelete.push(sampleDigits || digitCandidates[0]!)
      if (leadIdsToDelete.length >= maxDelete) break
    }
  }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        mode,
        nicho,
        scanned: candidates.length,
        matchedCpfCnpj: leadIdsToDelete.length,
        sample: sampleDigitsToDelete.slice(0, 20),
      })
    }

    if (leadIdsToDelete.length === 0) {
      return NextResponse.json({ ok: true, dryRun: false, scanned: candidates.length, deletedLeads: 0, deletedLinks: 0 })
    }

    const deletedLinks = await prisma.listaLead.deleteMany({
      where: {
        leadId: { in: leadIdsToDelete },
      },
    })

    const deletedLeads = await prisma.lead.deleteMany({
      where: {
        id: { in: leadIdsToDelete },
      },
    })

    return NextResponse.json({
      ok: true,
      dryRun: false,
      mode,
      nicho,
      scanned: candidates.length,
      matchedCpfCnpj: leadIdsToDelete.length,
      deletedLinks: deletedLinks.count,
      deletedLeads: deletedLeads.count,
      sample: sampleDigitsToDelete.slice(0, 20),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg || "failed" }, { status: 500 })
  }
}
