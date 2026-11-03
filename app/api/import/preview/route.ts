import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { readImportSpreadsheet, SpreadsheetReadError } from "@/lib/import-spreadsheet"
import { MAX_IMPORT_BYTES, suggestMapping } from "@/lib/import-mapping"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user || user.role !== "admin") return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  try {
    const form = await req.formData()
    const file = form.get("file")
    if (!(file instanceof File) || !/\.(xlsx|csv)$/i.test(file.name)) throw new Error("Selecione um arquivo .xlsx ou .csv.")
    if (file.size > MAX_IMPORT_BYTES) throw new Error("O arquivo deve ter até 20 MB.")
    const data = readImportSpreadsheet(Buffer.from(await file.arrayBuffer()), String(form.get("sheetName") ?? ""), Number(form.get("headerRow") ?? 1))
    return NextResponse.json({ ok: true, ...data, rows: data.rows.slice(0, 5), totalRows: data.rows.length, mapping: suggestMapping(data.headers) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível ler o arquivo.", ...(error instanceof SpreadsheetReadError ? { sheets: error.sheets, sheetName: error.sheetName } : {}) }, { status: 400 })
  }
}
