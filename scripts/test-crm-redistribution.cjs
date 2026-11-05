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
const { buildCrmRedistribution, defaultCrmDestination, findAvailableCampaignLeads, isLegacyCampaignDelivery, pickAvailableCampaignLeads } = load('lib/crm-redistribution.ts')
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
test('long spreadsheet texts are cut to the CRM limits instead of refusing the lead', () => {
  const { payload } = buildCrmRedistribution({ requestId: 'r', campaignKey: 'c', phone: '65999990000', actorId: 'a', ownerId: 'o', pipelineId: 'p', stageId: 's', reopenLost: true, createIfMissing: { name: 'n'.repeat(300), city: 'c'.repeat(150), email: '  ', description: 'd'.repeat(20_000) } })
  assert.equal(payload.fallback.name.length, 200); assert.equal(payload.fallback.city.length, 100); assert.equal(payload.fallback.description.length, 10_000); assert.equal(payload.fallback.email, undefined)
})
test('the CRM destination is only preselected when there is no doubt', () => {
  const vendas = { id: 'p1', name: 'Funil de Vendas', stages: [{ id: 's1', name: 'Novo' }, { id: 's2', name: 'BLACK NOVEMBER' }] }
  const outro = { id: 'p2', name: 'Pós-venda', stages: [{ id: 's3', name: 'Black' }] }
  assert.deepEqual(defaultCrmDestination([outro, vendas]), { pipelineId: 'p1', stageId: 's2' })
  assert.deepEqual(defaultCrmDestination([outro]), { pipelineId: 'p2', stageId: 's3' })
  assert.deepEqual(defaultCrmDestination([outro, { id: 'p3', name: 'Outro', stages: [] }]), { pipelineId: '', stageId: '' })
  assert.deepEqual(defaultCrmDestination([{ ...vendas, stages: [{ id: 's1', name: 'Black 1' }, { id: 's2', name: 'Black 2' }] }]), { pipelineId: 'p1', stageId: '' })
  assert.deepEqual(defaultCrmDestination([{ ...vendas, stages: [{ id: 's1', name: 'Black Antiga' }, { id: 's2', name: 'BLACK NOVEMBER' }] }]), { pipelineId: 'p1', stageId: 's2' })
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

async function exerciseWorker(job, response, replacement = {}) {
  const oldFetch = global.fetch
  const oldBase = process.env.CRM_API_URL; const oldKey = process.env.CRM_API_KEY
  const calls = []; const updates = []
  let reads = 0
  const tx = { $queryRaw: async () => [{ locked: true }], crmDelivery: {
    updateMany: async () => ({ count: 0 }), findFirst: async () => ++reads === 2 ? job : null,
    findMany: async () => replacement.recent ?? [], update: async args => { replacement.renamed = args.data.idempotencyKey ?? replacement.renamed; return job },
    create: async args => { replacement.created = args.data; return args.data },
  },
    blackFridayLead: { findUnique: async () => replacement.claim ?? null, findMany: async () => [], create: async args => { replacement.claimed = args.data; return args.data }, deleteMany: async args => { replacement.released = args.where.leadId; return { count: 1 } } },
    lead: { findMany: async () => replacement.candidates ?? [], findUnique: async () => replacement.lead ?? null },
  }
  const fakePrisma = { $transaction: async cb => cb(tx), crmDelivery: { update: async args => { updates.push(args.data); return job } }, blackFridayLead: { updateMany: async () => ({ count: 1 }) } }
  process.env.CRM_API_URL = 'https://crm.invalid'; process.env.CRM_API_KEY = 'fake-test-key'
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return response }
  try { await loader({ '@/lib/prisma': { prisma: fakePrisma } })('lib/crm-delivery-worker.ts').processNextCrmDelivery(); return { calls, updates } }
  finally {
    global.fetch = oldFetch
    for (const [key, value] of Object.entries({ CRM_API_URL: oldBase, CRM_API_KEY: oldKey })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
}
const job = { id: 1, method: 'REDISTRIBUTE', idempotencyKey: 'black-friday:1:lead:2', leadId: 2, listaId: null, payload: { requestId: 'r', phone: '0624250000' } }
test('old campaign jobs execute no network request', async () => {
  const result = await exerciseWorker({ ...job, method: 'POST' })
  assert.equal(result.calls.length, 0); assert.equal(result.updates[0].status, 'needs_review')
})
test('the last resort is only requested when explicitly authorized, with a name', () => {
  const base = { requestId: 'r', campaignKey: 'c', phone: '65999990000', actorId: 'a', ownerId: 'o', pipelineId: 'p', stageId: 's', reopenLost: false }
  assert.equal(buildCrmRedistribution(base).payload.createIfMissing, undefined)
  assert.equal(buildCrmRedistribution({ ...base, createIfMissing: { name: '  ' } }).payload.createIfMissing, undefined)
  const { payload } = buildCrmRedistribution({ ...base, createIfMissing: { name: 'Ana', email: null, description: 'Nota' } })
  assert.equal(payload.createIfMissing, true); assert.deepEqual(payload.fallback, { name: 'Ana', description: 'Nota' })
})
test('a deal created as last resort is reported as created', async () => {
  const result = await exerciseWorker(job, { status: 200, ok: true, json: async () => ({ success: true, data: { id: 'deal', contactId: 'contact', outcome: 'created', auditId: 'audit', warnings: [] } }) })
  assert.equal(result.updates[0].status, 'sent')
})
test('worker only calls the redistribution endpoint and preserves original lookup digits', async () => {
  const result = await exerciseWorker(job, { status: 200, ok: true, json: async () => ({ success: true, data: { id: 'deal', contactId: 'contact', outcome: 'updated', auditId: 'audit', warnings: [] } }) })
  assert.equal(result.calls.length, 1); assert.ok(result.calls[0].url.endsWith('/api/v1/painel-nichos/redistributions'))
  assert.equal(JSON.parse(result.calls[0].opts.body).phone, '0624250000'); assert.equal(result.updates[0].status, 'sent')
})
test('a contact the CRM already distributed is settled, not an error to resend', async () => {
  const result = await exerciseWorker(job, { status: 409, ok: false, json: async () => ({ success: false, error: 'Já redistribuído', details: [{ code: 'CONTACT_ALREADY_DISTRIBUTED' }] }) })
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
test('a lead the CRM refuses for good is settled with its reason, without review or resend', async () => {
  const result = await exerciseWorker(job, { status: 404, ok: false, json: async () => ({ success: false, error: 'Não encontrado', details: [{ code: 'DEAL_NOT_FOUND' }] }) })
  assert.equal(result.calls.length, 1); assert.equal(result.updates[0].status, 'skipped'); assert.equal(result.updates[0].error, 'Não encontrado')
})
const refused = code => ({ status: 404, ok: false, json: async () => ({ success: false, error: 'Recusado', details: [{ code }] }) })
const nextLead = { id: 9, phone: '11988887777', name: 'Próximo', email: null, company: null, fantasy: null, city: null, state: null, dealDescription: null, crmDealId: null }
const replacementJob = { ...job, payload: { ...job.payload, actorId: 'sup', ownerId: 'crm-ana', pipelineId: 'p', stageId: 's' } }
const replacementSetup = extra => ({ claim: { campaignId: 1, supervisorId: 'sup', consultantId: 'ana', consultantName: 'Ana', campaign: { id: 1, nicho: 'black-friday-2026' } }, candidates: [nextLead], lead: nextLead, ...extra })
test('a refused lead gives its place to the next one, for the same consultant and stage', async () => {
  const setup = replacementSetup(); await exerciseWorker(replacementJob, refused('DEAL_NOT_FOUND'), setup)
  assert.equal(setup.claimed.leadId, 9); assert.equal(setup.claimed.consultantId, 'ana'); assert.equal(setup.claimed.crmStatus, 'pending')
  assert.equal(setup.created.idempotencyKey, 'black-friday:1:lead:9'); assert.equal(setup.created.payload.stageId, 's'); assert.equal(setup.created.payload.ownerId, 'crm-ana'); assert.equal(setup.created.payload.reopenLost, true)
})
test('mass refusals stop the replacement instead of burning the base', async () => {
  const setup = replacementSetup({ recent: Array(25).fill({ status: 'skipped' }) }); await exerciseWorker(replacementJob, refused('DEAL_NOT_FOUND'), setup)
  assert.equal(setup.created, undefined); assert.equal(setup.claimed, undefined)
})
test('an open deal from another team goes back to the pool, but not to the same supervisor', async () => {
  const setup = replacementSetup(); const result = await exerciseWorker(replacementJob, refused('CURRENT_OWNER_OUTSIDE_TEAM'), setup)
  assert.equal(setup.released, 2); assert.equal(setup.renamed, 'black-friday:1:lead:2:refused:sup')
  assert.equal(setup.claimed.leadId, 9); assert.equal(result.updates[0].status, 'skipped')
  const db = { crmDelivery: { findMany: async args => args.where.idempotencyKey.endsWith === ':refused:sup' ? [{ leadId: 2 }] : [] }, blackFridayLead: { findMany: async () => [] },
    lead: { findMany: async () => [{ id: 2, phone: '65999990000' }, { id: 3, phone: '11988887777' }] } }
  assert.deepEqual((await findAvailableCampaignLeads(db, 'n', 5, 'sup')).map(lead => lead.id), [3])
  assert.deepEqual((await findAvailableCampaignLeads(db, 'n', 5, 'other')).map(lead => lead.id), [2, 3])
})
test('uncertain CRM answers are retried with the same request while recent, then go to review', async () => {
  const recent = { ...replacementJob, createdAt: new Date() }; const old = { ...replacementJob, createdAt: new Date(Date.now() - 3_600_000) }
  const down = { status: 500, ok: false, json: async () => null }; const conflict = { status: 409, ok: false, json: async () => ({ success: false, error: 'Mudou' }) }
  for (const response of [down, conflict]) {
    const retried = await exerciseWorker(recent, response); assert.equal(retried.updates[0].status, 'pending')
    assert.equal((await exerciseWorker(old, response)).updates[0].status, 'needs_review')
  }
})
test('errors unrelated to the lead never consume another lead', async () => {
  const setup = replacementSetup(); await exerciseWorker(replacementJob, refused('ACTOR_NOT_AUTHORIZED'), setup)
  assert.equal(setup.created, undefined)
})
test('a failed replacement does not turn the settled refusal into an error', async () => {
  const result = await exerciseWorker(replacementJob, refused('DEAL_NOT_FOUND'), { claim: {} })
  assert.equal(result.updates.length, 1); assert.equal(result.updates[0].status, 'skipped')
})
test('a refusal unrelated to the lead still goes to review instead of settling the whole base', async () => {
  const result = await exerciseWorker(job, { status: 403, ok: false, json: async () => ({ success: false, error: 'Sem permissão', details: [{ code: 'ACTOR_NOT_AUTHORIZED' }] }) })
  assert.equal(result.updates[0].status, 'needs_review')
})
test('no match remains visible for review and never falls back to creating a deal', async () => {
  const result = await exerciseWorker(job, { status: 404, ok: false, json: async () => ({ success: false, error: 'Contato não encontrado' }) })
  assert.equal(result.calls.length, 1); assert.equal(result.updates[0].status, 'needs_review')
})
