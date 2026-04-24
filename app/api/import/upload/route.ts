import fs from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import { POST as runImportFromFolder } from "@/app/api/criar-lista/route"

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
  let uploadedPath: string | null = null
  try {
    const sourceRoot = process.env.LEADS_SOURCE_DIR
    const etlToken = process.env.ETL_TOKEN
    if (!sourceRoot) {
      return NextResponse.json({ ok: false, error: "LEADS_SOURCE_DIR_not_configured" }, { status: 500 })
    }
    if (!etlToken) {
      return NextResponse.json({ ok: false, error: "ETL_TOKEN_not_configured" }, { status: 500 })
    }

    const form = await req.formData()
    const fileEntry = form.get("file")
    if (!(fileEntry instanceof File)) {
      return NextResponse.json({ ok: false, error: "file_required" }, { status: 400 })
    }

    const originalName = fileEntry.name || "upload"
    const ext = path.extname(originalName).toLowerCase()
    if (ext !== ".xlsx" && ext !== ".csv") {
      return NextResponse.json({ ok: false, error: "invalid_file_type" }, { status: 400 })
    }

    const nichoFromBody = typeof form.get("nichoFolder") === "string" ? String(form.get("nichoFolder")).trim() : ""
    const targetNichoFolder = nichoFromBody
      ? sanitizeFolderName(nichoFromBody)
      : inferNichoFolderFromFileName(originalName)
    const uploadDir = path.join(sourceRoot, targetNichoFolder)
    await fs.mkdir(uploadDir, { recursive: true })

    const safeBaseName = path
      .basename(originalName, ext)
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "arquivo"
    const storedFileName = `${Date.now()}-${safeBaseName}${ext}`
    uploadedPath = path.join(uploadDir, storedFileName)

    const arrayBuffer = await fileEntry.arrayBuffer()
    await fs.writeFile(uploadedPath, Buffer.from(arrayBuffer))

    const dryRun = String(form.get("dryRun") ?? "").toLowerCase() === "true"
    const batchSize = parseOptionalPositiveInt(form.get("batchSize")) ?? 1000
    const maxRowsPerFile = parseOptionalPositiveInt(form.get("maxRowsPerFile")) ?? 5000
    const forceCity = String(form.get("forceCity") ?? "").trim()
    const forceState = String(form.get("forceState") ?? "").trim()

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
    }

    const proxiedReq = new Request("http://internal/api/criar-lista", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-etl-token": etlToken,
      },
      body: JSON.stringify(proxiedBody),
    })

    const proxiedRes = await runImportFromFolder(proxiedReq)
    const responseJson = (await proxiedRes.json().catch(() => null)) as unknown

    return NextResponse.json(
      {
        ...(responseJson && typeof responseJson === "object" ? responseJson : { ok: proxiedRes.ok }),
        uploadedFile: storedFileName,
        targetNichoFolder,
      },
      { status: proxiedRes.status },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  } finally {
    if (uploadedPath) {
      // Limpa o arquivo temporário para não acumular uploads.
      await fs.unlink(uploadedPath).catch(() => {})
    }
  }
}
