// AI Passport backend — Express API (Team Soda)
// The in-memory store (store.js) is the shared source of truth for the
// employee and admin UIs. Firebase (Auth + Firestore) replaces it once the
// team creates the Firebase project — see README "Firebase setup".

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { RULES } from './detector.js'
import { detectNames, maskNames } from './layer2.js'
import { logDetection } from './firebase.js'
import {
  db, resetStore, recordPromptEvent, recordOfflineEvent, recordOverride, addNotification,
  answerQuiz, quizResults, completeTraining, retryTraining, applyForVisa, decideVisa,
  suspendToolOrgWide, openAlerts, resolveAlert, addReviewRequest, leaderboard, progressionSummary,
  reportSummary,
} from './store.js'
import { LEVELS } from './levels.js'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'aipassport-backend', time: new Date().toISOString() })
})

// ---- auth (demo) -----------------------------------------------------------
// Real deployment: Firebase Authentication with role claims. For the demo we
// hand back the selected role's identity; the frontend stores it locally.
app.post('/api/auth/login', (req, res) => {
  const { role } = req.body || {}
  const p = db.profile
  const user = role === 'admin'
    ? { role: 'admin', id: 'AD-001', initials: 'AD', name: 'Admin', title: 'Compliance role' }
    : { role: 'employee', id: p.id, initials: p.initials, name: p.name, title: `${p.dept} · Level ${p.level}` }
  // Recorded here so every client of this backend agrees on who is signed in —
  // the web app and the Chrome extension are different origins and cannot share
  // localStorage, so the session has to live somewhere both of them can reach.
  db.session = user
  res.json(user)
})

// Read by the extension popup on every open, so the sidebar restores the same
// employee the dashboard is signed in as. Returns { user: null } when signed out.
app.get('/api/auth/session', (req, res) => res.json({ user: db.session }))

app.post('/api/auth/logout', (req, res) => {
  db.session = null
  res.json({ ok: true })
})

// ---- smart gateway ---------------------------------------------------------
// `preview: true` runs the exact same detection but records nothing. The Chrome
// extension uses it for the debounced while-typing check, then calls again
// without the flag when the employee actually protects and sends — so one sent
// prompt still produces exactly one audit event, same as the web Gateway.
// The detection pipeline itself, with no HTTP and no recording: both /api/detect
// and /api/detect/backfill run exactly this, so a prompt that was masked
// on-device during an outage is scanned by the same rules, the same admin
// controls and the same Layer 2 when it finally reaches the gateway.
async function runDetection(prompt) {
  // Respect the admin's sensitive-data controls
  const c = db.settings.controls
  // Every rule in detector.js must appear under exactly one control, otherwise
  // it can never run — CUSTOMER_RECORD and SECRET were previously unreachable.
  // The grouping matches the labels the Settings screen already shows:
  // "Customer records — accounts, cases and transactions" and
  // "Source code — internal repositories and secrets".
  const enabledTypes = new Set([
    ...(c.personalIdentifiers ? ['IC', 'PASSPORT', 'PHONE', 'EMAIL'] : []),
    ...(c.customerRecords ? ['CARD', 'CUSTOMER_RECORD'] : []),
    ...(c.financialFigures ? ['FINANCIAL'] : []),
    ...(c.sourceCode ? ['CREDENTIAL', 'SECRET'] : []),
  ])
  // Layer 1 — rule-based regex, filtered by the admin's controls
  const detections = []
  let masked = prompt
  for (const rule of RULES) {
    if (!enabledTypes.has(rule.type)) continue
    const matches = masked.match(rule.regex)
    if (matches && matches.length > 0) {
      detections.push({ type: rule.type, count: matches.length })
      masked = masked.replace(rule.regex, rule.token)
    }
  }

  // Layer 2 — person names via Gemini (heuristic fallback when offline).
  // Layer 2 sees the Layer-1-masked text, never the raw prompt: whatever Layer 1
  // already caught (IC, card, phone…) must not leave the gateway in cleartext,
  // and names are untouched by Layer 1 so detection is unaffected.
  let layer2 = 'none'
  if (c.personalIdentifiers) {
    const { names, source } = await detectNames(masked)
    const result2 = maskNames(masked, names)
    if (result2.count > 0) {
      masked = result2.masked
      detections.push({ type: 'NAME', count: result2.count })
      layer2 = source
    }
  }

  return { masked, detections, layer2 }
}

app.post('/api/detect', async (req, res) => {
  const { prompt, tool, preview } = req.body || {}
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return res.status(400).json({ error: 'Body must be { "prompt": "..." }' })
  }

  const { masked, detections, layer2 } = await runDetection(prompt)

  // Preview = while-typing check: same result, no audit event, no counters, no
  // points. Only the masked/detection outcome is returned.
  if (preview) {
    return res.json({
      masked, detections, layer2, levelUp: false, preview: true,
      mode: db.settings.mode, explain: db.settings.experience,
    })
  }

  const { event, levelUp } = recordPromptEvent({ detections, masked, tool: tool || 'AI Assistant' })
  const audit = await logDetection({ detections, masked })
  res.json({
    masked, detections, layer2, levelUp,
    mode: db.settings.mode, explain: db.settings.experience, event: event.id, audit,
  })
})

// Offline events coming back from the extension's queue.
//
// While the gateway is unreachable the extension masks with its local Layer 1
// copy and sends anyway — protection never depends on this service being up.
// What used to be lost is the *record*: an outage silently took prompts out of
// the audit log, so the admin's totals under-reported by however long the
// backend was down. The extension now keeps those events and posts them here.
//
// Two properties matter. The text arriving here is the already-masked version,
// never the raw prompt — an outage must not turn into a queue of sensitive data
// waiting in browser storage. And it is scanned again by the full pipeline, so
// Layer 2 (which could not run on-device) still gets its pass; the tokens Layer
// 1 already wrote survive a re-scan unchanged.
app.post('/api/detect/backfill', async (req, res) => {
  const { events } = req.body || {}
  if (!Array.isArray(events)) {
    return res.status(400).json({ error: 'Body must be { "events": [...] }' })
  }

  const accepted = []
  const duplicates = []
  // Bounded: one flush cannot be used to inject an unlimited number of events.
  for (const e of events.slice(0, 50)) {
    if (!e || typeof e.id !== 'string' || typeof e.prompt !== 'string' || !e.prompt) continue
    const { masked, detections } = await runDetection(e.prompt)
    const recorded = recordOfflineEvent({
      id: e.id, detections, masked, tool: e.tool || 'AI Assistant', at: e.at,
    })
    ;(recorded ? accepted : duplicates).push(e.id)
  }
  res.json({ accepted, duplicates, recovered: db.report.recoveredEvents })
})

// Warn-only mode: employee insists on sending the original — penalised + logged
app.post('/api/gateway/override', (req, res) => {
  const { prompt } = req.body || {}
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return res.status(400).json({ error: 'Body must be { "prompt": "..." }' })
  }
  res.json(recordOverride({ prompt }))
})

// ---- employee data ---------------------------------------------------------
app.get('/api/profile', (req, res) => res.json({ ...db.profile, safety: safetyScore() }))

app.get('/api/leaderboard', (req, res) => res.json(leaderboard()))

// The employee's XP / level progression, plus the level table the UI labels
// bands with. Admin reads the same record — one source of truth for both sides.
app.get('/api/progression', (req, res) => res.json({ levels: LEVELS, ...progressionSummary() }))

// Quiz: an answer is recorded (first attempt per question only) but earns no XP
// on its own — XP is settled once, when the assessment is evaluated.
app.post('/api/quiz/answer', (req, res) => {
  const { module, question, correct } = req.body || {}
  res.json(answerQuiz(Number(module) || 1, Number(question), Boolean(correct)))
})
app.get('/api/quiz/results', (req, res) => res.json(quizResults(Number(req.query.module) || 1)))

app.post('/api/training/complete', (req, res) => {
  const { module } = req.body || {}
  res.json(completeTraining(Number(module) || 1))
})

// Retry is only offered after the whole assessment has been evaluated, and only
// once the 24h lock has expired — 423 while it is still locked.
app.post('/api/quiz/retry', (req, res) => {
  const { module } = req.body || {}
  const result = retryTraining(Number(module) || 1)
  res.status(result.ok ? 200 : 423).json(result)
})

app.get('/api/notifications', (req, res) => res.json(db.notifications))
app.post('/api/notifications/:id/read', (req, res) => {
  const n = db.notifications.find(x => x.id === req.params.id)
  if (n) n.read = true
  res.json(n || {})
})
app.post('/api/notifications/:id/delete', (req, res) => {
  const n = db.notifications.find(x => x.id === req.params.id)
  if (n) n.deleted = true
  res.json(n || {})
})
app.post('/api/notifications/:id/restore', (req, res) => {
  const n = db.notifications.find(x => x.id === req.params.id)
  if (n) n.deleted = false
  res.json(n || {})
})

// ---- visas / tool approvals ------------------------------------------------
app.get('/api/visas', (req, res) => res.json(db.visaRequests))
app.post('/api/visas/apply', (req, res) => res.json(applyForVisa(req.body || {})))
app.post('/api/visas/:id/decision', (req, res) => {
  const { decision, note } = req.body || {}
  const request = decideVisa(req.params.id, decision, note)
  if (!request) return res.status(404).json({ error: 'Request not found' })
  res.json(request)
})

// Org-wide tool status (Tool Approvals' vendor security card). Suspending is an
// admin action: it updates the tool here, writes one audit event and notifies
// employees — 409 if the tool is already suspended, so a repeat click is a no-op.
app.get('/api/tools', (req, res) => res.json(db.orgTools))
app.post('/api/tools/suspend', (req, res) => {
  const { tool } = req.body || {}
  const result = suspendToolOrgWide(tool)
  if (!result.ok) return res.status(result.reason === 'not_found' ? 404 : 409).json(result)
  res.json(result)
})

// ---- admin data ------------------------------------------------------------
app.get('/api/audit', (req, res) => {
  res.json({ events: db.auditEvents, counters: { promptsToday: db.counters.promptsToday, maskedToday: db.counters.maskedToday } })
})

app.get('/api/stats', (req, res) => {
  res.json({
    promptsToday: db.counters.promptsToday,
    maskedToday: db.counters.maskedToday,
    openAlerts: openAlerts().length,
    // Org-wide average across the 303 seeded employees, of whom exactly one —
    // the demo employee — is live. 2.1 is that population's standing average at
    // their seeded Level 2; their levelling up nudges it, which is the only part
    // this demo can honestly move. The Employees screen prints the same figure.
    avgLicense: Number((2.1 + (db.profile.level - 2) * 0.1).toFixed(1)),
    pendingApprovals: db.visaRequests.filter(r => ['SECURITY REVIEW', 'COMPLIANCE'].includes(r.status)).length,
    // Events masked on-device during a gateway outage and recorded afterwards.
    // Surfaced so the admin can tell a quiet period from an unrecorded one.
    recoveredEvents: db.report.recoveredEvents,
  })
})

// One-click compliance report (O3). The numbers live here, not in the page, so
// what a regulator downloads is what the audit log holds.
app.get('/api/report', (req, res) => res.json(reportSummary()))

// ---- risk alerts ----
app.get('/api/alerts', (req, res) => res.json(db.alerts))
app.post('/api/alerts/:id/resolve', (req, res) => res.json(resolveAlert(req.params.id)))

// Public transparency portal: affected person requests a human review
app.post('/api/review-request', (req, res) => {
  const { ref } = req.body || {}
  res.json(addReviewRequest(ref || 'REF-DEMO-2026-041'))
})

app.get('/api/settings', (req, res) => res.json(db.settings))
app.put('/api/settings', (req, res) => {
  const { mode, controls, experience, escalate } = req.body || {}
  if (mode) db.settings.mode = mode
  if (controls) db.settings.controls = { ...db.settings.controls, ...controls }
  if (experience) db.settings.experience = { ...db.settings.experience, ...experience }
  if (typeof escalate === 'boolean') db.settings.escalate = escalate
  db.settings.policyVersion += 1
  addNotification({
    category: 'SMART GATEWAY',
    title: 'Protection policy updated',
    body: `Gateway policy v${db.settings.policyVersion} is now active for all employees.`,
    what: `An admin updated the Smart Gateway protection policy. Mode: ${db.settings.mode}. The change was recorded in the audit log.`,
    facts: [
      ['Policy version', `v${db.settings.policyVersion}`],
      ['Protection mode', db.settings.mode],
      ['Effective', 'Immediately'],
      ['Changed by', 'Admin · Compliance role'],
      ['Audit', 'Recorded'],
    ],
  })
  res.json(db.settings)
})

// ---- organisational risk score + ROI (quantified governance) ---------------
app.get('/api/risk', (req, res) => res.json(riskScore()))

// ---- governance copilot (explainability assistant) -------------------------
app.get('/api/copilot/suggestions', (req, res) => res.json({ suggestions: SUGGESTED_QUESTIONS }))
app.post('/api/copilot', async (req, res) => {
  const { question } = req.body || {}
  res.json(await askCopilot(question))
})

// ---- one-click AI compliance report ----------------------------------------
app.get('/api/report', (req, res) => res.json(reportData()))
app.get('/api/report/summary', async (req, res) => res.json(await executiveSummary()))

// ---- live demo simulator (pitch mode) --------------------------------------
let simTimer = null
app.get('/api/simulate', (req, res) => res.json({ on: sim.on, injected: sim.injected }))
app.post('/api/simulate', (req, res) => {
  const { on } = req.body || {}
  const next = typeof on === 'boolean' ? on : !sim.on
  sim.on = next
  if (simTimer) { clearInterval(simTimer); simTimer = null }
  if (next) simTimer = setInterval(simulateTick, 2500)
  res.json({ on: sim.on, injected: sim.injected })
})

// ---- demo helpers ----------------------------------------------------------
app.post('/api/reset', (req, res) => {
  if (simTimer) { clearInterval(simTimer); simTimer = null }
  sim.on = false
  resetStore()
  res.json({ ok: true })
})

const PORT = process.env.PORT || 5001
app.listen(PORT, () => {
  console.log(`AI Passport backend running on http://localhost:${PORT}`)
})
