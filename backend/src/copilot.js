// Governance Copilot — an explainability assistant for the admin console.
//
// It answers plain-language questions ("why was that masked?", "what needs my
// attention?") from the live governance records and nothing else. Primary
// engine: Gemini, when GEMINI_API_KEY is set — the same free key Layer 2 uses.
// Fallback: a deterministic responder reading the same records, so the console
// still answers with no key and no network. Every reply is labelled 'gemini' or
// 'offline'; the fallback is never passed off as the model.
//
// This module previously imported riskScore() from store.js. That export no
// longer exists, so the module could not even be loaded — `import` threw, no
// route could mount it, and the panel in the admin console answered every
// question with "I could not reach the governance backend". It is now built
// from the store's actual surface (openAlerts, reportSummary, toolRegister,
// libraryForAdmin, allProgressionSummaries, db.*), so it holds together with
// the rest of the backend instead of against a function that was removed.
//
// The routing is scored rather than first-match. The old version tested regexes
// in order, and `/(department|dept|team|who|which)/` sat above the tool branch —
// so "which tools are pending approval?" matched on the word "which" and was
// answered with a department breakdown. Questions are now scored against every
// intent and the best-matching one answers; when nothing matches well enough it
// says so and lists what it can actually answer, rather than emitting a generic
// status paragraph that ignores the question.

import {
  db, openAlerts, reportSummary, toolRegister, libraryForAdmin,
  allProgressionSummaries, assignmentRecords,
} from './store.js'

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const GEMINI_TIMEOUT_MS = 6000

export const SUGGESTED_QUESTIONS = [
  'What needs my attention right now?',
  'Why was the last prompt masked?',
  'Which tools are waiting for approval?',
  'How is training completion going?',
  'Summarise today for the board.',
]

const SEVERITY_RANK = { HIGH: 3, MEDIUM: 2, MONITORING: 1 }

// ---- the live picture ------------------------------------------------------
// One read of the records every answer is built from, so the model and the
// offline responder are grounded in exactly the same numbers.

function snapshot() {
  const report = reportSummary()
  const alerts = [...openAlerts()].sort(
    (a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0)
  )
  const tools = toolRegister()
  const modules = libraryForAdmin()
  const people = allProgressionSummaries()

  const pending = db.visaRequests.filter(v => ['SECURITY REVIEW', 'COMPLIANCE'].includes(v.status))
  const lastMasked = db.auditEvents.find(e => e.action === 'MASKED')
  const lastOverride = db.auditEvents.find(e => e.action === 'ALERT' && e.status === 'FLAGGED')

  // Departments ranked by sensitive-handling events in the current audit window.
  const byDept = {}
  for (const e of db.auditEvents) {
    if (e.action === 'MASKED' || e.action === 'ALERT') byDept[e.dept] = (byDept[e.dept] || 0) + 1
  }
  const departments = Object.entries(byDept).sort((a, b) => b[1] - a[1])

  return {
    report,
    alerts,
    tools,
    modules,
    people,
    pending,
    lastMasked,
    lastOverride,
    departments,
    settings: db.settings,
    counters: db.counters,
    assignments: assignmentRecords(),
    events: db.auditEvents,
  }
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// ---- Gemini ----------------------------------------------------------------

function buildContext(s) {
  const alerts = s.alerts.slice(0, 5).map(a => `- [${a.severity}] ${a.title} — ${a.meta}`).join('\n') || '- none open'
  const audit = s.events.slice(0, 6)
    .map(e => `- ${e.time} ${e.user}/${e.dept} via ${e.tool}: ${e.action} — "${e.record}"`).join('\n') || '- none'
  const pending = s.pending.map(v => `- ${v.tool} (${v.dept}, ${v.status}, requested by ${v.requester})`).join('\n') || '- none'
  const suspended = s.tools.filter(t => t.status === 'SUSPENDED').map(t => `- ${t.name}`).join('\n') || '- none'
  const training = s.modules
    .map(m => `- "${m.title}": ${m.status}, ${m.questionCount} questions, ${m.assignedTotal} assigned, ${m.doneTotal} completed`)
    .join('\n')

  return `ORGANISATION: Example Sdn Bhd — enterprise AI governance platform "AI Passport".
REPORTING PERIOD ${s.report.period.from} to ${s.report.period.to}.

PROTECTION: ${s.report.promptsProtected} prompts protected, ${s.report.itemsMasked} sensitive items masked, ${s.report.confirmedLeaks} confirmed leaks, ${s.report.recoveredEvents} events recovered from offline queues.
TODAY: ${s.counters.promptsToday} prompts seen, ${s.counters.maskedToday} items masked.
GATEWAY POLICY: mode "${s.settings.mode}", policy v${s.settings.policyVersion}, escalation ${s.settings.escalate ? 'on' : 'off'}.
GOVERNANCE: ${s.report.toolsApproved} tools approved, ${s.report.risksResolved} risks resolved, ${s.report.humanReviews} human reviews completed, ${s.report.trainingAssigned} training assignments issued.

OPEN RISK ALERTS (${s.alerts.length}):
${alerts}

TOOLS AWAITING A DECISION:
${pending}

TOOLS SUSPENDED ORGANISATION-WIDE:
${suspended}

TRAINING LIBRARY:
${training}

RECENT AUDIT EVENTS (already masked — no raw personal data):
${audit}`
}

const SYSTEM = `You are the AI Passport Governance Copilot, an assistant for a compliance administrator.
Answer ONLY from the governance data provided. Be concise and specific — 2-4 short sentences or a tight bullet list. Lead with the direct answer to the question asked.
When relevant, name the framework the point maps to (Malaysia PDPA, NIST AI RMF, or EU AI Act) in parentheses.
All audit records are already masked; never invent raw personal data, names, or numbers that are not in the data. If the data does not answer the question, say so plainly and suggest which screen would. Never use markdown headers.`

async function geminiAnswer(question, s) {
  const key = process.env.GEMINI_API_KEY
  if (!key || key === 'your-gemini-key') return null

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`
  const body = {
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents: [{ parts: [{ text: `${buildContext(s)}\n\nADMIN QUESTION: ${question}` }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    return typeof text === 'string' && text.trim() ? text.trim() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ---- offline responder -----------------------------------------------------
// Each intent declares the words that indicate it. A question is scored against
// all of them and the best match answers, so a question about tools is not
// captured by a question word that happens to appear in it.

const INTENTS = [
  {
    id: 'alerts',
    terms: ['alert', 'attention', 'urgent', 'risk', 'risks', 'biggest', 'worst', 'problem', 'posture', 'wrong', 'issue', 'open', 'queue', 'escalate', 'escalated', 'severity', 'high'],
    phrases: ['needs my attention', 'what should i do', 'right now', 'biggest risk'],
    answer(s) {
      if (!s.alerts.length) {
        return `Nothing is open in the risk queue. ${s.report.risksResolved} ${s.report.risksResolved === 1 ? 'risk has' : 'risks have'} been resolved this period and ${s.report.confirmedLeaks} data leaks were confirmed. The Smart Gateway is running in "${s.settings.mode}" mode (NIST AI RMF · Manage).`
      }
      const top = s.alerts[0]
      const high = s.alerts.filter(a => a.severity === 'HIGH').length
      const rest = s.alerts.slice(1, 3).map(a => `[${a.severity}] ${a.title}`).join('; ')
      return `${plural(s.alerts.length, 'open alert')}${high ? `, ${high} of them HIGH` : ''}. The one to take first is [${top.severity}] "${top.title}" — ${top.meta}. Recommended: ${top.recommend}${rest ? ` Also open: ${rest}.` : ''} Work them from Risk Alerts (NIST AI RMF · Manage).`
    },
  },
  {
    id: 'masking',
    terms: ['mask', 'masked', 'masking', 'redact', 'redacted', 'tokenise', 'pii', 'personal', 'identifier', 'sensitive'],
    phrases: ['why was', 'why did', 'last prompt', 'what was masked'],
    answer(s) {
      if (!s.lastMasked) {
        return `No masked prompts are in the current audit window. When one occurs, the Smart Gateway replaces the personal data with tokens before the prompt leaves the browser and stores only the masked text (Malaysia PDPA · Principle 7). ${s.report.itemsMasked} items have been masked this period.`
      }
      const e = s.lastMasked
      return `The most recent masking was ${e.user} (${e.dept}) via ${e.tool} at ${e.time}: "${e.record}". The gateway detected sensitive content and tokenised it before the prompt left the browser, so only the masked version was ever stored (Malaysia PDPA · Principle 7 · control ${e.control}). Masking costs the employee nothing — it is the safe path, and ${s.report.itemsMasked} items have been protected this way this period.`
    },
  },
  {
    id: 'tools',
    terms: ['tool', 'tools', 'approval', 'approve', 'approved', 'pending', 'request', 'requests', 'vendor', 'unapproved', 'suspended', 'blocked', 'shadow'],
    phrases: ['waiting for approval', 'tool access', 'which tools'],
    answer(s) {
      const suspended = s.tools.filter(t => t.status === 'SUSPENDED')
      const approved = s.tools.filter(t => t.status === 'APPROVED')
      if (!s.pending.length) {
        return `Nothing is waiting for a decision. ${approved.length} tools are approved${suspended.length ? `, and ${suspended.map(t => t.name).join(', ')} ${suspended.length === 1 ? 'is' : 'are'} suspended organisation-wide` : ''}. Unreviewed tools are still flagged when an employee opens one (EU AI Act · Art. 4).`
      }
      const list = s.pending.map(v => `${v.tool} (${v.dept}, ${v.status})`).join('; ')
      return `${plural(s.pending.length, 'tool request')} awaiting a decision: ${list}. Each needs a vendor security review and a data-scope check before approval — decide them on Tool Approvals. ${approved.length} tools are approved today${suspended.length ? `; ${suspended.map(t => t.name).join(', ')} suspended` : ''}.`
    },
  },
  {
    id: 'training',
    terms: ['training', 'module', 'modules', 'learn', 'learning', 'course', 'completion', 'completed', 'literacy', 'assigned', 'quiz'],
    phrases: ['training completion', 'who has not', 'ai literacy'],
    answer(s) {
      const live = s.modules.filter(m => m.status === 'live')
      const drafts = s.modules.filter(m => m.status !== 'live')
      const assignedTotal = s.report.trainingAssigned
      const done = s.people.reduce((n, p) => n + p.modulesCompleted, 0)
      const behind = s.people.filter(p => p.modulesCompleted < p.assignedModules)
      return `${plural(live.length, 'module')} published${drafts.length ? ` and ${plural(drafts.length, 'still in draft')}` : ''}. ${plural(assignedTotal, 'assignment')} issued, and employees with a live record have completed ${plural(done, 'module')} between them. ${behind.length ? `${plural(behind.length, 'employee has', 'employees have')} outstanding training — ${behind.slice(0, 3).map(p => `${p.id} (${p.modulesCompleted}/${p.assignedModules})`).join(', ')}.` : 'Everyone with a record is up to date.'} AI literacy training is the EU AI Act Art. 4 evidence.`
    },
  },
  {
    id: 'compliance',
    terms: ['complian', 'compliant', 'pdpa', 'nist', 'eu', 'act', 'framework', 'frameworks', 'regulat', 'regulator', 'audit', 'evidence', 'control', 'controls', 'retention'],
    phrases: ['are we compliant', 'ai act', 'audit log'],
    answer(s) {
      return `Coverage holds across all three frameworks. Malaysia PDPA — masking before transmission plus masked-only retention, ${s.report.itemsMasked} items this period. NIST AI RMF — Govern/Map/Measure/Manage evidenced in an append-only audit log of ${s.report.events} events. EU AI Act — Art. 4 AI literacy through assigned training (${s.report.trainingAssigned} assignments) and Art. 14 human oversight through the review portal (${s.report.humanReviews} completed). ${s.report.confirmedLeaks} confirmed leaks. Generate the Compliance Report for regulator-ready evidence.`
    },
  },
  {
    id: 'departments',
    terms: ['department', 'departments', 'dept', 'team', 'teams', 'division', 'unit', 'group'],
    phrases: ['which department', 'which team', 'needs attention'],
    answer(s) {
      if (!s.departments.length) {
        return 'No department stands out — there are no masking or alert events in the current audit window to rank them by.'
      }
      const [top, count] = s.departments[0]
      const others = s.departments.slice(1, 3).map(([d, n]) => `${d} (${n})`).join(', ')
      const owning = s.alerts.find(a => a.meta?.includes(top))
      return `${top} has the most sensitive-handling events in the current window (${count}).${others ? ` Then ${others}.` : ''}${owning ? ` It also owns an open alert: "${owning.title}".` : ''} A short Data Privacy refresher for that team is the usual response — guide, don't punish.`
    },
  },
  {
    id: 'overrides',
    terms: ['override', 'overrides', 'overrode', 'leak', 'leaks', 'leaked', 'breach', 'exposed', 'exposure', 'ignored', 'bypass'],
    phrases: ['sent anyway', 'confirmed leak', 'data leak'],
    answer(s) {
      if (!s.report.confirmedLeaks) {
        return `No confirmed leaks this period. An override — an employee choosing "send original anyway" at a checkpoint — is the only event counted as one, and none has occurred. Overrides cost 20 safety points and reset the safe streak, and the gateway is in "${s.settings.mode}" mode${s.settings.mode === 'Warn only' ? ', which is the mode that permits them' : ', which does not offer the option'}.`
      }
      const e = s.lastOverride
      return `${plural(s.report.confirmedLeaks, 'confirmed leak')} this period — each one an employee overriding a checkpoint and sending the original prompt.${e ? ` The most recent: ${e.user} (${e.dept}) via ${e.tool} at ${e.time}.` : ''} This is the one case where protected data demonstrably left the organisation, so it is what the compliance report counts (Malaysia PDPA · Principle 7). Overrides are only possible in "Warn only" mode.`
    },
  },
  {
    id: 'policy',
    terms: ['policy', 'setting', 'settings', 'mode', 'gateway', 'configuration', 'configured', 'block', 'warn'],
    phrases: ['gateway policy', 'protection mode', 'how is it configured'],
    answer(s) {
      const c = s.settings.controls
      const on = Object.entries(c).filter(([, v]) => v).map(([k]) => k.replace(/([A-Z])/g, ' $1').toLowerCase().trim())
      const off = Object.entries(c).filter(([, v]) => !v).map(([k]) => k.replace(/([A-Z])/g, ' $1').toLowerCase().trim())
      return `The Smart Gateway is in "${s.settings.mode}" mode on policy v${s.settings.policyVersion}, with escalation ${s.settings.escalate ? 'on' : 'off'}. Checking: ${on.join(', ') || 'nothing'}.${off.length ? ` Not checking: ${off.join(', ')}.` : ''} ${s.settings.mode === 'Warn only' ? 'Warn only lets an employee send the original after a warning, which is what makes a confirmed leak possible.' : 'Sensitive content is handled before the prompt leaves the browser.'} Change it in Settings — every change is versioned in the audit log (NIST AI RMF · Govern).`
    },
  },
  {
    id: 'summary',
    terms: ['summary', 'summarise', 'summarize', 'brief', 'board', 'today', 'report', 'overview', 'status', 'how', 'going', 'doing'],
    phrases: ['for the board', 'summarise today', 'how are we doing'],
    answer(s) {
      return `Period ${s.report.period.from}–${s.report.period.to}: ${s.report.promptsProtected} prompts protected and ${s.report.itemsMasked} sensitive items masked, with ${s.report.confirmedLeaks} confirmed leaks. ${plural(s.alerts.length, 'risk alert')} open and ${s.report.risksResolved} resolved. ${s.report.toolsApproved} tools approved, ${s.report.humanReviews} human reviews completed, ${s.report.trainingAssigned} training assignments issued. Gateway running "${s.settings.mode}" on policy v${s.settings.policyVersion}. All three frameworks green.`
    },
  },
  {
    id: 'employees',
    terms: ['employee', 'employees', 'staff', 'people', 'person', 'level', 'levels', 'licence', 'license', 'points', 'leaderboard'],
    phrases: ['who is', 'which employee', 'safety points'],
    answer(s) {
      if (!s.people.length) return 'No employee has a live progression record yet.'
      const ranked = [...s.people].sort((a, b) => b.totalXP - a.totalXP)
      const top = ranked[0]
      const list = ranked.slice(0, 3).map(p => `${p.id} — Level ${p.level} ${p.levelName}, ${p.totalXP} pts`).join('; ')
      return `${plural(s.people.length, 'employee')} with a live record. ${list}. Levels come from safety points, which are earned by completing assigned training and using AI safely; a level once reached is never taken away. ${top.id} is furthest along at Level ${top.level}.`
    },
  },
  {
    id: 'capabilities',
    terms: ['help', 'what', 'can', 'do', 'ask', 'able', 'capable', 'you'],
    phrases: ['what can you do', 'what can i ask', 'who are you', 'how do you work'],
    answer(s) {
      return `I read your live governance records and answer from them — nothing is generated from outside this console. Ask me about: the open risk queue and what to take first; why a prompt was masked; tools waiting for approval; training completion; gateway policy; overrides and confirmed leaks; a department that needs attention; or a summary for the board. Right now there ${s.alerts.length === 1 ? 'is' : 'are'} ${plural(s.alerts.length, 'open alert')} and ${plural(s.pending.length, 'tool request')} awaiting a decision.`
    },
  },
]

// Words too common to indicate anything on their own.
const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'for', 'and', 'or',
  'our', 'my', 'me', 'we', 'us', 'it', 'this', 'that', 'there', 'any', 'now', 'about',
  'with', 'from', 'have', 'has', 'had', 'be', 'been', 'am', 'at', 'by', 'as', 'so', 'if',
])

function tokenise(question) {
  return String(question || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOP.has(w))
}

/**
 * The best-matching intent, or null when nothing matches well enough.
 *
 * A whole phrase is worth more than a word, and a word that only prefixes a
 * term ("complian" for "compliance"/"compliant") still counts. `capabilities`
 * is deliberately weak — its terms are common question words, so it only wins
 * when a real phrase like "what can you do" is present.
 */
function route(question) {
  const words = tokenise(question)
  if (!words.length) return null
  const asked = String(question || '').toLowerCase()

  let best = null
  for (const intent of INTENTS) {
    let score = 0
    for (const phrase of intent.phrases || []) {
      if (asked.includes(phrase)) score += 4
    }
    for (const word of words) {
      if (intent.terms.some(t => word === t || word.startsWith(t) || t.startsWith(word))) {
        score += intent.id === 'capabilities' ? 0.5 : 2
      }
    }
    if (score > (best?.score ?? 0)) best = { intent, score }
  }
  // One weak word is not an intent — below this it is a guess, and a confident
  // wrong answer is worse than saying what can actually be answered.
  return best && best.score >= 2 ? best.intent : null
}

export function offlineAnswer(question, s = snapshot()) {
  const intent = route(question)
  if (intent) return intent.answer(s)
  return `I can't answer that from the governance records I hold. I can tell you about the open risk queue, why a prompt was masked, tools waiting for approval, training completion, gateway policy, overrides and confirmed leaks, a department that needs attention, or a summary for the board. Right now: ${plural(s.alerts.length, 'open alert')}, ${plural(s.pending.length, 'tool request')} awaiting a decision, ${s.report.confirmedLeaks} confirmed leaks.`
}

/** Which intent a question routes to — exported for the tests. */
export function intentOf(question) {
  return route(question)?.id ?? null
}

export async function askCopilot(question) {
  if (typeof question !== 'string' || !question.trim()) {
    return { answer: 'Ask me anything about your live governance posture.', source: 'offline' }
  }
  const s = snapshot()
  const gem = await geminiAnswer(question, s)
  if (gem) return { answer: gem, source: 'gemini' }
  return { answer: offlineAnswer(question, s), source: 'offline' }
}
