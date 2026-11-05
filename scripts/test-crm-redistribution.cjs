const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
function loader(mocks = {}) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const m = { exports: {} }; cache.set(file, m)
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    new Function('require', 'module', 'exports', code)(name => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith('@/') ? load(name.slice(2) + '.ts') : require(name), m, m.exports)
    return m.exports
  }
  return load
}
const load = loader()
const { buildCrmRedistribution, isLegacyCampaignDelivery, pickAvailableCampaignLeads } = load('lib/crm-redistribution.ts')
const { campaignPhoneKey, normalizeCampaignPhone, normalizeImportPhone } = load('lib/phone-normalization.ts')
test('formats of the same phone share one key and different people do not', () => {
  for (const phone of ['65999990000', '5565999990000', '065999990000', '005565999990000','6599990000', '556599990000', '(65) 99999-0000', '02165999990000']) assert.equal(campaignPhoneKey(phone), '6599990000', phone)
  assert.equal(campaignPhoneKey('0624250000'), campaignPhoneKey('55624250000'))
  assert.notEqual(campaignPhoneKey('65999990000'), campaignPhoneKey('11999990000'))
  assert.equal(campaignPhoneKey('55999990000'), '5599990000')
  assert.equal(campaignPhoneKey('+351968203610'), '+351968203610')
  assert.equal(campaignPhoneKey('0000000000'), null); assert.equal(campaignPhoneKey(null), null)
})
test('a phone already distributed never returns in another format, even across editions', () => {
  const leads = [{ id: 1, phone: '5565999990000' }, { id: 2, phone: '11988887777' }, { id: 3, phone: '011988887777' }, { id: 4, phone: null }, { id: 5, phone: '21977776666' }]
  assert.deepEqual(pickAvailableCampaignLeads(leads, ['065999990000']).map(lead => lead.id), [2, 5])
  assert.deepEqual(pickAvailableCampaignLeads(leads, [], 2).map(lead => lead.id), [1, 2])
})
const { mapImportRow } = load('lib/import-mapping.ts')
test('campaign numbers preserve their source identity instead of inventing a WhatsApp', () => {
  for (const phone of ['0624250000', '55624250000', '62942500000', '+351968203610']) assert.equal(normalizeCampaignPhone(phone), phone)
  assert.equal(normalizeImportPhone('0624250000'), null)
  assert.equal(normalizeCampaignPhone('0000000000'), null)
  const row = mapImportRow({ Nome: 'Cliente', Telefone: '55624250000' }, { Nome: 'name', Telefone: 'phone' }, { campaign: true })
  assert.equal(row.phone, '55624250000')
})
test('redistribution carries the original phone and authenticated actor, never a contact creation payload', () => {
  const job = buildCrmRedistribution({ requestId: 'r', campaignKey: 'black-friday-2026', phone: '0624250000', actorId: 'actor', ownerId: 'target', pipelineId: 'pipeline', stageId: 'stage', reopenLost: false })
  assert.equal(job.method, 'REDISTRIBUTE'); assert.equal(job.payload.phone, '0624250000')
  assert.equal(job.payload.actorId, 'actor'); assert.equal(job.payload.contact, undefined)
  assert.equal(job.payload.contactId, undefined); assert.equal(job.payload.dealId, undefined)
})
test('legacy campaign creates are recognized regardless of source spelling', () => {
  assert.ok(isLegacyCampaignDelivery({ method: 'POST', idempotencyKey: 'black-friday:1:lead:2', payload: {} }))
  assert.ok(isLegacyCampaignDelivery({ method: 'CONTACTS_BULK', idempotencyKey: 'import:abc:contacts:0', payload: { contacts: [{ source: 'Painel Nichos - BLACK FRIDAY 2026' }] } }))
  assert.equal(isLegacyCampaignDelivery({ method: 'REDISTRIBUTE', idempotencyKey: 'black-friday:1:lead:2', payload: {} }), false)
  assert.equal(isLegacyCampaignDelivery({ method: 'POST', idempotencyKey: 'list:1:lead:2', payload: {} }), false)
})

async function exerciseWorker(job, enabled, response) {
  const oldFetch = global.fetch; const oldEnabled = process.env.CRM_EXISTING_DEALS_ENABLED
  const oldBase = process.env.CRM_API_URL; const oldKey = process.env.CRM_API_KEY
  const calls = []; const updates = []
  let reads = 0
  const tx = { $queryRaw: async () => [{ locked: true }], crmDelivery: {
    updateMany: async () => ({ count: 0 }), findFirst: async () => ++reads === 2 ? job : null,
    findMany: async () => [], update: async () => job,
  } }
  const fakePrisma = { $transaction: async cb => cb(tx), crmDelivery: { update: async args => { updates.push(args.data); return job } }, blackFridayLead: { updateMany: async () => ({ count: 1 }) } }
  process.env.CRM_EXISTING_DEALS_ENABLED = enabled ? 'true' : 'false'
  process.env.CRM_API_URL = 'https://crm.invalid'; process.env.CRM_API_KEY = 'fake-test-key'
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return response }
  try { await loader({ '@/lib/prisma': { prisma: fakePrisma } })('lib/crm-delivery-worker.ts').processNextCrmDelivery(); return { calls, updates } }
  finally {
    global.fetch = oldFetch
    for (const [key, value] of Object.entries({ CRM_EXISTING_DEALS_ENABLED: oldEnabled, CRM_API_URL: oldBase, CRM_API_KEY: oldKey })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
}
const job = { id: 1, method: 'REDISTRIBUTE', idempotencyKey: 'black-friday:1:lead:2', leadId: 2, listaId: null, payload: { requestId: 'r', phone: '0624250000' } }
test('disabled integration and old campaign jobs execute no network request', async () => {
  for (const [item, enabled] of [[job, false], [{ ...job, method: 'POST' }, true]]) {
    const result = await exerciseWorker(item, enabled)
    assert.equal(result.calls.length, 0); assert.equal(result.updates[0].status, 'needs_review')
  }
})
test('worker only calls the redistribution endpoint and preserves original lookup digits', async () => {
  const result = await exerciseWorker(job, true, { status: 200, ok: true, json: async () => ({ success: true, data: { id: 'deal', contactId: 'contact', outcome: 'updated', auditId: 'audit', warnings: [] } }) })
  assert.equal(result.calls.length, 1); assert.ok(result.calls[0].url.endsWith('/api/v1/painel-nichos/redistributions'))
  assert.equal(JSON.parse(result.calls[0].opts.body).phone, '0624250000'); assert.equal(result.updates[0].status, 'sent')
})
test('a contact the CRM already distributed is settled, not an error to resend', async () => {
  const result = await exerciseWorker(job, true, { status: 409, ok: false, json: async () => ({ success: false, error: 'Já redistribuído', details: [{ code: 'CONTACT_ALREADY_DISTRIBUTED' }] }) })
  assert.equal(result.calls.length, 1); assert.equal(result.updates[0].status, 'skipped')
})
test('undoing an import keeps distributed leads reserved and only cancels what has not left', async () => {
  const calls = { deletedLeads: null, claimDeletes: 0, claimUpdates: null, deliveryDeletes: [] }
  const tx = {
    importBatch: { findUnique: async () => ({ id: 1, niche: 'black-friday-2026', status: 'completed', removedCount: 0, importedCount: 2, fingerprint: 'f', leadIds: [1, 2] }), update: async () => ({}) },
    lead: {
      findMany: async () => [{ id: 1, blackFridayClaim: { id: 9 }, crmDeliveries: [{ id: 5 }], listaLeads: [] }, { id: 2, blackFridayClaim: null, crmDeliveries: [], listaLeads: [] }],
      deleteMany: async args => { calls.deletedLeads = args.where.id.in; return { count: args.where.id.in.length } }, updateMany: async () => ({ count: 1 }),
    },
    crmDelivery: { findMany: async () => [{ id: 5, leadId: 1 }], deleteMany: async args => { calls.deliveryDeletes.push(args.where); return { count: 1 } } },
    blackFridayLead: { deleteMany: async () => { calls.claimDeletes++; return { count: 1 } }, updateMany: async args => { calls.claimUpdates = args; return { count: 1 } } },
  }
  const route = loader({
    '@/lib/prisma': { prisma: { $transaction: fn => fn(tx) } },
    '@/lib/auth': { getAuthenticatedUser: async () => ({ role: 'admin', isOwner: true, id: 'owner' }) },
  })('app/api/import/[id]/undo/route.ts')
  const response = await route.POST(new Request('http://localhost/api/import/1/undo', { method: 'POST' }), { params: Promise.resolve({ id: '1' }) })
  assert.equal(response.status, 200)
  assert.equal(calls.claimDeletes, 0); assert.deepEqual(calls.deletedLeads, [2])
  assert.deepEqual(calls.claimUpdates.where.leadId.in, [1]); assert.equal(calls.claimUpdates.data.crmStatus, 'not_requested')
})
test('no match remains visible for review and never falls back to creating a deal', async () => {
  const result = await exerciseWorker(job, true, { status: 404, ok: false, json: async () => ({ success: false, error: 'Contato não encontrado' }) })
  assert.equal(result.calls.length, 1); assert.equal(result.updates[0].status, 'needs_review')
})
