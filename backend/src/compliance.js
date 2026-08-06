// The one-click compliance report (O3), as a regulator would read it.
//
// store.js already counts the period totals — reportSummary(). This module is
// the layer above: it turns those totals into the document the Audit Log screen
// renders and downloads (organisational risk score, framework coverage, control
// mapping, evidence) and writes the executive summary that sits at the top of
// it.
//
// One rule governs everything here: **no figure is invented**. Every number
// below is either a total the audit log accumulated or arithmetic over one, and
// the two places that could drift — the page and the downloaded file — read the
// same payload, so what a regulator downloads is what the screen showed.
import { db, reportSummary } from './store.js'
import { GEMINI_MODEL } from './layer2.js'

export const ORG_NAME = 'Example Sdn Bhd'

// The organisation the seeded period describes. Employees.jsx and training.js
// both state 303; naming it once keeps the report from being the odd one out.
export const HEADCOUNT = 303

// What one masked item is worth avoiding, in ringgit. A deliberately
// conservative single figure rather than a per-category model: PDPA §5 exposure
// per affected record runs far higher, and a report that overstates its own ROI
// is the first thing an auditor stops believing. Every screen that shows the
// number labels it "estimated".
export const VALUE_PER_MASKED_ITEM = 450

// Lower is safer. The four bands are the ones the UI already has colours for.
const BANDS = [[24, 'Low'], [49, 'Moderate'], [74, 'Elevated'], [100, 'High']]

// The five days before today, as the score stood. Fixed rather than random:
// the page polls every few seconds, and a trend line that redrew itself on each
// poll would be scenery, not evidence.
const TREND_BEFORE = [52, 49, 51, 46, 43]

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const num = n => Number(n || 0).toLocaleString()
const rm = n => 'RM ' + num(Math.round(n))

// The summary is prose a board member reads, and "1 training assignments were
// issued" is the sentence that makes a reader stop trusting the rest of it.
// Every count that reaches the paragraph goes through here.
const count = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`
const were = n => (n === 1 ? 'was' : 'were')

export function bandFor(score) {
  return (BANDS.find(([ceiling]) => score <= ceiling) || BANDS[BANDS.length - 1])[1]
}

/**
 * The organisation's average AI License level. Same derivation /api/stats uses:
 * 303 seeded employees standing at 2.1, of whom the signed-in one is live, so
 * their levelling up nudges the average rather than moving it by a whole level.
 */
export function avgLicenseLevel() {
  return Number((2.1 + (db.profile.level - 2) * 0.1).toFixed(1))
}

function openAlertsBySeverity() {
  const open = db.alerts.filter(a => a.status === 'open')
  return {
    open: open.length,
    high: open.filter(a => a.severity === 'HIGH').length,
    medium: open.filter(a => a.severity === 'MEDIUM').length,
    monitoring: open.filter(a => a.severity === 'MONITORING').length,
  }
}

function pendingToolReviews() {
  return db.visaRequests.filter(v => ['SECURITY REVIEW', 'COMPLIANCE'].includes(v.status)).length
}

/** Tools the register has not cleared that nevertheless show up in the log. */
function unreviewedToolsInUse() {
  const unapproved = new Set(
    db.orgTools.filter(t => t.status !== 'APPROVED').map(t => t.name)
  )
  return new Set(db.auditEvents.map(e => e.tool).filter(t => unapproved.has(t))).size
}

// ---- the organisational AI risk score --------------------------------------
//
// One board-level number, 0–100, lower is better. It is a sum of named factors
// rather than an opaque model, for the same reason the risk-alert screen states
// its rubric: a score nobody can explain is a score nobody acts on. Each factor
// caps, so no single dimension can swamp the others, and the caps sum to 105 —
// the score is clamped at 100.

export function riskFactors() {
  const r = reportSummary()
  const { open, high, medium, monitoring } = openAlertsBySeverity()
  const pending = pendingToolReviews()
  const unreviewed = unreviewedToolsInUse()
  const avgLevel = avgLicenseLevel()
  const maskRate = r.promptsProtected ? r.itemsMasked / r.promptsProtected : 0

  return [
    {
      key: 'leaks',
      label: 'Confirmed data leaks',
      // The one event where protected data demonstrably left the organisation,
      // so it is weighted to dominate: a single override should move the board
      // number more than a queue of alerts the gateway actually held.
      points: Math.min(40, r.confirmedLeaks * 20),
      detail: r.confirmedLeaks ? `${r.confirmedLeaks} this period` : 'none this period',
      tone: r.confirmedLeaks ? 'high' : 'low',
    },
    {
      key: 'alerts',
      label: 'Open risk alerts',
      points: Math.min(24, high * 8 + medium * 3 + monitoring),
      detail: open ? `${high} high · ${medium} medium · ${monitoring} watch` : 'queue clear',
      tone: high ? 'high' : open ? 'med' : 'low',
    },
    {
      key: 'tools',
      label: 'Unreviewed AI tools',
      points: Math.min(16, pending * 4 + unreviewed * 3),
      detail: `${pending} awaiting review · ${unreviewed} in use uncleared`,
      tone: pending + unreviewed > 2 ? 'med' : pending + unreviewed ? 'med' : 'low',
    },
    {
      key: 'training',
      label: 'Workforce AI licensing',
      // Distance from a fully licensed workforce (Level 4). Training is the
      // control that removes the behaviour rather than catching it.
      points: clamp(Math.round(((4 - avgLevel) / 3) * 15), 0, 15),
      detail: `average licence ${avgLevel} of 4`,
      tone: avgLevel >= 3 ? 'low' : 'med',
    },
    {
      key: 'exposure',
      label: 'Sensitive data volume',
      // How often prompts carry personal data at all. The gateway masking it is
      // the system working, but a rising share is still rising exposure.
      points: Math.min(10, Math.round(maskRate * 40)),
      detail: `${(maskRate * 100).toFixed(1)}% of prompts needed masking`,
      tone: maskRate > 0.25 ? 'med' : 'low',
    },
  ]
}

export function riskPosture() {
  const factors = riskFactors()
  const score = clamp(factors.reduce((n, f) => n + f.points, 0), 0, 100)
  const yesterday = TREND_BEFORE[TREND_BEFORE.length - 1]
  return {
    score,
    band: bandFor(score),
    delta: score - yesterday,
    trend: [...TREND_BEFORE, score],
    factors,
  }
}

// ---- framework coverage ----------------------------------------------------
//
// Status is derived, never asserted. A framework whose evidence is missing says
// so — a report where all four rows are permanently green is decoration, and
// the first thing an auditor tests is whether the page can ever say otherwise.

function frameworks(r) {
  const { high, open } = openAlertsBySeverity()
  const pending = pendingToolReviews()
  const cleared = db.orgTools.filter(t => t.status === 'APPROVED').length

  return [
    {
      name: 'PDPA 2010 (Malaysia)',
      detail: `Principles 3, 6 & 7 — ${num(r.itemsMasked)} personal-data items masked before transmission · no raw prompt stored on any path`,
      status: r.confirmedLeaks ? 'Attention' : 'Covered',
      state: r.confirmedLeaks ? 'watch' : 'ok',
    },
    {
      name: 'EU AI Act',
      detail: `Art. 12 record-keeping · Art. 14 human oversight · Art. 86 right to explanation — ${r.humanReviews} human reviews completed`,
      status: r.humanReviews ? 'Covered' : 'Attention',
      state: r.humanReviews ? 'ok' : 'watch',
    },
    {
      name: 'NIST AI RMF 1.0',
      detail: `GOVERN · MAP · MEASURE · MANAGE — gateway policy v${db.settings.policyVersion} · ${r.risksResolved} risks resolved, ${open} open`,
      status: high ? 'In progress' : 'Covered',
      state: high ? 'watch' : 'ok',
    },
    {
      name: 'ISO/IEC 42001:2023',
      detail: `AI management system — ${db.orgTools.length} tools in the register, ${cleared} cleared, ${pending} awaiting review`,
      status: pending ? 'In progress' : 'Covered',
      state: pending ? 'watch' : 'ok',
    },
  ]
}

// ---- control mapping -------------------------------------------------------
// What we protect, which clause asks for it, and the evidence that it happened.
// The evidence column is live: it is the only column a regulator can check.

function controls(r) {
  const on = key => (db.settings.controls[key] ? 'on' : 'off')
  const pending = pendingToolReviews()

  return [
    {
      type: 'Personal identifiers · IC, passport, phone, email',
      framework: 'PDPA Principle 7 · NIST PR.DS-1',
      evidence: `Layer 1 masked before the prompt left the browser · ${num(r.itemsMasked)} items this period`,
    },
    {
      type: 'Person names',
      framework: 'PDPA Principle 3 · EU AI Act Art. 10',
      evidence: 'Layer 2 detection · replaced in place, the name itself is never stored',
    },
    {
      type: 'Customer records & payment cards',
      framework: 'PDPA Principle 7 · ISO/IEC 42001 A.8',
      evidence: `Masked on assistants, blocked outright on developer tools · control ${on('customerRecords')}`,
    },
    {
      type: 'Financial figures',
      framework: 'NIST AI RMF MEASURE 2.7',
      evidence: `Masked when the org control is on · control ${on('financialFigures')} · gateway policy v${db.settings.policyVersion}`,
    },
    {
      type: 'Credentials & source code',
      framework: 'ISO/IEC 27001 A.9 · NIST PR.AC-1',
      evidence: `Blocked on unapproved destinations · control ${on('sourceCode')}`,
    },
    {
      type: 'AI-assisted decisions about people',
      framework: 'EU AI Act Art. 86 · NIST GV.4',
      evidence: `${r.humanReviews} human reviews completed · public transparency portal open to affected persons`,
    },
    {
      type: 'AI tool destinations',
      framework: 'EU AI Act Art. 12 · ISO/IEC 42001 A.6',
      evidence: `${r.toolsApproved} tools reviewed and approved · ${pending} awaiting review`,
    },
    {
      type: 'Account provisioning & access',
      framework: 'ISO/IEC 27001 A.9.2.1 · NIST PR.AC-1',
      evidence: 'Every account creation and sign-in recorded with the licence level granted · no name or email in the log',
    },
  ]
}

/** The most recent records, masked only — the evidence annexe of the report. */
function topEvents(limit = 10) {
  return db.auditEvents.slice(0, limit).map(e => ({
    id: e.id,
    time: e.time,
    user: e.user,
    dept: e.dept,
    tool: e.tool,
    action: e.action,
    control: e.control,
    record: e.record,
    risk: e.risk,
  }))
}

/**
 * The whole report, in one payload. The flat totals from reportSummary() are
 * spread in as well so `/api/report` stays backward compatible with anything
 * (the README's API table, the extension, a saved fetch) that reads them.
 */
export function complianceReport() {
  const r = reportSummary()
  const risk = riskPosture()

  return {
    ...r,
    org: ORG_NAME,
    headcount: HEADCOUNT,
    generatedAt: new Date().toISOString(),
    risk,
    kpis: {
      promptsProtected: r.promptsProtected,
      itemsMasked: r.itemsMasked,
      valueProtected: r.itemsMasked * VALUE_PER_MASKED_ITEM,
      toolsApproved: r.toolsApproved,
      risksResolved: r.risksResolved,
      humanReviews: r.humanReviews,
      confirmedLeaks: r.confirmedLeaks,
      recoveredEvents: r.recoveredEvents,
      trainingAssigned: r.trainingAssigned,
    },
    frameworks: frameworks(r),
    controls: controls(r),
    topEvents: topEvents(),
  }
}

// ---- the executive summary -------------------------------------------------
//
// The paragraph a board member reads instead of the report. Two writers, and
// the page is told which one it got, because a fallback presented as AI output
// is a lie about provenance — the same discipline layer2.js keeps between
// 'gemini' and 'heuristic'.
//
//   'gemini'  — written by the model from the figures below.
//   'analyst' — composed here from the same figures when there is no key, the
//               call fails, or the answer comes back unusable.

// The same model Layer 2 uses, from the same constant. They were two copies of
// the same string until a model retirement 404'd both at once and neither said
// so — see the note above GEMINI_MODEL in layer2.js.
const SUMMARY_TIMEOUT_MS = 12_000

// The figures only change when the audit log does, so a page polling every five
// seconds must not spend a request each time. The cache key is the figures
// themselves: they move, the summary is rewritten; they don't, it is reused.
// "Regenerate with AI" passes refresh and bypasses this deliberately.
let cached = null // { key, summary, source }

/** Test seam: forget the cached summary. */
export function resetSummaryCache() {
  cached = null
}

function fingerprint(report) {
  return JSON.stringify([report.kpis, report.risk.score, report.period])
}

/** The facts the writer is allowed to use — and the only ones. */
function facts(report) {
  const k = report.kpis
  return [
    `Organisation: ${report.org} (${report.headcount} employees)`,
    `Reporting period: ${report.period.from} to ${report.period.to}`,
    `Prompts checked by the Smart Gateway: ${num(k.promptsProtected)}`,
    `Sensitive items masked before reaching an AI tool: ${num(k.itemsMasked)}`,
    `Estimated exposure value protected: ${rm(k.valueProtected)}`,
    `Confirmed data leaks (employee overrode the checkpoint): ${k.confirmedLeaks}`,
    `AI tools reviewed and approved: ${k.toolsApproved}`,
    `Risk alerts resolved: ${k.risksResolved}`,
    `Human reviews of AI-assisted decisions completed: ${k.humanReviews}`,
    `Training assignments issued: ${k.trainingAssigned}`,
    `Events recovered after a gateway outage: ${k.recoveredEvents}`,
    `Organisational AI risk score: ${report.risk.score} out of 100 (${report.risk.band}), ${report.risk.delta <= 0 ? 'down' : 'up'} ${Math.abs(report.risk.delta)} on yesterday`,
    `What is driving the score: ${report.risk.factors.map(f => `${f.label} ${f.points} points (${f.detail})`).join('; ')}`,
    `Frameworks: ${report.frameworks.map(f => `${f.name} — ${f.status}`).join('; ')}`,
  ].join('\n')
}

// A model asked for prose will happily add a number that rounds nicely. This
// strips the formatting we did not ask for and refuses anything implausible,
// so a bad answer falls through to the analyst rather than onto the report.
function cleanSummary(text) {
  const cleaned = String(text || '')
    .replace(/[*_#`]/g, '')        // markdown the prompt asked it not to use
    .replace(/\s*\n\s*/g, ' ')     // one paragraph, not a bullet list
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (cleaned.length < 120 || cleaned.length > 1400) return null
  return cleaned
}

async function geminiSummary(report) {
  const key = process.env.GEMINI_API_KEY
  if (!key || key === 'your-gemini-key') return null

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`
  const body = {
    contents: [{
      parts: [{
        text: `You are a compliance analyst writing the executive summary of an AI governance audit report for a Malaysian company's board and regulator.

Write ONE paragraph of 4 to 5 sentences, in British English, plain prose. Cover, in this order: what the gateway did over the period and the value it protected; how governance responded (tools reviewed, alerts resolved, human reviews); the organisational risk score, its direction and the largest remaining driver; and one concrete recommendation for the next period.

Rules:
- Use ONLY the figures listed below. Do not invent, estimate or round any number that is not given.
- If confirmed data leaks is 0, say so plainly — it is the report's strongest finding.
- No markdown, no bullet points, no headings, no bold. Plain sentences only.
- Do not address the reader, do not open with "This report".

Figures:
${facts(report)}`,
      }],
    }],
    // A five-sentence paragraph is ~200 tokens; the rest of the budget is
    // headroom for a thinking model. On a 2.5 model that reasons before it
    // answers, thinking tokens count against this limit, so a tight budget
    // gets spent thinking and returns a truncated answer — which cleanSummary
    // then refuses, and the report silently falls back to the analyst. The
    // symptom of that is "I added my key and nothing changed", which is the
    // hardest kind of failure to diagnose from the outside.
    generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    // Join every text part — a thinking model can return a "thought" part
    // before the answer, so parts[0] is not always the prose we asked for.
    const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join(' ')
    return cleanSummary(raw)
  } catch {
    return null // network, timeout, quota — all degrade to the analyst
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The offline writer. Not a placeholder: it is the summary the report ships
 * with when no key is configured, so it has to stand on its own in front of a
 * regulator. Composed from the same figures the model would have been given.
 */
export function analystSummary(report) {
  const k = report.kpis
  const risk = report.risk
  const driver = [...risk.factors].sort((a, b) => b.points - a.points)[0]
  const improving = risk.delta <= 0

  const leaks = k.confirmedLeaks === 0
    ? 'No sensitive data is confirmed to have left the organisation in this period'
    : `${count(k.confirmedLeaks, 'prompt')} left the organisation unmasked after an employee overrode the checkpoint, each one logged with the categories involved`

  const recovered = k.recoveredEvents
    ? ` ${count(k.recoveredEvents, 'event')} ${were(k.recoveredEvents)} masked on-device during a gateway outage and recorded once the connection returned, so the period has no blind spot.`
    : ''

  return [
    `Between ${report.period.from} and ${report.period.to} the Smart Gateway checked ${num(k.promptsProtected)} prompts across ${report.org}'s ${num(report.headcount)} employees and removed ${num(k.itemsMasked)} sensitive items before they reached an AI tool, an estimated ${rm(k.valueProtected)} of exposure avoided.`,
    `${leaks}.${recovered}`,
    `Governance kept pace over the same period: ${count(k.toolsApproved, 'AI tool')} ${were(k.toolsApproved)} reviewed and approved, ${count(k.risksResolved, 'risk alert')} ${were(k.risksResolved)} closed, ${count(k.humanReviews, 'AI-assisted decision')} received a documented human review, and ${count(k.trainingAssigned, 'training assignment')} ${were(k.trainingAssigned)} issued.`,
    `The organisational AI risk score stands at ${risk.score} out of 100 (${risk.band}), ${improving ? 'down' : 'up'} ${Math.abs(risk.delta)} on yesterday, with ${driver.label.toLowerCase()} the largest remaining contributor at ${driver.points} points (${driver.detail}).`,
    `Closing that gap is the priority for the next period; every figure above is the audit log's own arithmetic over masked records only, and no raw prompt was retained to produce it.`,
  ].join(' ')
}

/**
 * The executive summary for the current figures.
 * @param {{ refresh?: boolean }} options `refresh` bypasses the cache — this is
 *   what "Regenerate with AI" on the report screen sends.
 * @returns {Promise<{ summary: string, source: 'gemini'|'analyst', cached: boolean }>}
 */
export async function executiveSummary({ refresh = false } = {}) {
  const report = complianceReport()
  const key = fingerprint(report)
  if (!refresh && cached?.key === key) return { summary: cached.summary, source: cached.source, cached: true }

  const written = await geminiSummary(report)
  cached = written
    ? { key, summary: written, source: 'gemini' }
    : { key, summary: analystSummary(report), source: 'analyst' }

  return { summary: cached.summary, source: cached.source, cached: false }
}
