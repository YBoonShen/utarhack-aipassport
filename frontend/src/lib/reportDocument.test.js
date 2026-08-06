// Compliance report document tests — run with `npm test` (backend).
//
// The download button produces a file that leaves the building, and clicking it
// is the only way to find out what is in it. That is what this file replaces:
// the template is built here from the *real* payload — complianceReport() on the
// backend, the same object the page fetches — so a section that silently stops
// being rendered, or a figure that stops reaching the export, fails here rather
// than inside somebody's Downloads folder.
import assert from 'node:assert/strict'
import { complianceReport, analystSummary } from '../../../backend/src/compliance.js'
import { resetStore, recordOverride } from '../../../backend/src/store.js'
import { reportHTML, evidenceCSV, reportFileName, periodLabel, kpiRows, esc } from './reportDocument.js'

let passed = 0
function test(name, fn) {
  resetStore()
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const TODAY = '07 Aug 2026'
const doc = () => {
  const report = complianceReport()
  return reportHTML(report, { summary: analystSummary(report), source: 'analyst' }, TODAY)
}

// ---- the document is complete ----------------------------------------------

test('every section of the report reaches the file', () => {
  const html = doc()
  for (const heading of [
    'Executive summary', 'Framework coverage', 'Period summary',
    'What is driving the risk score', 'Control mapping', 'Evidence - recent masked records',
  ]) {
    assert.ok(html.includes(`<h2>${heading}</h2>`), `missing section: ${heading}`)
  }
  assert.ok(html.startsWith('<!doctype html>'))
  assert.ok(html.trimEnd().endsWith('</html>'))
})

test('the header states the organisation, the period and the score', () => {
  const report = complianceReport()
  const html = doc()
  assert.ok(html.includes(report.org))
  assert.ok(html.includes('01 Jul 2026 – 19 Jul 2026'))
  assert.ok(html.includes(`${report.risk.score}/100 - ${report.risk.band}`))
  assert.ok(html.includes(`Generated ${TODAY}`))
})

// The bug this replaced: `period` is { from, to } on the wire, and the export
// printed "[object Object]" for it.
test('no object is stringified into the document', () => {
  assert.ok(!doc().includes('[object Object]'))
  assert.ok(!doc().includes('undefined'))
})

test('every metric card is a row in the period summary table', () => {
  const html = doc()
  for (const [value, label] of kpiRows(complianceReport())) {
    // esc() on both sides: "Tools reviewed & approved" is an ampersand in the
    // label and `&amp;` in the file, and only one of those is a bug.
    assert.ok(html.includes(`<td>${esc(label)}</td><td>${esc(value)}</td>`), `missing metric: ${label}`)
  }
})

test('every control mapping row reaches the file with its evidence', () => {
  const html = doc()
  for (const c of complianceReport().controls) {
    assert.ok(html.includes(esc(c.framework)), `missing control: ${c.type}`)
    assert.ok(html.includes(esc(c.evidence)), `missing evidence for: ${c.type}`)
  }
})

test('the evidence annexe carries every recent record', () => {
  const html = doc()
  const events = complianceReport().topEvents
  assert.ok(events.length > 0)
  for (const e of events) assert.ok(html.includes(esc(e.record)), `missing record: ${e.id}`)
})

// ---- the summary and its provenance ----------------------------------------

test('the executive summary is in the file, labelled with who wrote it', () => {
  const report = complianceReport()
  const written = reportHTML(report, { summary: 'A model wrote this.', source: 'gemini' }, TODAY)
  assert.ok(written.includes('A model wrote this.'))
  assert.ok(written.includes('Written by Gemini'))

  const fallback = reportHTML(report, { summary: 'The analyst wrote this.', source: 'analyst' }, TODAY)
  assert.ok(fallback.includes('Written by the governance analyst'))
  assert.ok(!fallback.includes('Written by Gemini'), 'the fallback must never claim to be AI-written')
})

// A summary that failed to generate must not leave a blank panel — that reads
// as the whole export having broken.
test('a missing summary says so rather than leaving a hole', () => {
  const html = reportHTML(complianceReport(), null, TODAY)
  assert.ok(html.includes('Not available at the time this report was generated'))
  assert.ok(html.includes('<h2>Framework coverage</h2>'), 'the rest of the report still renders')
})

// ---- the document reflects the log, not a fixed template -------------------

test('an override changes what the downloaded file says', () => {
  const before = doc()
  recordOverride({ prompt: 'send it anyway 880505-10-5566' })
  const after = doc()
  assert.notEqual(before, after)
  assert.ok(after.includes('Attention'), 'the PDPA row turns when data leaves')
})

// ---- untrusted strings ------------------------------------------------------

test('audit log text is escaped, never interpreted as markup', () => {
  const report = complianceReport()
  report.topEvents[0].record = '<script>alert(1)</script> & "quoted"'
  const html = reportHTML(report, { summary: 'x'.repeat(200), source: 'analyst' }, TODAY)
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
})

// ---- the CSV annexe ---------------------------------------------------------

test('the CSV has a header and one row per record', () => {
  const report = complianceReport()
  const csv = evidenceCSV(report)
  const lines = csv.split('\r\n')
  assert.equal(lines.length, report.topEvents.length + 1)
  assert.ok(lines[0].startsWith('﻿"Time"'), 'BOM first, so Excel reads it as UTF-8')
  assert.equal(lines[0].split(',').length, 8)
})

test('a quote inside a record cannot break the CSV apart', () => {
  const report = complianceReport()
  report.topEvents = [{ time: '1', user: '2', dept: '3', tool: '4', action: '5', control: '6', risk: '7', record: 'he said "hi", then left' }]
  const row = evidenceCSV(report).split('\r\n')[1]
  assert.ok(row.endsWith('"he said ""hi"", then left"'))
})

// ---- odds and ends ----------------------------------------------------------

test('the file name is dated', () => {
  assert.equal(
    reportFileName('html', new Date('2026-08-07T09:00:00Z')),
    'aipassport-compliance-report-2026-08-07.html'
  )
  assert.ok(reportFileName('csv').endsWith('.csv'))
})

test('the period label degrades rather than throwing before the fetch lands', () => {
  assert.equal(periodLabel(null), 'loading')
  assert.equal(periodLabel({}), 'loading')
  assert.deepEqual(kpiRows(null), [])
})

resetStore()
console.log(`\n${passed} report document tests passed`)
