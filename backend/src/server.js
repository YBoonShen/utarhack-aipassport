// AI Passport backend — Express API (Team Soda)
// The in-memory store (store.js) is the shared source of truth for the
// employee and admin UIs. Firebase (Auth + Firestore) replaces it once the
// team creates the Firebase project — see README "Firebase setup".

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { RULES } from './detector.js'
import { logDetection } from './firebase.js'
import { db, resetStore, recordPromptEvent, addNotification, completeTraining, applyForVisa, decideVisa } from './store.js'

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
  if (role === 'admin') {
    return res.json({ role: 'admin', id: 'AD-001', initials: 'AD', name: 'Admin', title: 'Compliance role' })
  }
  const p = db.profile
  res.json({ role: 'employee', id: p.id, initials: p.initials, name: p.name, title: `${p.dept} · Level ${p.level}` })
})

// ---- smart gateway ---------------------------------------------------------
app.post('/api/detect', async (req, res) => {
  const { prompt, tool } = req.body || {}
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return res.status(400).json({ error: 'Body must be { "prompt": "..." }' })
  }

  // Respect the admin's sensitive-data controls
  const c = db.settings.controls
  const enabledTypes = new Set([
    ...(c.personalIdentifiers ? ['IC', 'PASSPORT', 'PHONE', 'EMAIL'] : []),
    ...(c.customerRecords ? ['CARD'] : []),
    ...(c.financialFigures ? ['FINANCIAL'] : []),
    ...(c.sourceCode ? ['CREDENTIAL'] : []),
  ])
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
  const result = { masked, detections }

  const event = recordPromptEvent({ detections, masked, tool: tool || 'AI Assistant' })
  const audit = await logDetection({ detections, masked })
  res.json({ ...result, mode: db.settings.mode, explain: db.settings.experience, event: event.id, audit })
})

// ---- employee data ---------------------------------------------------------
app.get('/api/profile', (req, res) => res.json(db.profile))

app.post('/api/training/complete', (req, res) => res.json(completeTraining()))

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

// ---- admin data ------------------------------------------------------------
app.get('/api/audit', (req, res) => {
  res.json({ events: db.auditEvents, counters: { promptsToday: db.counters.promptsToday, maskedToday: db.counters.maskedToday } })
})

app.get('/api/stats', (req, res) => {
  res.json({
    promptsToday: db.counters.promptsToday,
    maskedToday: db.counters.maskedToday,
    openAlerts: 3,
    avgLicense: 2.1,
    pendingApprovals: db.visaRequests.filter(r => ['SECURITY REVIEW', 'COMPLIANCE'].includes(r.status)).length,
  })
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

// ---- demo helpers ----------------------------------------------------------
app.post('/api/reset', (req, res) => {
  resetStore()
  res.json({ ok: true })
})

const PORT = process.env.PORT || 5001
app.listen(PORT, () => {
  console.log(`AI Passport backend running on http://localhost:${PORT}`)
})
