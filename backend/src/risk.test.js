// Risk alert rules — run with `npm test` (backend).
//
// The point of these is that the queue stays worth reading. Two failures would
// each destroy it in opposite directions: alerting on every protected prompt
// (so an admin learns to ignore the queue), and opening a new card every time a
// pattern repeats (so the queue is five copies of one finding). Both are pinned
// here, along with the severity each rule earns.
//
// Note: these tests exercise the real store, so they reset it — running them
// clears any saved demo state in backend/data/progress.json.
import assert from 'node:assert/strict'
import {
  db, resetStore, setSessionEmployee, recordPromptEvent, recordOfflineEvent, recordOverride,
  recordToolUse, toolStatus, alertsView, resolveAlert, decideVisa, suspendToolOrgWide,
  notificationsFor, openAlerts, updateSettings,
  toolAccessFor, toolForHost, alternativesFor, modelStatus, recordModelUse, setModelStatus,
  gatewayPolicyFor, recordBlockedAttempt, requestableTools, applyForVisa,
  toolModelsFor, freeModelFor, modelAccessFor, approvedModels,
  REPEAT_WARN_AT, REPEAT_ESCALATE_AT, REPEAT_WINDOW_MINUTES, REQUEST_MIN_LEVEL,
} from './store.js'
import { dueLabel, pruneRepeats, repeatCounts, repeatVerdict, SEVERITY, MODES, tighten } from './risk.js'

let passed = 0
function test(name, fn) {
  resetStore()
  setSessionEmployee('E-217')
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const IC = [{ type: 'IC', count: 1 }]
const alertsFor = title => openAlerts().filter(a => a.title === title)
const maskPrompt = (detections = IC) =>
  recordPromptEvent({ detections, masked: 'client [MASKED-IC]', tool: 'ChatGPT' })

// ---- rule 1: repeated identifiers ------------------------------------------

test('one protected prompt raises nothing — the gateway working is not a risk', () => {
  const before = openAlerts().length
  maskPrompt()
  assert.equal(openAlerts().length, before)
})

test(`${REPEAT_WARN_AT} of the same identifier raises one MEDIUM alert`, () => {
  for (let i = 0; i < REPEAT_WARN_AT; i++) maskPrompt()
  const raised = alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217')
  assert.equal(raised.length, 1)
  assert.equal(raised[0].severity, SEVERITY.MEDIUM)
  // The count on the card is the evidence the rule counted, so it matches the
  // figure the alert's own text quotes.
  assert.equal(raised[0].occurrences, REPEAT_WARN_AT)
  assert.match(raised[0].what, new RegExp(`^${REPEAT_WARN_AT} prompts`))
})

test(`${REPEAT_ESCALATE_AT} escalates the same alert to HIGH instead of opening a second`, () => {
  for (let i = 0; i < REPEAT_ESCALATE_AT; i++) maskPrompt()
  const raised = alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217')
  assert.equal(raised.length, 1, 'still exactly one card')
  assert.equal(raised[0].severity, SEVERITY.HIGH)
  assert.equal(raised[0].occurrences, REPEAT_ESCALATE_AT, 'the card counts every masked instance')
  assert.ok(raised[0].timeline.some(([, e]) => e.includes('Escalated to HIGH')))
})

test('different identifier types are counted separately', () => {
  // Two of each: neither type reaches the threshold, so nothing is raised.
  maskPrompt([{ type: 'IC', count: 1 }])
  maskPrompt([{ type: 'IC', count: 1 }])
  maskPrompt([{ type: 'PHONE', count: 1 }])
  maskPrompt([{ type: 'PHONE', count: 1 }])
  assert.equal(alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217').length, 0)
})

test('one prompt carrying the same identifier three times counts as three', () => {
  maskPrompt([{ type: 'IC', count: REPEAT_WARN_AT }])
  assert.equal(alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217').length, 1)
})

test('two employees do not add up to one pattern', () => {
  setSessionEmployee('E-217')
  maskPrompt()
  maskPrompt()
  setSessionEmployee('E-198')
  maskPrompt()
  assert.equal(alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-198').length, 0)
  assert.equal(alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217').length, 0)
})

test('the employee is told before the manager acts', () => {
  for (let i = 0; i < REPEAT_WARN_AT; i++) maskPrompt()
  const told = notificationsFor('E-217').filter(n => n.title === 'A pattern was spotted in your prompts')
  assert.equal(told.length, 1)
  assert.equal(told[0].action.to, '/training')
})

// A gateway outage must not manufacture a pattern: recovered events are minutes
// or hours old, so counting them as "just now" would raise an alert for
// behaviour that was never bunched together in real time.
test('recovered offline events do not feed the pattern window', () => {
  for (let i = 0; i < REPEAT_ESCALATE_AT; i++) {
    recordOfflineEvent({ id: `q${i}`, detections: IC, masked: 'a [MASKED-IC]' })
  }
  assert.equal(alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217').length, 0)
})

test('events age out of the window', () => {
  const now = Date.now()
  const events = [
    { employeeId: 'E-217', type: 'IC', at: now - (REPEAT_WINDOW_MINUTES + 1) * 60_000 },
    { employeeId: 'E-217', type: 'IC', at: now },
  ]
  assert.equal(pruneRepeats(events, now).length, 1)
})

test('the verdict is silent below the threshold', () => {
  assert.equal(repeatVerdict({ IC: REPEAT_WARN_AT - 1 }), null)
  assert.equal(repeatVerdict({}), null)
  assert.equal(repeatVerdict({ IC: REPEAT_WARN_AT }).severity, SEVERITY.MEDIUM)
  assert.equal(repeatVerdict({ IC: REPEAT_ESCALATE_AT }).severity, SEVERITY.HIGH)
})

test('the verdict names the identifier that repeated most', () => {
  const v = repeatVerdict({ IC: 2, PHONE: REPEAT_WARN_AT + 1 })
  assert.equal(v.type, 'PHONE')
})

test('counts are per employee', () => {
  const events = [
    { employeeId: 'E-217', type: 'IC', at: Date.now() },
    { employeeId: 'E-198', type: 'IC', at: Date.now() },
  ]
  assert.deepEqual(repeatCounts(events, 'E-217'), { IC: 1 })
})

// ---- rule 2: unapproved tool ------------------------------------------------

test('an approved tool raises nothing', () => {
  const before = openAlerts().length
  const result = recordToolUse({ tool: 'ChatGPT' })
  assert.equal(result.status, 'APPROVED')
  assert.equal(result.alert, null)
  assert.equal(openAlerts().length, before)
})

test('a tool with no approved access raises one MEDIUM alert', () => {
  const result = recordToolUse({ tool: 'DeepSeek' })
  assert.equal(result.status, 'UNAPPROVED')
  assert.equal(result.alert.severity, SEVERITY.MEDIUM)
  assert.equal(result.alert.title, 'Unapproved tool detected')
  assert.equal(result.alert.employeeId, 'E-217')
})

test('re-opening the same tool does not fill the queue', () => {
  recordToolUse({ tool: 'DeepSeek' })
  recordToolUse({ tool: 'DeepSeek' })
  recordToolUse({ tool: 'DeepSeek' })
  assert.equal(alertsFor('Unapproved tool detected').filter(a => a.employeeId === 'E-217').length, 1)
})

test('a suspended tool is HIGH, not MEDIUM', () => {
  suspendToolOrgWide('ChatGPT')
  const result = recordToolUse({ tool: 'ChatGPT' })
  assert.equal(result.status, 'SUSPENDED')
  assert.equal(result.alert.severity, SEVERITY.HIGH)
  assert.equal(result.alert.title, 'Suspended tool used')
})

test('the employee is told which tool, and where to fix it', () => {
  recordToolUse({ tool: 'DeepSeek' })
  const told = notificationsFor('E-217').filter(n => n.title === 'DeepSeek is not an approved tool')
  assert.equal(told.length, 1)
  assert.equal(told[0].action.to, '/tools')
})

test('approving tool access is what stops the tool being flagged', () => {
  assert.equal(toolStatus('SummarizerX'), 'UNAPPROVED')
  assert.equal(recordToolUse({ tool: 'SummarizerX' }).alert.severity, SEVERITY.MEDIUM)

  decideVisa('A-0492', 'approve') // the seeded SummarizerX request
  assert.equal(toolStatus('SummarizerX'), 'APPROVED')
  assert.equal(recordToolUse({ tool: 'SummarizerX' }).alert, null)
})

test('declining tool access leaves the tool unapproved', () => {
  decideVisa('A-0492', 'decline')
  assert.equal(toolStatus('SummarizerX'), 'UNAPPROVED')
})

test('a tool nobody has heard of is treated as unapproved', () => {
  assert.equal(toolStatus('SomeRandomAI'), 'UNAPPROVED')
  assert.equal(recordToolUse({ tool: 'SomeRandomAI' }).alert.severity, SEVERITY.MEDIUM)
})

// ---- per-employee access ------------------------------------------------------
// "Approved" is a question about a person, not only about the organisation. This
// fold used to happen in the browser, so the gateway and the employee's own AI
// Tools page could hold different opinions about the same tool.

test('a tool above the employee licence level is not approved for them', () => {
  // GitHub Copilot is APPROVED org-wide and needs Level 3; E-217 is Level 2.
  assert.equal(toolStatus('GitHub Copilot'), 'APPROVED')
  const access = toolAccessFor('E-217', 'GitHub Copilot')
  assert.equal(access.access, 'locked')
  assert.equal(access.approved, false)
  assert.match(access.explain, /Level 3/)
})

test('using a tool above your level is a training gap, not a vendor risk', () => {
  const result = recordToolUse({ tool: 'GitHub Copilot' })
  assert.equal(result.access, 'locked')
  assert.equal(result.alert.severity, SEVERITY.MEDIUM)
  assert.equal(result.alert.title, 'Tool used above licence level')
  // The employee is pointed at the thing that actually fixes it.
  const told = notificationsFor('E-217').filter(n => n.title.includes('needs AI License Level'))
  assert.equal(told[0].action.to, '/training')
})

test('a declined request is refused for that employee only', () => {
  // A-0486 TranslateAI was REDIRECTED, requested by M-083.
  assert.equal(toolAccessFor('M-083', 'TranslateAI').access, 'declined')
  assert.equal(toolAccessFor('E-217', 'TranslateAI').access, 'unreviewed')
})

test('the register is the authority on what a page is', () => {
  assert.equal(toolForHost('claude.ai').name, 'Claude')
  assert.equal(toolForHost('www.deepseek.com').name, 'DeepSeek')
  assert.equal(toolForHost('example.com'), null)
})

test('an alternative is only offered if it is approved and openable', () => {
  const alts = alternativesFor('E-217', 'DeepSeek')
  assert.ok(alts.some(a => a.name === 'ChatGPT'))
  assert.ok(alts.every(a => a.url), 'every alternative can actually be opened')
  assert.ok(!alts.some(a => a.name === 'DeepSeek'), 'never offers the tool being left')
  // GitHub Copilot is approved org-wide but locked for E-217, and has no URL.
  assert.ok(!alts.some(a => a.name === 'GitHub Copilot'))
})

// ---- rule 2b: unapproved model -------------------------------------------------
// The website is greenlit, one model on it is not.

test('an approved tool can still hold a refused model', () => {
  assert.equal(toolStatus('Claude'), 'APPROVED')
  assert.equal(modelStatus('Claude', 'Claude Sonnet 5'), 'APPROVED')
  assert.equal(modelStatus('Claude', 'Claude Fable 5'), 'BANNED')
})

test('a model label is matched the way a UI writes it', () => {
  assert.equal(modelStatus('Claude', 'Fable 5'), 'BANNED')
  assert.equal(modelStatus('Claude', 'fable'), 'BANNED')
  assert.equal(modelStatus('Claude', 'Sonnet'), 'APPROVED')
})

test('a model nobody has registered is UNKNOWN, never unapproved', () => {
  // The register being a week out of date is not the employee's doing.
  assert.equal(modelStatus('Claude', 'Claude Opus 9'), 'UNKNOWN')
  assert.equal(recordModelUse({ tool: 'Claude', model: 'Claude Opus 9' }).alert, null)
  // A tool with no model policy at all never blocks on a model.
  assert.equal(modelStatus('DeepSeek', 'anything'), 'UNKNOWN')
})

test('selecting an unreviewed model raises MEDIUM and names the way out', () => {
  // Sol is approved; withdrawing it is what makes this the unreviewed case,
  // rather than the banned one Fable 5 now covers.
  setModelStatus('ChatGPT', 'gpt-5.6-sol', 'UNAPPROVED')
  const result = recordModelUse({ tool: 'ChatGPT', model: 'GPT-5.6 Sol' })
  assert.equal(result.status, 'UNAPPROVED')
  assert.equal(result.alert.severity, SEVERITY.MEDIUM)
  assert.equal(result.alert.title, 'Unapproved model detected')
  assert.match(result.alert.recommend, /GPT-5.5 Instant/)
})

test('selecting a banned model is HIGH on its first occurrence', () => {
  const result = recordModelUse({ tool: 'Claude', model: 'Fable 5' })
  assert.equal(result.status, 'BANNED')
  assert.equal(result.access, 'banned')
  assert.equal(result.alert.severity, SEVERITY.HIGH)
  assert.equal(result.alert.title, 'Banned model used')
  assert.match(result.alert.recommend, /Claude Sonnet 5|Claude Haiku 4.5|Claude Opus 5/)
})

test('re-selecting the same model does not fill the queue', () => {
  recordModelUse({ tool: 'Claude', model: 'Fable 5' })
  recordModelUse({ tool: 'Claude', model: 'Fable 5' })
  recordModelUse({ tool: 'Claude', model: 'Fable 5' })
  assert.equal(alertsFor('Banned model used').filter(a => a.employeeId === 'E-217').length, 1)
})

test('approving a model is what stops it being flagged', () => {
  assert.equal(recordModelUse({ tool: 'Claude', model: 'Fable 5' }).alert.severity, SEVERITY.HIGH)
  setModelStatus('Claude', 'claude-fable-5', 'APPROVED')
  assert.equal(modelStatus('Claude', 'Fable 5'), 'APPROVED')
  assert.equal(recordModelUse({ tool: 'Claude', model: 'Fable 5' }).alert, null)
})

test('refusing a model leaves the tool itself approved', () => {
  setModelStatus('Claude', 'claude-sonnet-5', 'SUSPENDED')
  assert.equal(toolStatus('Claude'), 'APPROVED')
  assert.equal(toolAccessFor('E-217', 'Claude').approved, true)
  assert.equal(modelStatus('Claude', 'Haiku 4.5'), 'APPROVED')
})

// ---- banning a model ----------------------------------------------------------
// "Unapproved" holds company data back and lets ordinary work continue.
// "Banned" is the organisation saying nothing may go there at all — so it has to
// refuse a prompt with nothing in it, which is the one thing no other rule does.

test('a banned model refuses a prompt with nothing sensitive in it', () => {
  const clean = gatewayPolicyFor({ employeeId: 'E-217', tool: 'Claude', model: 'Fable 5', types: [] })
  assert.equal(clean.banned, true)
  assert.equal(clean.mode, MODES.BLOCK)
  assert.equal(clean.reason, 'model-banned')

  // …while an unreviewed model lets the same harmless prompt through.
  setModelStatus('ChatGPT', 'gpt-5.6-sol', 'UNAPPROVED')
  const unreviewed = gatewayPolicyFor({ employeeId: 'E-217', tool: 'ChatGPT', model: 'GPT-5.6 Sol', types: [] })
  assert.equal(unreviewed.banned, false)
})

test('banning one model leaves every other model on the tool working', () => {
  assert.equal(gatewayPolicyFor({ employeeId: 'E-217', tool: 'Claude', model: 'Sonnet 5', types: ['IC'] }).mode, MODES.MASK)
  assert.equal(toolAccessFor('E-217', 'Claude').approved, true)
  // And the employee is told where to go instead.
  assert.ok(gatewayPolicyFor({ employeeId: 'E-217', tool: 'Claude', model: 'Fable 5' }).approvedModels.includes('Claude Sonnet 5'))
})

test('an admin can ban any model, including a free one', () => {
  // The test the ban has to survive: it is a status on the register, not a
  // special case for one model somebody hard-coded.
  assert.equal(setModelStatus('Claude', 'claude-haiku-4-5', 'BANNED').ok, true)
  const policy = gatewayPolicyFor({ employeeId: 'E-217', tool: 'Claude', model: 'Haiku 4.5', types: [] })
  assert.equal(policy.banned, true)
  assert.equal(policy.reason, 'model-banned')
  // Lifting it puts the model straight back.
  setModelStatus('Claude', 'claude-haiku-4-5', 'APPROVED')
  assert.equal(gatewayPolicyFor({ employeeId: 'E-217', tool: 'Claude', model: 'Haiku 4.5', types: [] }).banned, false)
})

test('a refused send is an incident, and the queue holds one per hour', () => {
  const before = openAlerts().length
  recordBlockedAttempt({ tool: 'Claude', model: 'Fable 5', reason: 'model-banned', types: [] })
  recordBlockedAttempt({ tool: 'Claude', model: 'Fable 5', reason: 'model-banned', types: [] })
  const raised = openAlerts().filter(a => a.title === 'Prompt sent to a banned destination')
  assert.equal(raised.length, 1)
  assert.equal(raised[0].severity, SEVERITY.HIGH)
  assert.equal(openAlerts().length, before + 1)
  // Every attempt reaches the audit log even though only one card is raised.
  const logged = db.auditEvents.filter(e => e.action === 'BLOCKED' && e.resource === 'Claude · Claude Fable 5')
  assert.equal(logged.length, 2)
  assert.ok(logged.every(e => !/prompt/i.test(e.record.replace('Prompt refused', ''))), 'no prompt text is recorded')
})

test('an unapproved tool refusing a prompt is logged as its own incident', () => {
  recordBlockedAttempt({ tool: 'DeepSeek', reason: 'tool-unapproved', types: ['IC', 'NAME'] })
  const raised = openAlerts().filter(a => a.title === 'Prompt refused by the gateway')
  assert.equal(raised.length, 1)
  assert.equal(raised[0].severity, SEVERITY.MEDIUM)
  assert.match(raised[0].what, /not approved by the organisation/)
  assert.match(raised[0].evidence, /IC number, personal name/)
})

// ---- AI License levels decide which models and tools are reachable -------------

test('level 1 reaches the free models and nothing else', () => {
  db.employees['E-217'].level = 1
  const models = toolModelsFor('E-217', 'ChatGPT')
  assert.deepEqual(
    models.filter(m => m.approved).map(m => m.label),
    ['GPT-5.5 Instant'],
    'only the free tier is available at Level 1'
  )
  assert.equal(freeModelFor('E-217', 'ChatGPT').label, 'GPT-5.5 Instant')
  assert.equal(modelAccessFor('E-217', 'ChatGPT', 'GPT-5.6 Sol'), 'locked')
  // A paid model above the licence holds sensitive content back, under its own
  // reason — the model is reviewed, this employee is not cleared for it.
  const policy = gatewayPolicyFor({ employeeId: 'E-217', tool: 'ChatGPT', model: 'Sol', types: ['IC'] })
  assert.equal(policy.mode, MODES.BLOCK)
  assert.equal(policy.reason, 'model-level')
  assert.equal(policy.banned, false)
})

test('level 2 opens the paid models on an approved tool', () => {
  assert.equal(db.employees['E-217'].level, 2)
  assert.equal(modelAccessFor('E-217', 'ChatGPT', 'GPT-5.6 Sol'), 'active')
  assert.equal(gatewayPolicyFor({ employeeId: 'E-217', tool: 'ChatGPT', model: 'Sol', types: ['IC'] }).mode, MODES.MASK)
  // A Trainee is never offered a model they would then be refused for.
  db.employees['E-217'].level = 1
  assert.deepEqual(approvedModels('ChatGPT', 'E-217'), ['GPT-5.5 Instant'])
})

// The register names models an employee will actually meet in a picker, and a
// model it has never heard of stays UNKNOWN rather than inheriting a sibling's
// approval. Both are pinned here because both were wrong: the ChatGPT entry
// listed API-only tiers as if they were selectable in chat, and a bare "opus"
// alias would have quietly approved every future Opus release.
test('the register names the models each picker really offers', () => {
  assert.equal(freeModelFor('E-217', 'ChatGPT').label, 'GPT-5.5 Instant')
  assert.equal(freeModelFor('E-217', 'Claude').label, 'Claude Sonnet 5')
  assert.equal(freeModelFor('E-217', 'Gemini').label, 'Gemini 3.6 Flash')
  // Tiers that exist in the API but not in the ChatGPT picker are not listed.
  assert.equal(modelStatus('ChatGPT', 'GPT-5.6 Terra'), 'UNKNOWN')
  assert.equal(modelStatus('ChatGPT', 'GPT-5.6 Luna'), 'UNKNOWN')
  // A family alias must not adopt the next model in that family.
  assert.equal(modelStatus('Claude', 'Claude Opus 5'), 'APPROVED')
  assert.equal(modelStatus('Claude', 'Claude Opus 9'), 'UNKNOWN')
})

test('level 4 unlocks the development tools', () => {
  assert.equal(toolAccessFor('E-217', 'Codex').access, 'locked')
  assert.equal(toolAccessFor('E-217', 'Claude Code').access, 'locked')
  db.employees['E-217'].level = 4
  assert.equal(toolAccessFor('E-217', 'Codex').access, 'active')
  assert.equal(toolAccessFor('E-217', 'Claude Code').access, 'active')
  // Level 3's tool comes with it rather than being skipped.
  assert.equal(toolAccessFor('E-217', 'GitHub Copilot').access, 'active')
})

// ---- the guided tool access request -------------------------------------------
// The form used to be four text boxes, so the approval queue took whatever an
// employee typed. It is a list now, and the list is the register.

test('level 1 has no tool request feature at all', () => {
  db.employees['E-217'].level = 1
  assert.deepEqual(requestableTools('E-217'), [])
  const refused = applyForVisa({ tool: 'DeepSeek', purpose: 'testing' })
  assert.equal(refused.ok, false)
  assert.match(refused.error, new RegExp(`Level ${REQUEST_MIN_LEVEL}`))
})

test('level 2 can request the tools the register offers', () => {
  const offered = requestableTools('E-217')
  assert.deepEqual(offered.map(t => t.name), ['DeepSeek'])
  // Every field the admin queue will show comes from the register, not the form.
  assert.equal(offered[0].vendor, 'DeepSeek')
  assert.equal(offered[0].model, 'DeepSeek-V4-Pro')

  const result = applyForVisa({ tool: 'DeepSeek', purpose: 'Summarise public research notes.' })
  assert.equal(result.ok, true)
  assert.equal(result.request.vendor, 'DeepSeek')
  assert.equal(result.request.status, 'SECURITY REVIEW')
  // Asking again while it is in review offers nothing — one request, one queue entry.
  assert.deepEqual(requestableTools('E-217'), [])
})

test('a request naming anything else is refused, however it was made', () => {
  // Requestable, but above this employee's level (Kimi opens at Level 3).
  const early = applyForVisa({ tool: 'Kimi', purpose: 'x' })
  assert.equal(early.ok, false)
  assert.match(early.error, /Level 3/)
  // Already approved for them, and a tool nobody has ever registered.
  assert.equal(applyForVisa({ tool: 'ChatGPT', purpose: 'x' }).ok, false)
  assert.equal(applyForVisa({ tool: 'A tool I invented', purpose: 'x' }).ok, false)
})

// Each tool states the level at which it can be asked for, and each model on it
// states the level that reaches it. Kimi is the case that needs both: an
// Ambassador may request it and use the free models, a Guardian also gets K3.
test('a tool can open for requests at its own level', () => {
  db.employees['E-217'].level = 2
  assert.deepEqual(requestableTools('E-217').map(t => t.name), ['DeepSeek'])

  db.employees['E-217'].level = 3
  assert.deepEqual(requestableTools('E-217').map(t => t.name), ['DeepSeek', 'Kimi'])
})

test('level 3 reaches the Kimi free models, level 4 reaches K3', () => {
  const { request } = applyForVisa({ tool: 'DeepSeek', purpose: 'x' }) // keep the queue realistic
  assert.ok(request)

  db.employees['E-217'].level = 3
  decideVisa(applyForVisa({ tool: 'Kimi', purpose: 'Agentic research.' }).request.id, 'approve')
  assert.equal(toolAccessFor('E-217', 'Kimi').access, 'active')
  assert.deepEqual(approvedModels('Kimi', 'E-217'), ['Kimi K2.6', 'Kimi K2.7 Code'])
  assert.equal(modelAccessFor('E-217', 'Kimi', 'Kimi K3'), 'locked')
  assert.equal(gatewayPolicyFor({ employeeId: 'E-217', tool: 'Kimi', model: 'K3', types: ['IC'] }).reason, 'model-level')

  db.employees['E-217'].level = 4
  assert.deepEqual(approvedModels('Kimi', 'E-217'), ['Kimi K2.6', 'Kimi K2.7 Code', 'Kimi K3'])
  assert.equal(gatewayPolicyFor({ employeeId: 'E-217', tool: 'Kimi', model: 'K3', types: ['IC'] }).mode, MODES.MASK)
})

test('approving the request is what makes the tool usable', () => {
  const { request } = applyForVisa({ tool: 'DeepSeek', purpose: 'Research summaries.' })
  assert.equal(toolAccessFor('E-217', 'DeepSeek').access, 'review')
  assert.equal(gatewayPolicyFor({ employeeId: 'E-217', tool: 'DeepSeek', types: ['IC'] }).mode, MODES.BLOCK)

  decideVisa(request.id, 'approve')
  assert.equal(toolStatus('DeepSeek'), 'APPROVED')
  assert.equal(toolAccessFor('E-217', 'DeepSeek').access, 'active')
  // The same prompt the gateway refused a moment ago is now masked and sent.
  assert.equal(gatewayPolicyFor({ employeeId: 'E-217', tool: 'DeepSeek', types: ['IC'] }).mode, MODES.MASK)
  assert.equal(recordToolUse({ tool: 'DeepSeek' }).alert, null)
})

// ---- the effective mode --------------------------------------------------------
// Approval decides what a tool may RECEIVE, never whether it opens. Every rule
// below can only tighten the org's mode; none can loosen it.

const modeFor = (tool, model, types = ['IC']) =>
  gatewayPolicyFor({ employeeId: 'E-217', tool, model, types }).mode

test('an approved tool on an approved model keeps the org policy', () => {
  assert.equal(db.settings.mode, MODES.MASK)
  assert.equal(modeFor('Claude', 'Claude Sonnet 5'), MODES.MASK)
})

test('an unapproved tool cannot receive sensitive data at all', () => {
  assert.equal(modeFor('DeepSeek', null), MODES.BLOCK)
  const policy = gatewayPolicyFor({ employeeId: 'E-217', tool: 'DeepSeek', types: ['IC'] })
  assert.equal(policy.reason, 'tool-unapproved')
  assert.ok(policy.alternatives.length > 0, 'the employee is told where to go instead')
})

test('a clean prompt is untouched wherever it is going', () => {
  // No detections means nothing to refuse: the tool is never the reason an
  // ordinary prompt cannot be sent.
  const policy = gatewayPolicyFor({ employeeId: 'E-217', tool: 'DeepSeek', types: [] })
  assert.equal(policy.mode, MODES.BLOCK)
  assert.deepEqual(policy.refused, [], 'nothing sensitive was found, so nothing is refused')
})

test('a model the register refuses blocks on an approved tool', () => {
  assert.equal(modeFor('Claude', 'Claude Fable 5'), MODES.BLOCK)
  assert.equal(
    gatewayPolicyFor({ employeeId: 'E-217', tool: 'Claude', model: 'Fable 5', types: ['IC'] }).reason,
    'model-banned'
  )
  setModelStatus('ChatGPT', 'gpt-5.6-sol', 'UNAPPROVED')
  assert.equal(
    gatewayPolicyFor({ employeeId: 'E-217', tool: 'ChatGPT', model: 'Sol', types: ['IC'] }).reason,
    'model-unapproved'
  )
  // …and the approved model on the same tool is unaffected.
  assert.equal(modeFor('Claude', 'Claude Sonnet 5'), MODES.MASK)
})

test('a tool refuses the data categories it was never cleared for', () => {
  setSessionEmployee('E-217')
  // GitHub Copilot is cleared for source code, never for customer identity.
  const policy = gatewayPolicyFor({ employeeId: 'E-217', tool: 'GitHub Copilot', types: ['IC'] })
  assert.equal(policy.mode, MODES.BLOCK)
  // E-217 is Level 2, so the licence check answers first — both refuse it.
  assert.ok(['tool-unapproved', 'data-scope'].includes(policy.reason))
})

test('tool policy can only ever tighten the org mode', () => {
  updateSettings({ mode: MODES.WARN })
  // Warn only is the loosest mode there is, and an unapproved destination still
  // tightens past it — a tool's own standing can never loosen the org's policy.
  assert.equal(modeFor('Claude', 'Claude Sonnet 5'), MODES.WARN)
  assert.equal(modeFor('DeepSeek', null), MODES.BLOCK)
  assert.equal(tighten(MODES.BLOCK, MODES.WARN), MODES.BLOCK)
  assert.equal(tighten(MODES.WARN, MODES.MASK), MODES.MASK)
})

test('Block is not an organisation-wide mode an admin can set', () => {
  // The Settings card is gone, and so is the ability to reach it from a stale
  // client: blocking every sensitive prompt everywhere is the posture that
  // moves the work to a personal laptop, which is the one thing the gateway
  // exists to prevent.
  updateSettings({ mode: MODES.BLOCK })
  assert.equal(db.settings.mode, MODES.MASK, 'the request is ignored, not accepted')
  updateSettings({ mode: MODES.WARN })
  assert.equal(db.settings.mode, MODES.WARN, 'the two real modes still apply')
})

// ---- rule 3: override --------------------------------------------------------

test('an override is HIGH on its first occurrence', () => {
  recordOverride({ prompt: 'send it anyway 880505-10-5566' })
  const raised = alertsFor('Protected prompt overridden')
  assert.equal(raised.length, 1)
  assert.equal(raised[0].severity, SEVERITY.HIGH)
})

test('repeated overrides escalate one alert rather than flooding the queue', () => {
  recordOverride({ prompt: 'once 880505-10-5566' })
  recordOverride({ prompt: 'twice 880505-10-5566' })
  const raised = alertsFor('Protected prompt overridden')
  assert.equal(raised.length, 1)
  assert.equal(raised[0].occurrences, 2)
})

// ---- the queue ---------------------------------------------------------------

test('the queue is ordered open-first, then most severe', () => {
  const view = alertsView()
  const open = view.filter(a => a.status === 'open')
  const rank = { HIGH: 3, MEDIUM: 2, MONITORING: 1 }
  for (let i = 1; i < open.length; i++) {
    assert.ok(rank[open[i - 1].severity] >= rank[open[i].severity], 'severity never increases down the queue')
  }
  assert.ok(view.findIndex(a => a.status === 'resolved') === -1 || view.at(-1).status === 'resolved')
})

test('the due countdown is derived on read, not stored stale', () => {
  const alert = alertsView().find(a => a.dueAt)
  assert.ok(alert.due.startsWith('Due in') || alert.due.startsWith('Overdue by'))
  assert.equal(dueLabel(new Date(Date.now() + 90 * 60_000).toISOString()), 'Due in 1h 30m')
  assert.equal(dueLabel(new Date(Date.now() - 5 * 60_000).toISOString()), 'Overdue by 5m')
})

test('resolving records who closed it and when', () => {
  const target = openAlerts()[0]
  resolveAlert(target.id)
  const after = db.alerts.find(a => a.id === target.id)
  assert.equal(after.status, 'resolved')
  assert.ok(after.resolvedAt)
  assert.ok(after.timeline.some(([, e]) => e.includes('Resolved by Admin')))
})

test('a resolved pattern that returns opens a fresh alert', () => {
  for (let i = 0; i < REPEAT_WARN_AT; i++) maskPrompt()
  const first = alertsFor('Repeated identifiers in prompts').find(a => a.employeeId === 'E-217')
  resolveAlert(first.id)
  // The window still holds the earlier events, so one more masked prompt is
  // enough to cross the threshold again — and it must not silently rejoin a
  // closed case.
  maskPrompt()
  const open = alertsFor('Repeated identifiers in prompts').filter(a => a.employeeId === 'E-217')
  assert.equal(open.length, 1)
  assert.notEqual(open[0].id, first.id)
})

resetStore()
console.log(`\n${passed} risk tests passed`)
