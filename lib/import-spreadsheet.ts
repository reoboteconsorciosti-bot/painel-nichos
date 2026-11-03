import * as XLSX from "xlsx"
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS } from "@/lib/import-mapping"

export class SpreadsheetReadError extends Error {
  constructor(message: string, public sheets: string[], public sheetName: string) { super(message) }
}

export function readImportSpreadsheet(buffer: Buffer, sheetName?: string, headerRow = 1) {
  if (buffer.length > MAX_IMPORT_BYTES) throw new Error("O arquivo deve ter até 20 MB.")
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > 100) throw new Error("A linha de cabeçalho deve estar entre 1 e 100.")
  // Keep phone numbers as text and never evaluate spreadsheet formulas.
  const workbook = XLSX.read(buffer, { type: "buffer", raw: true, codepage: 65001, cellDates: false, sheetRows: MAX_IMPORT_ROWS + 102 })
  const selectedSheet = sheetName || workbook.SheetNames[0]
  const sheet = workbook.Sheets[selectedSheet]
  const fail = (message: string): never => { throw new SpreadsheetReadError(message, workbook.SheetNames, selectedSheet) }
  if (!sheet) fail("A aba selecionada não existe no arquivo.")
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: true })
  const header = matrix[headerRow - 1]
  if (!header) fail("Não há cabeçalhos nessa linha.")
  const positions = header.map((value, index) => ({ header: String(value ?? "").trim(), index })).filter(x => x.header)
  const headers = positions.map(x => x.header)
  if (!headers.length) fail("A linha de cabeçalho está vazia.")
  if (new Set(headers).size !== headers.length) fail("Há nomes de coluna repetidos. Renomeie-os antes de importar.")
  const rows = matrix.slice(headerRow).filter(row => row.some(value => String(value ?? "").trim())).map(row =>
    Object.fromEntries(positions.map(({ header, index }) => [header, String(row[index] ?? "").trim()])),
  )
  if (!rows.length) fail("A planilha não tem contatos para importar.")
  if (rows.length > MAX_IMPORT_ROWS) fail("O limite é de 5.000 linhas por arquivo. Divida a planilha para importar todos os contatos.")
  return { headers, rows, sheets: workbook.SheetNames, sheetName: selectedSheet, headerRow }
}
