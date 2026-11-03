// Start a local server with CRM_DELIVERY_WORKER_ENABLED=false and
// JWT_SECRET=painel-import-browser-test-only-key. No real import or CRM write is performed.
const puppeteer = require("puppeteer")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

;(async () => {
  const { SignJWT } = await import("jose")
  const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:3105"
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error("Use somente um servidor local de teste.")
  const fixture = path.resolve(__dirname, "../.import-browser-fixture.csv")
  fs.writeFileSync(fixture, "Comprador;Fone principal;UF;Interesse;Renda\nAna Silva;65991234567;MT;Imóvel;8.000")
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.TEST_BROWSER_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--no-sandbox"] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1366, height: 768 })
    const token = await new SignJWT({ id: "browser-test-admin", role: "admin" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(new TextEncoder().encode("painel-import-browser-test-only-key"))
    await page.setCookie({ name: "auth_token", value: token, url: origin })
    await page.setRequestInterception(true)
    page.on("request", request => {
      const url = new URL(request.url())
      if (url.origin !== origin) return request.abort()
      if (!url.pathname.startsWith("/api/")) return request.continue()
      if (url.pathname === "/api/import/preview") return request.continue()
      let data = { ok: true }
      if (url.pathname === "/api/auth/me") data.user = { id: "browser-test-admin", name: "Administrador de teste", role: "admin", isOwner: true }
      else if (url.pathname === "/api/consultants") data.consultants = []
      else if (url.pathname === "/api/crm/deliveries") data = { ok: true, counts: {}, problems: [], warnings: [] }
      else if (url.pathname === "/api/black-friday") data = { ok: true, campaign: null, allocations: [] }
      return request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(data) })
    })
    await page.goto(origin, { waitUntil: "networkidle0" })
    await page.waitForSelector('button[aria-label="Importar dados"]')
    await page.click('button[aria-label="Importar dados"]')
    await page.waitForSelector('input[type="file"]')
    await (await page.$('input[type="file"]')).uploadFile(fixture)
    await page.waitForSelector("#column-0")
    await page.select("#column-0", "name")
    await page.select("#column-1", "phone")
    await page.select("#column-3", "dealDescription")
    await page.select("#column-4", "dealDescription")
    await page.select('select[aria-label="Nicho"]', "medicos")
    await page.waitForFunction(() => document.body.innerText.includes("Interesse: Imóvel") && document.body.innerText.includes("Renda: 8.000"))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    await page.setViewport({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "não pode haver corte horizontal no celular")
    // Intercept FormData in the browser: validate the confirmed mapping without writing to the database.
    await page.evaluate(() => {
      const originalFetch = window.fetch
      window.fetch = async (url, options) => {
        if (url === "/api/import/upload") {
          window.__confirmedMapping = JSON.parse(options.body.get("columnMapping"))
          return new Response(JSON.stringify({ ok: true, stats: { inseridos: 1, ignoradosDuplicados: 0, linhasInvalidas: 0, erros: 0 } }), { headers: { "Content-Type": "application/json" } })
        }
        return originalFetch(url, options)
      }
      const button = [...document.querySelectorAll("button")].find(b => b.textContent === "Importar 1 contato")
      if (!button || button.disabled) throw new Error("O botão de importação deveria estar habilitado.")
      button.click()
    })
    await page.waitForFunction(() => document.body.innerText.includes("Importação concluída"))
    const confirmed = await page.evaluate(() => window.__confirmedMapping)
    assert.equal(confirmed.Interesse, "dealDescription")
    assert.equal(confirmed.Renda, "dealDescription")
    assert.equal(confirmed.Comprador, "name")
    console.log("Navegador: prévia real de CSV, mapeamento de várias colunas, confirmação e layouts 1366x768 / 390x844 passaram. Nenhum contato real foi importado.")
  } finally {
    await browser.close()
    fs.unlinkSync(fixture)
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
