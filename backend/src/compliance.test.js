// Compliance report document tests — run with `npm test` (backend).
//
// report.test.js already holds every *figure* to the event that produced it.
// This file covers the layer above: that the document built from those figures
// says something true about them, that the risk score moves for a stated
// reason, and that the executive summary never claims to be AI-written when it
// was not — the provenance rule layer2.js keeps between 'gemini' and
// 'heuristic'.
//
// Runs with no GEMINI_API_KEY on purpose, so the analyst path is the one under
// test. It is the summary the report ships with offline, so it has to hold up.
delete process.env.GEMINI_API_KEY

import assert from 'node:assert/strict'
import {
  resetStore, recordOverride, resolveAlert, decideVisa,
  shadowAITools, clearToolOrgWide, suspendToolOrgWide, toolStatus,
} from './store.js'
import {
  complianceReport, riskPosture, bandFor, analystSummary, executiveSummary,
  resetSummaryCache, VALUE_PER_MASKED_ITEM,
} from './compliance.js'

let passed = 0
function test(name, fn) {
  resetStore()
  resetSummaryCache()
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// ---- the document ----------------------------------------------------------

test('the report carries every section the page and the download render', () => {
  const r = complianceReport()
  for (const key of ['org', 'period', 'risk', 'kpis', 'frameworks', 'controls', 'topEvents']) {
    assert.ok(r[key], `report is missing ${key}`)
  }
  assert.equal(r.period.from, '01 Jul 2026')
  assert.ok(r.frameworks.length >= 4)
  assert.ok(r.controls.length >= 6)
})

// The README documents /api/report as the flat totals. Anything already reading
// them must keep working after the document sections were added around them.
test('the flat period totals survive alongside the document', () => {
  const r = complianceReport()
  assert.equal(r.promptsProtected, 4120)
  assert.equal(r.itemsMasked, 612)
  assert.equal(r.confirmedLeaks, 0)
})

test('exposure value is masked items priced, not a number of its own', () => {
  const r = complianceReport()
  assert.equal(r.kpis.valueProtected, r.itemsMasked * VALUE_PER_MASKED_ITEM)
})

test('every framework row states evidence and a derived status', () => {
  for (const f of complianceReport().frameworks) {
    assert.ok(f.name && f.detail && f.status)
    assert.ok(['ok', 'watch'].includes(f.state))
  }
})

// A report whose framework rows are green whatever happened is decoration. The
// PDPA row is the one an override must be able to turn.
test('a confirmed leak turns the PDPA row from covered to attention', () => {
  const pdpa = r => r.frameworks.find(f => f.name.startsWith('PDPA'))
  assert.equal(pdpa(complianceReport()).state, 'ok')

  recordOverride({ prompt: 'send it anyway 880505-10-5566' })
  assert.equal(pdpa(complianceReport()).state, 'watch')
  assert.equal(pdpa(complianceReport()).status, 'Attention')
})

test('the evidence annexe holds masked records only', () => {
  const events = complianceReport().topEvents
  assert.ok(events.length > 0)
  for (const e of events) {
    assert.ok(e.time && e.user && e.action)
    assert.ok(!/\d{6}-\d{2}-\d{4}/.test(e.record), 'a raw IC number reached the report')
  }
})

// ---- the risk score --------------------------------------------------------

test('the bands map to the four the UI has colours for', () => {
  assert.equal(bandFor(0), 'Low')
  assert.equal(bandFor(24), 'Low')
  assert.equal(bandFor(25), 'Moderate')
  assert.equal(bandFor(49), 'Moderate')
  assert.equal(bandFor(50), 'Elevated')
  assert.equal(bandFor(75), 'High')
  assert.equal(bandFor(100), 'High')
})

test('the score is the sum of its own stated factors', () => {
  const risk = riskPosture()
  assert.equal(risk.score, risk.factors.reduce((n, f) => n + f.points, 0))
  assert.equal(risk.band, bandFor(risk.score))
  assert.equal(risk.trend[risk.trend.length - 1], risk.score)
})

test('an override is the single event that moves the score most', () => {
  const before = riskPosture()
  recordOverride({ prompt: 'send it anyway 880505-10-5566' })
  const after = riskPosture()
  assert.ok(after.score > before.score, 'a confirmed leak must raise the score')
  const leaks = after.factors.find(f => f.key === 'leaks')
  assert.equal(leaks.points, 20)
  assert.equal(leaks.tone, 'high')
})

test('closing the queue lowers the score', () => {
  const before = riskPosture().score
  for (const id of ['RA-2048', 'RA-2049', 'RA-2050', 'RA-2051']) resolveAlert(id)
  const after = riskPosture()
  assert.ok(after.score < before)
  assert.equal(after.factors.find(f => f.key === 'alerts').points, 0)
})

test('reviewing the pending tool requests lowers the unreviewed-tools factor', () => {
  const before = riskPosture().factors.find(f => f.key === 'tools').points
  decideVisa('A-0492', 'approve')
  const after = riskPosture().factors.find(f => f.key === 'tools').points
  assert.ok(after < before)
})

// ---- the executive summary -------------------------------------------------

test('the analyst summary states the figures it was given', () => {
  const report = complianceReport()
  const text = analystSummary(report)
  assert.ok(text.includes('4,120'), 'prompts protected')
  assert.ok(text.includes('612'), 'items masked')
  assert.ok(text.includes(String(report.risk.score)), 'risk score')
  assert.ok(text.includes('01 Jul 2026') && text.includes('19 Jul 2026'), 'the period')
})

// Zero confirmed leaks is the report's strongest finding, and the sentence that
// carries it has to change when it stops being true.
test('the summary says plainly whether data left the organisation', () => {
  assert.match(analystSummary(complianceReport()), /No sensitive data is confirmed to have left/)
  recordOverride({ prompt: 'send it anyway 880505-10-5566' })
  assert.match(analystSummary(complianceReport()), /left the organisation unmasked/)
})

test('the summary is one paragraph of prose, not markdown', () => {
  const text = analystSummary(complianceReport())
  assert.ok(!text.includes('\n'), 'a paragraph, not a list')
  assert.ok(!/[*#`]/.test(text), 'no markdown reaches the report')
})

await (async () => {
  resetStore()
  resetSummaryCache()

  // With no key configured there is no AI writer, and the response must say so
  // rather than let the page label the fallback "Written by Gemini".
  const first = await executiveSummary()
  assert.equal(first.source, 'analyst')
  assert.equal(first.cached, false)
  assert.equal(first.summary, analystSummary(complianceReport()))
  passed++
  console.log('  ✓ with no model key the summary is labelled analyst, never gemini')

  // The report screen polls every five seconds. Rewriting the summary on each
  // tick is what burns a free key's whole quota inside a minute.
  const second = await executiveSummary()
  assert.equal(second.cached, true)
  assert.equal(second.summary, first.summary)
  passed++
  console.log('  ✓ unchanged figures are answered from the cache')

  // "Regenerate with AI" has to actually ask again, or the button is a placebo.
  const forced = await executiveSummary({ refresh: true })
  assert.equal(forced.cached, false)
  passed++
  console.log('  ✓ regenerate bypasses the cache')

  // Figures that move invalidate it on their own, so the paragraph on screen
  // can never describe a period that has already changed underneath it.
  recordOverride({ prompt: 'send it anyway 880505-10-5566' })
  const moved = await executiveSummary()
  assert.equal(moved.cached, false)
  assert.notEqual(moved.summary, first.summary)
  passed++
  console.log('  ✓ a change in the figures rewrites the summary')
})()

// ---- shadow AI (O3) --------------------------------------------------------
//
// The panel's whole claim is "unapproved tools *currently in use*". A list of
// everything the register has not approved would look identical on a day when
// nothing happened, so these pin the two properties that make it a detection.

test('shadow AI reports only unapproved tools the log has actually seen', () => {
  const found = shadowAITools()
  const names = found.map(t => t.name)

  // SummarizerX is unapproved and appears in the seeded log.
  assert.ok(names.includes('SummarizerX'), 'a used unapproved tool must be surfaced')

  // DeepSeek and Kimi are unapproved but nobody has opened them this session.
  assert.ok(!names.includes('DeepSeek'), 'an unused unapproved tool is not shadow AI')
  assert.ok(!names.includes('Kimi'), 'an unused unapproved tool is not shadow AI')

  // ChatGPT is used constantly and is approved.
  assert.ok(!names.includes('ChatGPT'), 'an approved tool is never shadow AI')
})

test('a shadow AI row carries what an admin needs to act', () => {
  const row = shadowAITools().find(t => t.name === 'SummarizerX')
  assert.equal(row.status, 'UNAPPROVED')
  assert.ok(row.vendor)
  assert.ok(row.events > 0)
  assert.ok(row.departments.includes('Sales'))
  assert.equal(row.awaitingReview, true) // A-0492 is in the queue for it
  assert.ok(row.lastSeen)
})

// Privacy-minimised the same way the audit log is. A panel that named the
// people using an unapproved tool would make this the surveillance tool the
// case study argues against.
test('shadow AI counts employees, it never names them', () => {
  for (const row of shadowAITools()) {
    assert.equal(typeof row.employees, 'number')
    const json = JSON.stringify(row)
    assert.ok(!/E-\d{3}|S-\d{3}|F-\d{3}/.test(json), 'no employee id may reach the panel')
  }
})

// Approving one employee's request is not the organisation clearing a vendor —
// decideVisa says so at length, and the panel has to agree with it. Getting
// this wrong would mean one Trainee's approved request silently emptied the
// Shadow AI panel for everybody.
test('approving one employee\'s request does NOT clear the tool org-wide', () => {
  decideVisa('A-0492', 'approve')
  assert.ok(shadowAITools().some(t => t.name === 'SummarizerX'),
    'the tool is still unreviewed org-wide, so it is still shadow AI')
})

// The detection has to be resolvable, or it is a list an admin learns to ignore.
test('clearing a tool org-wide removes it from shadow AI', () => {
  assert.ok(shadowAITools().some(t => t.name === 'SummarizerX'))
  const result = clearToolOrgWide('SummarizerX')
  assert.equal(result.ok, true)
  assert.equal(result.tool.status, 'APPROVED')
  assert.ok(!shadowAITools().some(t => t.name === 'SummarizerX'), 'a cleared tool leaves the panel')
})

// The register used to ratchet one way: suspendToolOrgWide could refuse a tool
// and nothing anywhere could ever clear one again, so a suspension outlived the
// vendor issue that caused it.
test('a suspension can be lifted once the vendor issue is resolved', () => {
  assert.equal(suspendToolOrgWide('ChatGPT').ok, true)
  assert.equal(toolStatus('ChatGPT'), 'SUSPENDED')

  const result = clearToolOrgWide('ChatGPT')
  assert.equal(result.ok, true)
  assert.equal(result.reinstated, true)
  assert.equal(toolStatus('ChatGPT'), 'APPROVED')
  assert.equal(result.tool.suspendedOn, undefined, 'a cleared tool stops explaining why it was blocked')
})

test('clearing is refused when there is nothing to clear', () => {
  assert.equal(clearToolOrgWide('ChatGPT').reason, 'already_approved')
  assert.equal(clearToolOrgWide('NoSuchTool').reason, 'not_found')
})

// Both directions are governance decisions and both belong in the log.
test('clearing a tool org-wide is auditable', () => {
  const result = clearToolOrgWide('SummarizerX')
  assert.ok(result.event, 'an audit event is written')
  assert.equal(result.event.action, 'APPROVED')
  assert.match(result.event.record, /cleared organisation-wide/)
})

// ---- the risk gauge (O3) ---------------------------------------------------

test('the risk posture carries the metrics the gauge tiles render', () => {
  const m = riskPosture().metrics
  for (const key of ['valueProtected', 'itemsIntercepted', 'incidentsPrevented', 'confirmedLeaks', 'overrides']) {
    assert.equal(typeof m[key], 'number', `metrics.${key} must be a number`)
  }
  assert.equal(m.valueProtected, m.itemsIntercepted * VALUE_PER_MASKED_ITEM)
})

// The dashboard gauge and the downloaded report must never state two different
// scores for the same organisation at the same moment.
test('the gauge and the compliance report state the same score', () => {
  assert.equal(riskPosture().score, complianceReport().risk.score)
  assert.equal(riskPosture().band, complianceReport().risk.band)
})

// One detection, one number: the panel's row count is the factor's input, so
// the gauge can never disagree with the panel sitting under it.
test('the unreviewed-tools factor counts exactly what the panel shows', () => {
  const detail = () => riskPosture().factors.find(f => f.key === 'tools').detail

  const before = shadowAITools().length
  assert.ok(detail().includes(`${before} in use uncleared`))

  clearToolOrgWide('SummarizerX')
  const after = shadowAITools().length
  assert.equal(after, before - 1)
  assert.ok(detail().includes(`${after} in use uncleared`))
})

// ---- the AI writer ---------------------------------------------------------
//
// Everything above runs the offline path. This section runs the *other* one —
// the branch that only executes once somebody puts a real GEMINI_API_KEY in
// backend/.env, which means it is the branch nobody ever sees fail. If the
// request were malformed or the response parsed wrongly, the layer would
// degrade silently to the analyst and the key would look like the problem.
//
// The API is stubbed rather than called: these must pass on a laptop with no
// key, no network and no quota.

const realFetch = globalThis.fetch

/** Run `fn` with the Gemini API answering exactly `respond(url, options)`. */
async function withGemini(respond, fn) {
  process.env.GEMINI_API_KEY = 'test-key-not-a-real-one'
  globalThis.fetch = respond
  try {
    resetStore()
    resetSummaryCache()
    return await fn()
  } finally {
    globalThis.fetch = realFetch
    delete process.env.GEMINI_API_KEY
    resetSummaryCache()
  }
}

/** A Gemini success response carrying `text` as the model's answer. */
const answers = text => async () => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
})

const PARAGRAPH = 'The gateway checked every prompt this period and removed the personal data it found before any of it reached an assistant, which is the whole of what the organisation set out to prove. Governance moved with it rather than behind it.'

async function aiTest(name, fn) {
  await fn()
  passed++
  console.log(`  ✓ ${name}`)
}

await aiTest('a model answer is used, and labelled as the model\'s', async () => {
  const result = await withGemini(answers(PARAGRAPH), () => executiveSummary())
  assert.equal(result.source, 'gemini')
  assert.equal(result.summary, PARAGRAPH)
})

await aiTest('the request names the model and carries the figures, not the prompt text', async () => {
  let seen = null
  await withGemini(async (url, options) => {
    seen = { url, body: JSON.parse(options.body) }
    return (await answers(PARAGRAPH)())
  }, () => executiveSummary())

  assert.ok(seen.url.includes('generativelanguage.googleapis.com'))
  assert.ok(seen.url.includes(':generateContent'))
  assert.ok(seen.url.includes('key=test-key-not-a-real-one'))
  assert.equal(seen.body.contents[0].parts.length, 1)

  // The figures go up; nothing an employee typed ever does.
  const sent = seen.body.contents[0].parts[0].text
  assert.ok(sent.includes('4,120'), 'prompts protected')
  assert.ok(sent.includes('612'), 'items masked')
  assert.ok(sent.includes('Example Sdn Bhd'))
  assert.ok(sent.includes('Do not invent'), 'the no-invented-numbers instruction')
})

// A thinking model returns a "thought" part before the answer, so parts[0] is
// not always the prose. This is the exact bug layer2.js already carries a
// comment about — the summary path must not reintroduce it.
await aiTest('a thinking model\'s multi-part answer is joined, not truncated', async () => {
  const result = await withGemini(async () => ({
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [
        { text: 'Let me consider the figures. ' },
        { text: PARAGRAPH },
      ] } }],
    }),
  }), () => executiveSummary())

  assert.equal(result.source, 'gemini')
  assert.ok(result.summary.includes(PARAGRAPH))
})

// The prompt asks for plain prose. Models add markdown anyway, and a report
// with literal asterisks in the executive summary is not one you hand over.
await aiTest('markdown and line breaks are stripped out of the answer', async () => {
  const result = await withGemini(answers(`**Summary.**\n\n${PARAGRAPH}\n- a bullet it was told not to write`), () => executiveSummary())
  assert.ok(!/[*#`]/.test(result.summary))
  assert.ok(!result.summary.includes('\n'))
})

// Every failure below is one a free key produces in normal use: 429 on quota,
// 503 when overloaded, a dropped connection. None may reach the page.
for (const [label, respond] of [
  ['a 429 (quota exhausted)', async () => ({ ok: false, status: 429, json: async () => ({}) })],
  ['a 503 (model overloaded)', async () => ({ ok: false, status: 503, json: async () => ({}) })],
  ['a dropped connection', async () => { throw new Error('ECONNRESET') }],
  ['an unparseable body', async () => ({ ok: true, json: async () => { throw new Error('not json') } })],
  ['an empty candidate list', async () => ({ ok: true, json: async () => ({ candidates: [] }) })],
]) {
  await aiTest(`${label} falls back to the analyst, never to a blank summary`, async () => {
    const result = await withGemini(respond, () => executiveSummary())
    assert.equal(result.source, 'analyst')
    assert.ok(result.summary.length > 100)
  })
}

// An answer too short to be an executive summary is a failed generation, not a
// summary. Better the analyst's four sentences than the model's one word.
await aiTest('an implausibly short answer is refused', async () => {
  const result = await withGemini(answers('All good.'), () => executiveSummary())
  assert.equal(result.source, 'analyst')
})

// The placeholder that ships in .env.example must not be treated as a key —
// otherwise every install burns a request and an 8s timeout discovering it.
await aiTest('the .env.example placeholder is not mistaken for a key', async () => {
  let called = false
  process.env.GEMINI_API_KEY = 'your-gemini-key'
  globalThis.fetch = async () => { called = true; throw new Error('should never be called') }
  try {
    resetStore()
    resetSummaryCache()
    const result = await executiveSummary()
    assert.equal(called, false, 'no request may be made on the placeholder key')
    assert.equal(result.source, 'analyst')
  } finally {
    globalThis.fetch = realFetch
    delete process.env.GEMINI_API_KEY
    resetSummaryCache()
  }
})

// The button's whole purpose: with a key, clicking it must ask the model again.
await aiTest('regenerate asks the model again rather than replaying the answer', async () => {
  let calls = 0
  await withGemini(async () => {
    calls++
    return (await answers(`${PARAGRAPH} Revision ${calls}.`)())
  }, async () => {
    const first = await executiveSummary()
    const cached = await executiveSummary()
    const again = await executiveSummary({ refresh: true })

    assert.equal(calls, 2, 'one call, one cache hit, one forced regeneration')
    assert.equal(cached.summary, first.summary)
    assert.notEqual(again.summary, first.summary, 'a regeneration must produce new prose')
  })
})

resetStore()
console.log(`\n${passed} compliance report tests passed`)
