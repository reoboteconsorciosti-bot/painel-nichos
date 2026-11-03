import fs from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { NextResponse } from "next/server"
import { POST as runImportFromFolder } from "@/app/api/criar-lista/route"
import { getAuthenticatedUser } from "@/lib/auth"
import * as XLSX from "xlsx"
import { readImportSpreadsheet } from "@/lib/import-spreadsheet"
import { mapImportRow, validateMapping, MAX_IMPORT_BYTES } from "@/lib/import-mapping"
import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { normalizeImportPhone } from "@/app/api/criar-lista/route"
import { buildCrmDelivery } from "@/lib/crm-delivery-payload"

export const runtime = "nodejs"

function parseOptionalPositiveInt(input: FormDataEntryValue | null): number | undefined {
  if (typeof input !== "string") return undefined
  const n = Number(input)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.trunc(n)
}

function sanitizeFolderName(input: string): string {
  const safe = input
    .replace(/[\\/]+/g, " ")
    .replace(/[^\w\s-]+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return safe || "_UPLOADS"
}

function normalizeToken(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

const UF_TO_NAME: Record<string, string> = {
  AC: "ACRE",
  AL: "ALAGOAS",
  AP: "AMAPA",
  AM: "AMAZONAS",
  BA: "BAHIA",
  CE: "CEARA",
  DF: "DISTRITO FEDERAL",
  ES: "ESPIRITO SANTO",
  GO: "GOIAS",
  MA: "MARANHAO",
  MT: "MATO GROSSO",
  MS: "MATO GROSSO DO SUL",
  MG: "MINAS GERAIS",
  PA: "PARA",
  PB: "PARAIBA",
  PR: "PARANA",
  PE: "PERNAMBUCO",
  PI: "PIAUI",
  RJ: "RIO DE JANEIRO",
  RN: "RIO GRANDE DO NORTE",
  RS: "RIO GRANDE DO SUL",
  RO: "RONDONIA",
  RR: "RORAIMA",
  SC: "SANTA CATARINA",
  SP: "SAO PAULO",
  SE: "SERGIPE",
  TO: "TOCANTINS",
}

const STATE_NAMES = Object.values(UF_TO_NAME)

function inferBaseNicheName(normalizedBase: string): string | null {
  if (normalizedBase.includes("EMPRESA") || normalizedBase.includes("EMPRESARIO")) return "EMPRESARIOS"
  if (normalizedBase.includes("MEDIC")) return "MEDICOS"
  if (normalizedBase.includes("ADVOG")) return "ADVOGADOS"
  if (normalizedBase.includes("ARQUIT")) return "ARQUITETOS"
  if (normalizedBase.includes("DENT")) return "DENTISTAS"
  if (normalizedBase.includes("ENGEN")) return "ENGENHEIROS"
  if (normalizedBase.includes("FARM")) return "FARMACEUTICOS"
  if (normalizedBase.includes("AUTO") && normalizedBase.includes("ESCOLA")) return "AUTO ESCOLA"
  if (normalizedBase.includes("PRODUTOR") && normalizedBase.includes("RURAL")) return "PRODUTOR RURAL"
  if (normalizedBase.includes("MOVEIS") && normalizedBase.includes("PLANE")) return "MOVEIS PLANEJADOS"
  if (normalizedBase.includes("MATERIAL") && normalizedBase.includes("CONSTRU")) return "MATERIAL DE CONSTRUCAO"
  return null
}

function inferStateName(normalizedText: string, tokens: string[]): string | null {
  const lastToken = tokens.at(-1) ?? ""
  if (UF_TO_NAME[lastToken]) return UF_TO_NAME[lastToken]

  for (const stateName of STATE_NAMES) {
    const stateTokens = stateName.split(" ")
    if (stateTokens.length === 1) {
      if (tokens.includes(stateTokens[0])) return stateName
      continue
    }
    const joinedWithSpace = stateTokens.join(" ")
    if (normalizedText.includes(joinedWithSpace)) return stateName
  }

  return null
}

function inferNichoFolderFromFileName(fileName: string): string {
  const ext = path.extname(fileName)
  const rawBase = path.basename(fileName, ext)

  // Remove sufixos de data comuns: _23-04, -23-04-2026 etc.
  const noDateSuffix = rawBase.replace(/[\s_-]*\d{1,2}[-_]\d{1,2}(?:[-_]\d{2,4})?$/i, "")
  const normalized = normalizeToken(noDateSuffix)
  const parts = normalized.split(/[\s_-]+/).filter(Boolean)
  const stateName = inferStateName(normalized, parts)
  const withoutState = stateName
    ? normalized.replace(stateName, " ").replace(/\s+/g, " ").trim()
    : parts.join(" ")

  const nicheBase = inferBaseNicheName(withoutState || normalized)
  if (nicheBase) {
    return sanitizeFolderName(stateName ? `${nicheBase} ${stateName}` : nicheBase)
  }

  return sanitizeFolderName(noDateSuffix)
}

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user || user.role !== "admin" || !user.isOwner) {
    return NextResponse.json({ ok: false, error: "forbidden_owner_only" }, { status: 403 })
  }
  let uploadedPath: string | null = null
  let crmImportRows: Array<Record<string, string>> | null = null
  let importFingerprint = ""
  let existingPhonesBeforeImport = new Set<string>()
  try {
    const sourceRoot = process.env.LEADS_SOURCE_DIR
    const etlToken = process.env.ETL_TOKEN
    
    console.log("[UPLOAD] LEADS_SOURCE_DIR:", sourceRoot)
    console.log("[UPLOAD] ETL_TOKEN exists:", !!etlToken)
    console.log("[UPLOAD] Platform:", process.platform)
    
    if (!sourceRoot) {
      console.error("[UPLOAD] ERROR: LEADS_SOURCE_DIR not configured")
      return NextResponse.json({ ok: false, error: "LEADS_SOURCE_DIR_not_configured" }, { status: 500 })
    }
    if (!etlToken) {
      console.error("[UPLOAD] ERROR: ETL_TOKEN not configured")
      return NextResponse.json({ ok: false, error: "ETL_TOKEN_not_configured" }, { status: 500 })
    }

    const form = await req.formData()
    const fileEntry = form.get("file")
    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 })
    }

    const originalName = fileEntry.name || "upload"
    let ext = path.extname(originalName).toLowerCase()
    if (ext !== ".xlsx" && ext !== ".csv") {
      return NextResponse.json({ ok: false, error: "invalid_file_type" }, { status: 400 })
    }

    if (fileEntry.size > MAX_IMPORT_BYTES) return NextResponse.json({ ok: false, error: "O arquivo deve ter até 20 MB." }, { status: 400 })
    let fileBuffer = Buffer.from(await fileEntry.arrayBuffer())
    // A mapped upload is validated in full before writing any lead. Legacy ETL uploads remain supported.
    const mappingJson = form.get("columnMapping")
    if (mappingJson !== null) {
      try {
        const parsed = readImportSpreadsheet(fileBuffer, String(form.get("sheetName") ?? ""), Number(form.get("headerRow") ?? 1))
        const mapping = validateMapping(JSON.parse(String(mappingJson)), parsed.headers, String(form.get("forceState") ?? ""))
        const rows = parsed.rows.map((row, index) => {
          try {
            const mapped = mapImportRow(row, mapping)
            if (!mapped.name) throw new Error("O nome do contato está vazio.")
            if (!mapped.state && !String(form.get("forceState") ?? "").trim()) throw new Error("Informe o estado do contato.")
            return mapped
          } catch (error) { throw new Error(`Linha ${index + parsed.headerRow + 1}: ${error instanceof Error ? error.message : "Dados inválidos."}`) }
        })
        crmImportRows = rows
        const validPhones = [...new Set(rows.map(row => normalizeImportPhone(row.phone)).filter((phone): phone is string => !!phone))]
        for (let index = 0; index < validPhones.length; index += 500) {
          const existing = await prisma.lead.findMany({ where: { phone: { in: validPhones.slice(index, index + 500) } }, select: { phone: true } })
          existing.forEach(lead => { if (lead.phone) existingPhonesBeforeImport.add(lead.phone) })
        }
        importFingerprint = createHash("sha256")
          .update(fileBuffer)
          .update(String(mappingJson))
          .update([parsed.sheetName, parsed.headerRow, String(form.get("nichoFolder") ?? ""), String(form.get("forceCity") ?? ""), String(form.get("forceState") ?? "")].join(":"))
          .digest("hex")
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Contatos")
        fileBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
        ext = ".xlsx"
      } catch (error) {
        return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Mapeamento inválido." }, { status: 400 })
      }
    }

    const nichoFromBody = typeof form.get("nichoFolder") === "string" ? String(form.get("nichoFolder")).trim() : ""
    const targetNichoFolder = nichoFromBody
      ? sanitizeFolderName(nichoFromBody)
      : inferNichoFolderFromFileName(originalName)
    
    console.log("[UPLOAD] Target folder:", targetNichoFolder)
    
    // Verifica se sourceRoot existe e é acessível
    let uploadDir: string
    try {
      await fs.access(sourceRoot)
      uploadDir = path.join(sourceRoot, targetNichoFolder)
      console.log("[UPLOAD] Using LEADS_SOURCE_DIR:", sourceRoot)
    } catch (accessError) {
      // Se não conseguir acessar (ex: caminho UNC do Windows no Linux), usa tmpdir
      uploadDir = path.join(tmpdir(), "painel-nichos-uploads", targetNichoFolder)
      console.log("[UPLOAD] LEADS_SOURCE_DIR not accessible, using temp dir:", uploadDir)
      console.error("[UPLOAD] Access error:", accessError)
    }
    
    await fs.mkdir(uploadDir, { recursive: true })

    const safeBaseName = path
      .basename(originalName, ext)
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "arquivo"
    const storedFileName = `${Date.now()}-${safeBaseName}${ext}`
    uploadedPath = path.join(uploadDir, storedFileName)

    await fs.writeFile(uploadedPath, fileBuffer)
    console.log("[UPLOAD] File written successfully")

    const dryRun = String(form.get("dryRun") ?? "").toLowerCase() === "true"
    const batchSize = parseOptionalPositiveInt(form.get("batchSize")) ?? 1000
    const maxRowsPerFile = parseOptionalPositiveInt(form.get("maxRowsPerFile")) ?? 5000
    const forceCity = String(form.get("forceCity") ?? "").trim()
    const forceState = String(form.get("forceState") ?? "").trim()

    // Determina se usou diretório temporário (fallback) ou o original
    const usedTempDir = !uploadDir.startsWith(sourceRoot)
    const proxiedBody = {
      dryRun,
      batchSize,
      maxRowsPerFile,
      forceCity,
      forceState,
      includeSubdirs: true,
      onlyNichos: [targetNichoFolder],
      onlyFiles: [storedFileName],
      maxFiles: 1,
      maxTotalFiles: 1,
      skipExisting: true, // Importação via interface web ignora duplicados (não atualiza existentes)
      // Se usou temp dir, passa o caminho real para o processador
      ...(usedTempDir && { sourceRootOverride: path.dirname(uploadDir) }),
    }

    const proxiedReq = new Request("http://internal/api/criar-lista", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-etl-token": etlToken,
      },
      body: JSON.stringify(proxiedBody),
    })

    console.log("[UPLOAD] Calling import processor...")
    const proxiedRes = await runImportFromFolder(proxiedReq)
    console.log("[UPLOAD] Import processor response status:", proxiedRes.status)
    const responseJson = (await proxiedRes.json().catch((e) => {
      console.error("[UPLOAD] Error parsing response:", e)
      return null
    })) as unknown

    let crmImport: { configured: boolean; contactsCount: number; contactBatchesQueued: number; dealsCount: number; dealJobsQueued: number; batchId?: number } | null = null
    if (proxiedRes.ok && responseJson && typeof responseJson === "object" && (responseJson as { ok?: unknown }).ok === true && crmImportRows) {
      const contactsByPhone = new Map<string, Record<string, string>>()
      for (const row of crmImportRows) {
        const phone = normalizeImportPhone(row.phone)
        if (phone && row.name && !contactsByPhone.has(phone)) contactsByPhone.set(phone, { ...row, phone })
      }
      const contacts = [...contactsByPhone.values()].map(row => ({
        name: row.name,
        phone: row.phone,
        whatsapp: row.phone,
        ...(row.email ? { email: row.email } : {}),
        ...(row.jobTitle ? { jobTitle: row.jobTitle } : {}),
        ...(row.city || forceCity ? { city: forceCity || row.city } : {}),
        ...(row.state || forceState ? { state: forceState || row.state } : {}),
        ...(row.company || row.fantasy ? { company: row.company || row.fantasy } : {}),
        source: "Painel Nichos - " + targetNichoFolder,
      }))
      const contactJobs = []
      for (let index = 0; index < contacts.length; index += 500) {
        const batch = contacts.slice(index, index + 500)
        contactJobs.push({
          leadId: null,
          listaId: null,
          consultantCrmId: "import",
          idempotencyKey: "import:" + importFingerprint + ":contacts:" + index / 500,
          method: "CONTACTS_BULK",
          payload: { contacts: batch },
        })
      }
      const deals = contacts.flatMap((contact, index) => {
        const row = contactsByPhone.get(contact.phone)!
        if (!row.dealDescription) return []
        const delivery = buildCrmDelivery({
          id: index + 1,
          name: contact.name,
          phone: contact.phone,
          city: contact.city ?? null,
          state: contact.state ?? null,
          company: contact.company ?? null,
          fantasy: row.fantasy ?? null,
          email: contact.email ?? null,
          jobTitle: contact.jobTitle ?? null,
          dealDescription: row.dealDescription,
          crmDealId: row.crmDealId ?? null,
        }, targetNichoFolder, null)
        return delivery ? [{
          leadId: null,
          listaId: null,
          consultantCrmId: "import",
          idempotencyKey: "import:" + importFingerprint + ":deal:" + contact.phone,
          ...delivery,
        }] : []
      })
      const deliveryJobs = [...contactJobs, ...deals]
      if (deliveryJobs.length) await prisma.crmDelivery.createMany({ data: deliveryJobs, skipDuplicates: true })
      const importedPhones = [...contactsByPhone.keys()]
      const importedLeads = []
      for (let index = 0; index < importedPhones.length; index += 500) {
        importedLeads.push(...await prisma.lead.findMany({ where: { phone: { in: importedPhones.slice(index, index + 500) } }, select: { id: true, phone: true } }))
      }
      const newlyCreatedLeadIds = importedLeads.filter(lead => lead.phone && !existingPhonesBeforeImport.has(lead.phone)).map(lead => lead.id)
      const batch = await prisma.importBatch.upsert({
        where: { fingerprint: importFingerprint },
        create: { fileName: originalName, niche: targetNichoFolder, importedCount: newlyCreatedLeadIds.length, existingCount: importedLeads.length - newlyCreatedLeadIds.length, leadIds: newlyCreatedLeadIds, fingerprint: importFingerprint, createdBy: user.id },
        update: { fileName: originalName, niche: targetNichoFolder, importedCount: newlyCreatedLeadIds.length, existingCount: importedLeads.length - newlyCreatedLeadIds.length, leadIds: newlyCreatedLeadIds, status: "completed", removedCount: 0, undoneAt: null },
      })
      crmImport = {
        configured: !!(process.env.CRM_API_URL?.trim() && process.env.CRM_API_KEY?.trim()),
        contactsCount: contacts.length,
        contactBatchesQueued: contactJobs.length,
        dealsCount: deals.length,
        dealJobsQueued: deals.length,
        batchId: batch.id,
      }
    }

    return NextResponse.json(
      {
        ...(responseJson && typeof responseJson === "object" ? responseJson : { ok: proxiedRes.ok }),
        crmImport,
        importBatchId: proxiedRes.ok && responseJson && typeof responseJson === "object" && (responseJson as { ok?: unknown }).ok === true && crmImportRows ? (await prisma.importBatch.findUnique({ where: { fingerprint: importFingerprint }, select: { id: true } }))?.id ?? null : null,
        uploadedFile: storedFileName,
        targetNichoFolder,
      },
      { status: proxiedRes.status },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[UPLOAD] ERROR in upload route:", msg)
    if (e instanceof Error && e.stack) {
      console.error("[UPLOAD] Stack:", e.stack)
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  } finally {
    if (uploadedPath) {
      // Limpa o arquivo temporário para não acumular uploads.
      await fs.unlink(uploadedPath).catch(() => {})
    }
  }
}
