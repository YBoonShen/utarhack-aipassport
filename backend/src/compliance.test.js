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
import { resetStore, recordOverride, resolveAlert, decideVisa } from './store.js'
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

resetStore()
console.log(`\n${passed} compliance report tests passed`)
