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
  db, resetStore, recordPromptEvent, recordOfflineEvent, recordOverride, recordAudit, recordSession,
  answerQuiz, quizResults, completeTraining, retryTraining, applyForVisa, decideVisa,
  suspendToolOrgWide, recordToolUse, toolStatus, openAlerts, alertsView, resolveAlert,
  recordModelUse, recordBlockedAttempt, gatewayPolicyFor, toolForHost, setModelStatus,
  toolRegister, toolAccessFor, toolModelsFor, freeModelFor, requestableTools, REQUEST_MIN_LEVEL,
  addReviewRequest, leaderboard, progressionSummary,
  allProgressionSummaries, reportSummary, updateSettings,
  setSessionEmployee, notificationsFor, updateNotification, activityFor, publicProfile,
  libraryForAdmin, moduleById, publicModule, createModule, updateModule, setModuleStatus,
  modulesForEmployee, canAccessModule, assignTraining, assignmentRecords, assignmentsForEmployee,
  MAX_QUESTIONS,
} from './store.js'
import { LEVELS } from './levels.js'
import { MODES, ORG_MODES } from './risk.js'
import { DEPARTMENTS, EMPLOYEES, DEFAULT_EMPLOYEE_ID, employeeById, employeeIdFromEmail } from './directory.js'

const app = express()
app.use(cors())
app.use(express.json())

// ---- who is asking ---------------------------------------------------------
// The demo has no token to verify, so the browser states its identity on every
// request (lib/api.js sets these headers from its stored session) and the server
// validates it against the directory before believing any of it. Two things
// matter: an unknown employee id is refused rather than trusted, and the id is
// taken from the request rather than from `db.session` — otherwise an admin
// signing in from a second window would silently redirect the employee's own
// inbox and training list to whoever logged in last.
//
// This is the seam Firebase Auth replaces: same shape, a verified ID token
// instead of a header.
function actorOf(req) {
  const role = req.get('x-aip-role')
  const claimed = String(req.get('x-aip-user') || '').trim()
  if (role === 'admin') return { role: 'admin', id: 'AD-001' }
  if (employeeById(claimed)) return { role: 'employee', id: claimed }
  if (role === 'employee') return { role: 'employee', id: DEFAULT_EMPLOYEE_ID }
  // No claim at all — the Chrome extension, a health check, curl. Fall back to
  // the shared server-side session, which is the record those clients follow.
  const session = db.session
  if (session?.role === 'admin') return { role: 'admin', id: 'AD-001' }
  return { role: 'employee', id: employeeById(session?.id) ? session.id : db.sessionEmployeeId }
}

app.use((req, res, next) => {
  const actor = actorOf(req)
  req.actor = actor
  // Points the store's per-employee views (profile, notifications, quiz,
  // assigned modules) at this request's employee.
  if (actor.role === 'employee') setSessionEmployee(actor.id)
  next()
})

function requireAdmin(req, res, next) {
  if (req.actor.role !== 'admin') {
    return res.status(403).json({ error: 'This action is restricted to administrators.' })
  }
  next()
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'aipassport-backend', time: new Date().toISOString() })
})

// ---- auth (demo) -----------------------------------------------------------
// Real deployment: Firebase Authentication with role claims. For the demo the
// email decides both the role and — for an employee — which directory record
// signs in, so an assignment can be shown reaching one employee and not another.
app.post('/api/auth/login', (req, res) => {
  const { role, email } = req.body || {}
  let user
  if (role === 'admin') {
    user = { role: 'admin', id: 'AD-001', initials: 'AD', name: 'Admin', title: 'Compliance role' }
  } else {
    const p = setSessionEmployee(employeeIdFromEmail(email))
    user = { role: 'employee', id: p.id, initials: p.initials, name: p.name, title: `${p.dept} · Level ${p.level}` }
  }
  // Recorded here so every client of this backend agrees on who is signed in —
  // the web app and the Chrome extension are different origins and cannot share
  // localStorage, so the session has to live somewhere both of them can reach.
  db.session = user
  recordSession('in', user)
  res.json(user)
})

// Read by the extension popup on every open, so the sidebar restores the same
// employee the dashboard is signed in as. Returns { user: null } when signed out.
app.get('/api/auth/session', (req, res) => res.json({ user: db.session }))

app.post('/api/auth/logout', (req, res) => {
  if (db.session) recordSession('out', db.session)
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
  // Layer 2 sees the Layer-1-masked text, never the raw prompt.
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

/**
 * Is the gateway refusing to let this prompt go?
 *
 * Two different refusals, and the order matters. A **ban** is about the
 * destination, so it refuses a prompt with nothing in it — that is the whole
 * difference between "banned" and "unapproved". Everything else is about the
 * content: Block with nothing detected means there was nothing to hold back, and
 * an ordinary prompt is never the thing an approval workflow exists to stop.
 */
function isRefused(policy, detections) {
  return Boolean(policy.banned) || (policy.mode === MODES.BLOCK && detections.length > 0)
}

app.post('/api/detect', async (req, res) => {
  const { prompt, tool, model, preview } = req.body || {}
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return res.status(400).json({ error: 'Body must be { "prompt": "..." }' })
  }

  // Layer 2 can await a network call, and another request may run in between.
  // The employee this prompt belongs to is decided before the await and
  // re-asserted after it, so the event is never recorded against whoever
  // happened to call the API while this one was waiting.
  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId
  const { masked, detections, layer2 } = await runDetection(prompt)
  setSessionEmployee(employeeId)

  // Where this prompt is heading decides what may happen to it. `mode` is no
  // longer the org setting read straight off the record: an unapproved tool, an
  // unapproved model, or a data category this tool is not cleared for each
  // tighten it to Block, and none of them can ever loosen it.
  //
  // This is the whole answer to "an employee is on a tool nobody approved".
  // Nothing stops them opening it and a clean prompt is untouched — the register
  // only decides what the tool is allowed to *receive*.
  const policy = gatewayPolicyFor({
    employeeId,
    tool: tool || 'AI Assistant',
    model: model || null,
    types: detections.map(d => d.type),
  })

  // Preview = while-typing check: same result, no audit event, no counters, no
  // points. Only the masked/detection outcome is returned.
  if (preview) {
    return res.json({
      masked, detections, layer2, levelUp: false, preview: true,
      mode: policy.mode, policy, blocked: isRefused(policy, detections), explain: db.settings.experience,
    })
  }

  // The gateway is refusing this prompt: a banned destination refuses every
  // prompt, an uncleared one refuses the sensitive part. Nothing is sent, so
  // nothing is recorded as sent — the incident is what goes in the log instead.
  // Writing a MASKED prompt event here would put a delivery in the audit trail
  // that never happened, and leave the refusal itself invisible to the admin.
  if (isRefused(policy, detections)) {
    recordBlockedAttempt({
      tool: tool || 'AI Assistant',
      model: model || null,
      reason: policy.reason,
      types: detections.map(d => d.type),
    })
    return res.json({
      masked, detections, layer2, levelUp: false, blocked: true,
      mode: policy.mode, policy, explain: db.settings.experience,
    })
  }

  const { event, levelUp } = recordPromptEvent({ detections, masked, tool: tool || 'AI Assistant' })
  const audit = await logDetection({ detections, masked })
  res.json({
    masked, detections, layer2, levelUp,
    mode: policy.mode, policy, explain: db.settings.experience, event: event.id, audit,
  })
})

// Offline events coming back from the extension's queue.
//
// While the gateway is unreachable the extension masks with its local Layer 1
// copy and sends anyway — protection never depends on this service being up.
// What used to be lost is the *record*, so the extension keeps those events and
// posts them here. The text arriving is the already-masked version, never the
// raw prompt, and it is scanned again by the full pipeline so Layer 2 (which
// could not run on-device) still gets its pass.
app.post('/api/detect/backfill', async (req, res) => {
  const { events } = req.body || {}
  if (!Array.isArray(events)) {
    return res.status(400).json({ error: 'Body must be { "events": [...] }' })
  }

  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId
  const accepted = []
  const duplicates = []
  // Bounded: one flush cannot be used to inject an unlimited number of events.
  for (const e of events.slice(0, 50)) {
    if (!e || typeof e.id !== 'string' || typeof e.prompt !== 'string' || !e.prompt) continue
    const { masked, detections } = await runDetection(e.prompt)
    setSessionEmployee(employeeId)
    const recorded = recordOfflineEvent({
      id: e.id, detections, masked, tool: e.tool || 'AI Assistant', at: e.at,
    })
    ;(recorded ? accepted : duplicates).push(e.id)
  }
  res.json({ accepted, duplicates, recovered: db.report.recoveredEvents })
})

// An employee reached an AI tool. The Chrome extension calls this as it arms
// the checkpoint on a page; the web Gateway calls it when a tool is selected.
// Approved tools answer quietly — only a tool the organisation has not reviewed
// (or has withdrawn) produces an audit event and a risk alert.
app.post('/api/gateway/tool-use', (req, res) => {
  const { tool, model } = req.body || {}
  if (typeof tool !== 'string' || !tool.trim()) {
    return res.status(400).json({ error: 'Body must be { "tool": "..." }' })
  }
  const result = recordToolUse({ tool })
  // A model was named, so the second level is resolved and recorded in the same
  // call. Silent unless the model is one the register refuses — see
  // recordModelUse for why an unrecognised model raises nothing.
  const modelResult = typeof model === 'string' && model.trim()
    ? recordModelUse({ tool, model })
    : null

  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId
  res.json({
    // `approved` stays the org-wide answer the first clients were written
    // against; `access` is the per-employee one they should move to.
    status: result.status,
    approved: result.status === 'APPROVED',
    access: result.access,
    alert: result.alert ? { id: result.alert.id, severity: result.alert.severity } : null,
    model: modelResult
      ? {
        status: modelResult.status,
        alert: modelResult.alert ? { id: modelResult.alert.id, severity: modelResult.alert.severity } : null,
      }
      : null,
    policy: gatewayPolicyFor({ employeeId, tool, model }),
  })
})

// Everything the checkpoint needs about where a prompt is heading, without
// recording anything: this employee's standing on the tool, the selected model's
// standing, the mode that really applies, and which approved tools to offer
// instead. One call, because three separate ones is how the extension and the
// dashboard came to hold different opinions about the same tool.
//
// GET on purpose — resolving is not an event. Opening the popup used to POST a
// tool-use and write an audit record for a question nobody asked.
app.get('/api/gateway/tool-status', (req, res) => {
  const tool = String(req.query.tool || '')
  const model = String(req.query.model || '')
  const host = String(req.query.host || '')
  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId

  // The extension knows the hostname for certain and the tool name only by its
  // own local table. Resolving the host against the register when one is given
  // keeps the register the authority on what a page is.
  const resolved = host ? toolForHost(host)?.name || tool : tool

  res.json({
    ...gatewayPolicyFor({ employeeId, tool: resolved, model: model || null }),
    // Kept so callers written against the old shape keep working.
    status: toolStatus(resolved),
  })
})

// The employee changed model inside an approved tool. Recorded on its own so an
// admin sees the switch even when no prompt follows it.
app.post('/api/gateway/model-use', (req, res) => {
  const { tool, model } = req.body || {}
  if (typeof tool !== 'string' || !tool.trim() || typeof model !== 'string' || !model.trim()) {
    return res.status(400).json({ error: 'Body must be { "tool": "...", "model": "..." }' })
  }
  const result = recordModelUse({ tool, model })
  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId
  res.json({
    status: result.status,
    approved: result.status === 'APPROVED' || result.status === 'UNKNOWN',
    alert: result.alert ? { id: result.alert.id, severity: result.alert.severity } : null,
    policy: gatewayPolicyFor({ employeeId, tool, model }),
  })
})

// The checkpoint refused a prompt on the employee's device, so the backend never
// saw it. This is that incident reaching the admin dashboard.
//
// The Chrome extension runs its while-typing check with `preview: true` — no
// records — and blocks the send itself, which means /api/detect is never called
// for a prompt that does not go. Without this route an unapproved tool or a
// banned model would refuse silently: the employee would be stopped and the
// organisation would learn nothing. Prompt text is never accepted here, only the
// detection types.
app.post('/api/gateway/blocked', (req, res) => {
  const { tool, model, reason, types } = req.body || {}
  if (typeof tool !== 'string' || !tool.trim()) {
    return res.status(400).json({ error: 'Body must be { "tool": "...", "reason": "..." }' })
  }
  const result = recordBlockedAttempt({
    tool,
    model: typeof model === 'string' && model.trim() ? model : null,
    reason: String(reason || 'tool-unapproved'),
    // Types only — a list of category names, never the text they were found in.
    types: Array.isArray(types) ? types.filter(t => typeof t === 'string').slice(0, 20) : [],
  })
  res.json({
    ok: true,
    alert: result.alert ? { id: result.alert.id, severity: result.alert.severity } : null,
  })
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
// The stored record plus its derived fields (AI Safety Score). Served through
// publicProfile() so no screen has to invent a number the server did not send.
app.get('/api/profile', (req, res) => res.json(publicProfile()))

app.get('/api/leaderboard', (req, res) => res.json(leaderboard()))

// The employee's XP / level progression, plus the level table the UI labels
// bands with. Admin reads the same records — one source of truth for both sides.
app.get('/api/progression', (req, res) => {
  res.json({ levels: LEVELS, employees: allProgressionSummaries(), ...progressionSummary() })
})

// Quiz: an answer is recorded (first attempt per question only) but earns no XP
// on its own — XP is settled once, when the assessment is evaluated. Both routes
// refuse a module this employee has not been given, so an unassigned module
// cannot be completed by posting to the API directly.
function guardModule(req, res) {
  const moduleId = Number(req.body?.module ?? req.query?.module) || 1
  const access = canAccessModule(req.actor.id, moduleId)
  if (!access.ok) {
    recordAudit({
      action: 'DENIED',
      resource: access.module?.title || `Module ${moduleId}`,
      tool: 'AI Passport',
      record: `Access refused · module ${moduleId} is ${access.reason.replace('_', ' ')} for ${req.actor.id}`,
      control: 'NIST PR.AC',
      status: 'BLOCKED',
      risk: 'HIGH',
    })
    res.status(403).json({ error: 'This training is not assigned to you.', reason: access.reason })
    return null
  }
  return moduleId
}

app.post('/api/quiz/answer', (req, res) => {
  const moduleId = guardModule(req, res)
  if (moduleId === null) return
  const { question, correct, selected } = req.body || {}
  res.json(answerQuiz(moduleId, Number(question), Boolean(correct), Number.isInteger(selected) ? selected : null))
})

app.get('/api/quiz/results', (req, res) => {
  const moduleId = guardModule(req, res)
  if (moduleId === null) return
  res.json(quizResults(moduleId))
})

app.post('/api/training/complete', (req, res) => {
  const moduleId = guardModule(req, res)
  if (moduleId === null) return
  res.json(completeTraining(moduleId))
})

// Retry is only offered after the whole assessment has been evaluated, and only
// once the 24h lock has expired — 423 while it is still locked.
app.post('/api/quiz/retry', (req, res) => {
  const moduleId = guardModule(req, res)
  if (moduleId === null) return
  const result = retryTraining(moduleId)
  res.status(result.ok ? 200 : 423).json(result)
})

// ---- training library + assignments ----------------------------------------
// The admin half writes; the employee half reads its own slice. Both run off
// db.trainingLibrary and db.assignments, which is what keeps "published and
// assigned" and "visible to that employee" the same fact.

app.get('/api/training/library', requireAdmin, (req, res) => {
  res.json({
    modules: libraryForAdmin(),
    assignments: assignmentRecords(),
    departments: DEPARTMENTS,
    employees: EMPLOYEES,
    maxQuestions: MAX_QUESTIONS,
  })
})

app.post('/api/training/modules', requireAdmin, (req, res) => {
  const result = createModule(req.body || {})
  if (!result.ok) return res.status(400).json(result)
  res.json(result)
})

// The question editor holds its edits locally and sends the finished set once,
// so a module never sits in a half-edited state where an employee could open it.
app.put('/api/training/modules/:id', requireAdmin, (req, res) => {
  const result = updateModule(Number(req.params.id), req.body || {})
  if (!result.ok) return res.status(result.error?.includes('no longer exists') ? 404 : 400).json(result)
  res.json(result)
})

app.post('/api/training/modules/:id/status', requireAdmin, (req, res) => {
  const result = setModuleStatus(Number(req.params.id), req.body?.status)
  if (!result.ok) return res.status(404).json(result)
  res.json(result)
})

app.get('/api/training/assignments', requireAdmin, (req, res) => res.json(assignmentRecords()))

app.post('/api/training/assignments', requireAdmin, (req, res) => {
  const { moduleId, type, department, employeeIds } = req.body || {}
  const result = assignTraining({ moduleId: Number(moduleId), type, department, employeeIds })
  if (!result.ok) return res.status(400).json(result)
  res.json(result)
})

// The employee's own training list — published modules that are either standing
// curriculum or assigned to them. Never anybody else's.
app.get('/api/training/mine', (req, res) => {
  res.json({
    employeeId: req.actor.id,
    modules: modulesForEmployee(req.actor.id),
    assignments: assignmentsForEmployee(req.actor.id),
  })
})

// One module, with its questions — the lesson itself. This is the only route
// that hands out question content, and it applies the same access check as the
// quiz routes, so a direct URL for somebody else's training returns 403 rather
// than the assessment.
app.get('/api/training/mine/:id', (req, res) => {
  const moduleId = Number(req.params.id)
  const access = canAccessModule(req.actor.id, moduleId)
  if (!access.ok) {
    recordAudit({
      action: 'DENIED',
      resource: access.module?.title || `Module ${moduleId}`,
      tool: 'AI Passport',
      record: `Access refused · module ${moduleId} is ${access.reason.replace('_', ' ')} for ${req.actor.id}`,
      control: 'NIST PR.AC',
      status: 'BLOCKED',
      risk: 'HIGH',
    })
    return res.status(access.reason === 'not_found' ? 404 : 403).json({
      error: access.reason === 'not_found'
        ? 'That training module does not exist.'
        : 'This training is not assigned to you.',
      reason: access.reason,
    })
  }
  res.json(publicModule(moduleById(moduleId), { withQuestions: true }))
})

// ---- notifications ---------------------------------------------------------
// Scoped to the signed-in employee both ways: the list is theirs, and an id
// from somebody else's inbox does nothing.
app.get('/api/notifications', (req, res) => {
  if (req.actor.role === 'admin') return res.json([])
  res.json(notificationsFor(req.actor.id))
})
const notificationPatch = patch => (req, res) => {
  if (req.actor.role === 'admin') return res.status(403).json({ error: 'Employee inbox only.' })
  res.json(updateNotification(req.actor.id, req.params.id, patch) || {})
}
app.post('/api/notifications/:id/read', notificationPatch({ read: true }))
app.post('/api/notifications/:id/delete', notificationPatch({ deleted: true }))
app.post('/api/notifications/:id/restore', notificationPatch({ deleted: false }))

// ---- my AI activity --------------------------------------------------------
// The signed-in employee's own audit events, behind the Home "My AI Activity"
// card and the page it opens. Scoped on the server (activityFor), so the
// browser is never sent an event belonging to somebody else — /api/audit, the
// organisation-wide feed, stays where it is for the admin console.
app.get('/api/activity/mine', (req, res) => {
  if (req.actor.role === 'admin') {
    return res.status(403).json({ error: 'This is an employee view. Administrators use the Audit Log.' })
  }
  const p = db.profile
  res.json({
    events: activityFor(req.actor.id),
    counters: {
      promptsProtected: p.promptsProtected,
      itemsMasked: p.itemsMasked,
      streakDays: p.streakDays,
    },
  })
})

// ---- visas / tool approvals ------------------------------------------------
app.get('/api/visas', (req, res) => res.json(db.visaRequests))

// The employee's guided request form, server-side: which AI tools they may ask
// for, and whether their AI License lets them ask at all. The browser renders
// this list rather than a set of text boxes, and applyForVisa re-checks the same
// two rules — a request naming anything else is refused however it was made.
app.get('/api/tools/requestable', (req, res) => {
  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId
  const level = db.employees[employeeId]?.level || 0
  res.json({
    canRequest: level >= REQUEST_MIN_LEVEL,
    minLevel: REQUEST_MIN_LEVEL,
    level,
    tools: requestableTools(employeeId),
  })
})

app.post('/api/visas/apply', (req, res) => {
  const result = applyForVisa(req.body || {})
  if (!result.ok) return res.status(403).json({ error: result.error })
  res.json(result.request)
})
app.post('/api/visas/:id/decision', requireAdmin, (req, res) => {
  const { decision, note } = req.body || {}
  const request = decideVisa(req.params.id, decision, note)
  if (!request) return res.status(404).json({ error: 'Request not found' })
  res.json(request)
})

// Org-wide tool status (Tool Approvals' vendor security card). Suspending is an
// admin action: it updates the tool here, writes one audit event and notifies
// employees — 409 if the tool is already suspended, so a repeat click is a no-op.
app.get('/api/tools', (req, res) => res.json(toolRegister()))

// The register folded for the signed-in employee: the same rows, plus where
// *they* stand on each one and which models they may use.
//
// The fold used to live in the browser (Visas.jsx compared minLevel against the
// profile), which meant the page and the gateway could reach different answers
// about the same tool — the page would say "approved" while the checkpoint
// refused the prompt. One function answers it now and both read the result.
app.get('/api/tools/mine', (req, res) => {
  const employeeId = req.actor.role === 'employee' ? req.actor.id : db.sessionEmployeeId
  res.json(toolRegister().map(entry => {
    const access = toolAccessFor(employeeId, entry.name)
    // Models folded the same way the tool is: `access` per model, so the page
    // can show a Trainee their free models as available and the paid ones as
    // what Level 2 opens, without holding a level table of its own.
    const models = toolModelsFor(employeeId, entry.name)
    const free = freeModelFor(employeeId, entry.name)
    return {
      ...entry,
      access: access.access,
      approved: access.approved,
      explain: access.explain,
      request: access.request,
      models,
      // What the AI Tools page puts in the MODEL column at every licence level:
      // the newest free model on the tool, falling back to the register's own
      // headline model for a tool with no model policy.
      displayModel: free?.label || entry.model,
      category: entry.category || 'assistant',
    }
  }))
})

// Per-model decision inside a tool that stays approved — the case-study
// scenario where the website is greenlit and one model on it is not. Separate
// from /api/tools/suspend on purpose: suspending Claude stops an organisation
// using Claude, whereas refusing one model leaves every approved one working.
app.post('/api/tools/model-status', requireAdmin, (req, res) => {
  const { tool, model, status } = req.body || {}
  const result = setModelStatus(tool, model, status)
  if (!result.ok) {
    const code = result.reason === 'unchanged' ? 409 : result.reason === 'bad_status' ? 400 : 404
    return res.status(code).json({ error: result.reason, tools: result.tools })
  }
  res.json({ tool: result.tool, model: result.model, event: result.event, tools: result.tools })
})
app.post('/api/tools/suspend', requireAdmin, (req, res) => {
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
    // Org-wide average across the 303 seeded employees, of whom the signed-in
    // one is live. 2.1 is that population's standing average at their seeded
    // Level 2; their levelling up nudges it.
    avgLicense: Number((2.1 + (db.profile.level - 2) * 0.1).toFixed(1)),
    pendingApprovals: db.visaRequests.filter(r => ['SECURITY REVIEW', 'COMPLIANCE'].includes(r.status)).length,
    // Events masked on-device during a gateway outage and recorded afterwards.
    recoveredEvents: db.report.recoveredEvents,
  })
})

// One-click compliance report (O3). The numbers live here, not in the page, so
// what a regulator downloads is what the audit log holds.
app.get('/api/report', (req, res) => res.json(reportSummary()))

// ---- risk alerts ----
// Sorted by severity with a live `due` countdown — see alertsView(). The rules
// that decide severity are in risk.js and are surfaced to the admin screen so
// the queue can be explained rather than just read.
app.get('/api/alerts', (req, res) => res.json(alertsView()))
app.post('/api/alerts/:id/resolve', requireAdmin, (req, res) => {
  resolveAlert(req.params.id)
  res.json(alertsView())
})

// Public transparency portal: affected person requests a human review
app.post('/api/review-request', (req, res) => {
  const { ref } = req.body || {}
  res.json(addReviewRequest(ref || 'REF-DEMO-2026-041'))
})

// `modes` is the list of protection modes an admin may actually choose, sent
// with the policy rather than hard-coded in the Settings screen — so removing or
// adding an org-wide mode is a change to risk.js and nowhere else. Block is not
// in it: it exists only as a verdict the gateway derives for a destination that
// has not been cleared.
app.get('/api/settings', (req, res) => res.json({ ...db.settings, modes: ORG_MODES }))
app.put('/api/settings', requireAdmin, (req, res) => {
  res.json({ ...updateSettings(req.body || {}), modes: ORG_MODES })
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
