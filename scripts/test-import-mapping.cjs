const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")
const XLSX = require("xlsx")
const { test } = require("node:test")
const root = path.resolve(__dirname, "..")

// Load application TypeScript without adding a runtime dependency or connecting to a database.
function loader(mocks = {}) {
  const cache = new Map()
  function load(relative) {
    const file = path.resolve(root, relative)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const source = fs.readFileSync(file, "utf8")
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    const requireLocal = name => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith("@/") ? load(name.slice(2) + ".ts") : require(name)
    new Function("require", "module", "exports", code + (relative.endsWith("criar-lista/route.ts") ? "\nexports.normalizeRow = normalizeRow;" : ""))(requireLocal, module, module.exports)
    return module.exports
  }
  return load
}

const load = loader()
const { mapImportRow, suggestMapping, validateMapping } = load("lib/import-mapping.ts")
const { readImportSpreadsheet } = load("lib/import-spreadsheet.ts")
const { buildCrmDelivery, retryDelay } = load("lib/crm-delivery-payload.ts")
const mapping = { Cliente: "name", Celular: "phone", UF: "state", Interesse: "dealDescription", Renda: "dealDescription", Lixo: "ignore" }
const raw = { Cliente: "Ana", Celular: "65991234567", UF: "MT", Interesse: "Imóvel", Renda: "8.000", Lixo: "ignorar" }
const lead = { id: 1, name: "Ana", phone: "65991234567", city: "CUIABA", state: "MT", company: null, fantasy: null, email: "ana@example.test", jobTitle: "Gerente", dealDescription: "Interesse: Imóvel\nRenda: 8.000" }

test("mapeia colunas arbitrárias e une várias na descrição sem incluir campos ignorados", () => {
  validateMapping(mapping, Object.keys(raw))
  const row = mapImportRow(raw, mapping)
  assert.equal(row.dealDescription, "Interesse: Imóvel\nRenda: 8.000")
  assert.equal(row.name, "Ana")
  assert.equal(row.Lixo, undefined)
  assert.equal(mapImportRow({ ...raw, Renda: "" }, mapping).dealDescription, "Interesse: Imóvel")
})

test("valida campos obrigatórios, destinos únicos e cabeçalhos do próprio arquivo", () => {
  assert.throws(() => validateMapping({ Cliente: "name" }, Object.keys(raw)), /telefone/)
  assert.throws(() => validateMapping({ ...mapping, Lixo: "name" }, Object.keys(raw)), /apenas uma/)
  assert.throws(() => validateMapping({ ...mapping, inventado: "ignore" }, Object.keys(raw)), /não corresponde/)
  assert.throws(() => validateMapping({ ...mapping, Lixo: "constructor" }, Object.keys(raw)), /não corresponde/)
  assert.throws(() => validateMapping({ Cliente: "name", Celular: "phone" }, Object.keys(raw)), /estado/)
  assert.doesNotThrow(() => validateMapping({ Cliente: "name", Celular: "phone" }, Object.keys(raw), "MT"))
})

test("sugestão de colunas respeita acentos e não adivinha campos desconhecidos", () => {
  assert.deepEqual(suggestMapping(["Nome", "Telefone", "Observações", "Segmentação", "constructor"]), { Nome: "name", Telefone: "phone", Observações: "dealDescription", Segmentação: "ignore", constructor: "ignore" })
})

test("CSV UTF-8 com ponto e vírgula preserva acentos, zeros e descrições entre aspas", () => {
  const result = readImportSpreadsheet(Buffer.from('Cliente;Celular;UF;Observações\nJoão;065991234567;MT;"Quer imóvel; ligar à tarde"\n'))
  assert.equal(result.rows[0].Cliente, "João")
  assert.equal(result.rows[0].Celular, "065991234567")
  assert.equal(result.rows[0]["Observações"], "Quer imóvel; ligar à tarde")
})

test("escolhe aba e linha do cabeçalho, rejeita nomes repetidos e informa abas após erro", () => {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), "Vazia")
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Relatório"], ["Cliente", "Celular"], ["Ana", "65991234567"]]), "Leads")
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" })
  assert.throws(() => readImportSpreadsheet(buffer), error => error.sheets.includes("Leads"))
  assert.equal(readImportSpreadsheet(buffer, "Leads", 2).rows[0].Cliente, "Ana")
  assert.throws(() => readImportSpreadsheet(Buffer.from("Nome,Nome\nAna,Bia")), /repetidos/)
  assert.throws(() => readImportSpreadsheet(buffer, "Leads", 0), /cabeçalho/)
})

test("limite de 5000 linhas não descarta silenciosamente o restante", () => {
  const csv = "Nome,Telefone\n" + Array.from({ length: 5000 }, (_, i) => `Pessoa ${i},65991234567`).join("\n")
  assert.equal(readImportSpreadsheet(Buffer.from(csv)).rows.length, 5000)
  assert.throws(() => readImportSpreadsheet(Buffer.from(csv + "\nOutra,65991234567")), /5.000/)
})

test("campos mapeados sobrevivem à conversão XLSX e à normalização existente", () => {
  const { normalizeRow } = loader({ "@/lib/prisma": { prisma: {} } })("app/api/criar-lista/route.ts")
  const row = { ...mapImportRow(raw, mapping), email: "ana@example.test", jobTitle: "Gerente", crmDealId: "cm-existing" }
  const normalized = normalizeRow(row, "medicos", "teste.xlsx")
  assert.equal(normalized.lead.dealDescription, "Interesse: Imóvel\nRenda: 8.000")
  assert.equal(normalized.lead.email, "ana@example.test")
  assert.equal(normalized.lead.crmDealId, "cm-existing")
  assert.equal(normalized.lead.estado, "MT")
  assert.ok(normalized.lead.telefone.endsWith("65991234567"))
})

test("novo negócio recebe descrição e consultor em ambos os objetos; sem descrição mantém fluxo de contato", () => {
  const result = buildCrmDelivery(lead, "medicos", "crm-ana")
  assert.equal(result.method, "POST")
  assert.equal(result.payload.ownerId, "crm-ana")
  assert.equal(result.payload.contact.ownerId, "crm-ana")
  assert.equal(result.payload.contact.email, "ana@example.test")
  assert.equal(result.payload.description, lead.dealDescription)
  assert.equal(buildCrmDelivery({ ...lead, dealDescription: "" }, "medicos", "crm-ana"), null)
})

test("ID existente gera somente PATCH note; nota não é truncada nem substitui a descrição", () => {
  const result = buildCrmDelivery({ ...lead, crmDealId: "cm-existing" }, "medicos", "crm-ana")
  assert.equal(result.method, "PATCH")
  assert.deepEqual(result.payload, { note: lead.dealDescription })
  assert.throws(() => buildCrmDelivery({ ...lead, crmDealId: "cm-existing", dealDescription: "x".repeat(2001) }, "medicos", "crm-ana"), /2.000/)
  assert.throws(() => mapImportRow({ ID: "cm-existing", Texto: "x".repeat(2000) }, { ID: "crmDealId", Texto: "dealDescription" }), /2.000/)
})

test("Retry-After é respeitado", () => {
  assert.equal(retryDelay(new Response(null, { headers: { "Retry-After": "75" } })), 75000)
  assert.equal(retryDelay(new Response()), 60000)
})

test("worker envia descrição, trata 429 e não repete pedidos com resultado incerto", async () => {
  const previousFetch = global.fetch
  const previousUrl = process.env.CRM_API_URL
  const previousKey = process.env.CRM_API_KEY
  process.env.CRM_API_URL = "https://crm.example.test"
  process.env.CRM_API_KEY = "test-key"
  try {
    for (const mode of ["success", "rate-limit", "network", "server", "validation", "locked", "throttled", "patch"]) {
      let stage = 0, request, calls = 0
      const updates = []
      const job = { id: 1, ...buildCrmDelivery(mode === "patch" ? { ...lead, crmDealId: "cm-existing" } : lead, "medicos", "crm-ana") }
      const tx = { $queryRaw: async () => [{ locked: mode !== "locked" }], crmDelivery: {
        updateMany: async () => ({}),
        findFirst: async () => ++stage === 1 ? mode === "throttled" ? { attemptedAt: new Date() } : null : stage === 2 ? null : job,
        update: async () => job,
      } }
      const prisma = { $transaction: fn => fn(tx), crmDelivery: { update: async args => { updates.push(args.data); return {} } } }
      global.fetch = async (url, options) => {
        calls++
        request = { url, ...options }
        if (mode === "network") throw new Error("timeout")
        if (mode === "rate-limit") return new Response(null, { status: 429, headers: { "Retry-After": "60" } })
        return Response.json(mode === "server" || mode === "validation" ? { success: false, error: "Falha" } : { success: true, data: { id: "cm-created", warnings: ["Aviso de responsável"] } }, { status: mode === "server" ? 500 : mode === "validation" ? 400 : 201 })
      }
      const worker = loader({ "@/lib/prisma": { prisma } })("lib/crm-delivery-worker.ts")
      await worker.processNextCrmDelivery()
      if (["locked", "throttled"].includes(mode)) { assert.equal(calls, 0); continue }
      if (mode === "success" || mode === "patch") {
        assert.equal(updates[0].status, "sent")
        assert.equal(updates[0].crmDealId, "cm-created")
        assert.deepEqual(updates[0].warnings, ["Aviso de responsável"])
        assert.equal(request.method, mode === "patch" ? "PATCH" : "POST")
        assert.equal(request.url, "https://crm.example.test/api/v1/deals" + (mode === "patch" ? "/cm-existing" : ""))
      } else if (mode === "rate-limit") { assert.equal(updates[0].status, "pending"); assert.ok(updates[0].nextAttemptAt.getTime() >= Date.now() + 59000) }
      else assert.equal(updates[0].status, mode === "validation" ? "failed" : "needs_review")
    }
  } finally {
    global.fetch = previousFetch
    if (previousUrl === undefined) delete process.env.CRM_API_URL; else process.env.CRM_API_URL = previousUrl
    if (previousKey === undefined) delete process.env.CRM_API_KEY; else process.env.CRM_API_KEY = previousKey
  }
})

test("prévia exige administrador e não grava nem importa contatos", async () => {
  for (const role of [null, "supervisor", "admin"]) {
    const route = loader({ "@/lib/auth": { getAuthenticatedUser: async () => role ? { role } : null } })("app/api/import/preview/route.ts")
    const form = new FormData()
    form.append("file", new File(["Nome,Telefone,UF\nAna,65991234567,MT"], "leads.csv"))
    const response = await route.POST(new Request("http://localhost/api/import/preview", { method: "POST", body: form }))
    assert.equal(response.status, role === "admin" ? 200 : 401)
    if (role === "admin") { const data = await response.json(); assert.equal(data.totalRows, 1); assert.equal(data.mapping.Telefone, "phone") }
  }
})

test("upload usa exatamente o mapeamento confirmado e preserva descrição no arquivo enviado ao ETL", async () => {
  const previousRoot = process.env.LEADS_SOURCE_DIR, previousToken = process.env.ETL_TOKEN
  process.env.LEADS_SOURCE_DIR = path.join(root, ".import-test")
  process.env.ETL_TOKEN = "test-token"
  let written, processed = 0
  const route = loader({
    "@/lib/auth": { getAuthenticatedUser: async () => ({ role: "admin" }) },
    "node:fs/promises": { access: async () => {}, mkdir: async () => {}, writeFile: async (_path, buffer) => { written = buffer }, unlink: async () => {} },
    "@/app/api/criar-lista/route": { POST: async request => {
      processed++
      const body = await request.json()
      assert.equal(body.skipExisting, true)
      assert.equal(body.onlyNichos[0], "medicos")
      const workbook = XLSX.read(written)
      const row = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])[0]
      assert.equal(row.dealDescription, lead.dealDescription)
      assert.equal(row.name, "Ana")
      assert.equal(row.phone, "65991234567")
      assert.equal(row.Lixo, undefined)
      return Response.json({ ok: true, stats: { inseridos: 1 } })
    } },
  })("app/api/import/upload/route.ts")
  try {
    const form = new FormData()
    form.append("file", new File(["Cliente;Celular;UF;Interesse;Renda;Lixo\nAna;65991234567;MT;Imóvel;8.000;ignorar"], "diferente.csv"))
    form.append("columnMapping", JSON.stringify(mapping))
    form.append("nichoFolder", "medicos")
    let response = await route.POST(new Request("http://localhost/api/import/upload", { method: "POST", body: form }))
    assert.equal(response.status, 200)
    assert.equal(processed, 1)
    form.set("columnMapping", JSON.stringify({ ...mapping, Fantasma: "phone" }))
    response = await route.POST(new Request("http://localhost/api/import/upload", { method: "POST", body: form }))
    assert.equal(response.status, 400)
    assert.equal(processed, 1, "mapeamento inválido não pode chegar ao ETL")
  } finally {
    if (previousRoot === undefined) delete process.env.LEADS_SOURCE_DIR; else process.env.LEADS_SOURCE_DIR = previousRoot
    if (previousToken === undefined) delete process.env.ETL_TOKEN; else process.env.ETL_TOKEN = previousToken
  }
})

test("gerar lista grava distribuição e fila na mesma transação, sem envio externo da descrição na requisição", async () => {
  const queued = [], events = []
  const consultant = { id: "local-ana", crmUserId: "crm-ana", name: "Ana", supervisorId: "supervisor-test" }
  const tx = {
    $queryRaw: async () => [],
    lead: { findMany: async () => [lead] },
    lista: { create: async () => { events.push("lista"); return { id: 42 } } },
    listaLead: { createMany: async () => { events.push("distribuição") } },
    crmDelivery: { createMany: async args => { events.push("fila"); queued.push(...args.data); assert.equal(args.skipDuplicates, true) } },
  }
  const prisma = { $transaction: async fn => { events.push("início"); const result = await fn(tx); events.push("commit"); return result }, $queryRaw: async () => [], crmDelivery: { count: async () => 1 } }
  const route = loader({
    "@/lib/prisma": { prisma },
    "@/lib/auth": { getAuthenticatedUser: async () => ({ role: "admin", id: "test" }) },
    "@/lib/crm-members": { syncCRMConsultants: async () => [consultant] },
    "@/lib/consultant-quotas": { consumeConsultantMonthlyQuota: async () => {} },
  })("app/api/gerar-lista/route.ts")
  const request = data => new Request("http://localhost/api/gerar-lista", { method: "POST", body: JSON.stringify(data) })
  const body = { consultantCrmId: "crm-ana", consultantName: "Ana", quantidade: 1, estado: "MT", nicho: "medicos", enviarParaCrm: true }
  let response = await route.POST(request(body))
  assert.equal(response.status, 200)
  assert.deepEqual(events, ["início", "lista", "distribuição", "fila", "commit"])
  assert.equal(queued[0].listaId, 42)
  assert.equal(queued[0].payload.description, lead.dealDescription)
  assert.equal(queued[0].payload.ownerId, "crm-ana")
  assert.equal((await response.json()).crmQueuedCount, 1)
  response = await route.POST(request({ ...body, consultantCrmId: "outside-team" }))
  assert.equal(response.status, 403)
  assert.equal(queued.length, 1)
})

test("campanha preserva descrição importada e usa a mesma fila e o consultor autorizado", async () => {
  let queued
  const consultant = { id: "local-ana", crmUserId: "crm-ana", name: "Ana", supervisorId: "supervisor-test" }
  const tx = { $queryRaw: async () => [], consultant: { findFirst: async () => consultant }, lead: { findMany: async () => [lead] }, blackFridayLead: { createMany: async () => {} }, crmDelivery: { createMany: async args => { queued = args.data } } }
  const prisma = { $transaction: fn => fn(tx), blackFridayCampaign: { findFirst: async () => ({ id: 1, name: "Black Friday", nicho: "black-friday-2026" }) }, crmDelivery: { count: async () => 1 } }
  const route = loader({
    "@/lib/prisma": { prisma },
    "@/lib/auth": { getAuthenticatedUser: async () => ({ role: "admin", id: "test", name: "Gestor" }) },
    "@/lib/crm-members": { syncCRMConsultants: async () => [consultant] },
    "@/lib/server-users": { getInitialUsers: () => [] },
    "@/lib/lead-visibility": { canViewGlobalLeadCounts: async () => true },
  })("app/api/black-friday/route.ts")
  const response = await route.POST(new Request("http://localhost/api/black-friday", { method: "POST", body: JSON.stringify({ consultantId: "local-ana", quantity: 1, sendToCrm: true }) }))
  assert.equal(response.status, 200)
  assert.equal(queued[0].consultantCrmId, "crm-ana")
  assert.ok(queued[0].payload.description.includes(lead.dealDescription))
  assert.ok(queued[0].payload.description.includes("Campanha: Black Friday"))
  assert.equal((await response.json()).crm.queuedCount, 1)
})
