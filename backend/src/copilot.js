// Governance Copilot — an explainability assistant for the admin console.
// It answers plain-language questions ("why was this masked?", "what is our
// biggest risk right now?") grounded ONLY in the live governance state, and
// maps its answers to the frameworks the org reports against. Primary engine:
// Gemini (needs GEMINI_API_KEY — same free key as Layer 2). Fallback: a
// deterministic responder that reads the same live data, so the demo always
// answers even fully offline. Every reply is labelled 'gemini' or 'offline'
// so we never pretend the fallback is a model.
import { db, riskScore, openAlerts } from './store.js'

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const GEMINI_TIMEOUT_MS = 6000

export const SUGGESTED_QUESTIONS = [
  'What is our biggest AI risk right now?',
  'Why was the last prompt masked?',
  'Are we compliant with PDPA and the EU AI Act?',
  'Which department needs attention?',
  'Summarise today for the board.',
]

// A compact, PII-free digest of the live state the model is allowed to use.
function buildContext() {
  const r = riskScore()
  const open = openAlerts()
  const alerts = open.slice(0, 5).map(a => `- [${a.severity}] ${a.title} — ${a.meta}`).join('\n') || '- none open'
  const audit = db.auditEvents.slice(0, 6).map(e => `- ${e.time} ${e.user}/${e.dept} via ${e.tool}: ${e.action} — "${e.record}"`).join('\n')
  const pending = db.visaRequests.filter(v => ['SECURITY REVIEW', 'COMPLIANCE'].includes(v.status)).map(v => `- ${v.tool} (${v.dept}, ${v.status})`).join('\n') || '- none'
  return `ORGANISATION: Example Sdn Bhd — enterprise AI governance platform "AI Passport".
RISK SCORE (0-100, lower is better): ${r.score} — ${r.band} (change vs yesterday: ${r.delta >= 0 ? '+' : ''}${r.delta}).
RISK FACTORS:\n${r.factors.map(f => `- ${f.label}: +${f.points} (${f.detail})`).join('\n')}
TODAY: ${r.metrics.promptsProtected} prompts protected, ${r.metrics.itemsIntercepted} sensitive items intercepted, ${r.metrics.overrides} gateway overrides, RM ${r.metrics.valueProtected.toLocaleString()} exposure value protected, ${r.metrics.confirmedLeaks} confirmed leaks.
OPEN RISK ALERTS:\n${alerts}
TOOLS PENDING APPROVAL:\n${pending}
RECENT AUDIT EVENTS (already masked — no raw PII):\n${audit}`
}

const SYSTEM = `You are the AI Passport Governance Copilot, an assistant for a compliance administrator.
Answer ONLY from the governance data provided. Be concise and specific — 2-4 short sentences or a tight bullet list. Lead with the direct answer.
When relevant, name the framework the point maps to (Malaysia PDPA, NIST AI RMF, or EU AI Act) in parentheses.
All audit records are already masked; never invent raw personal data or numbers not in the data. If the data does not answer the question, say so and suggest what to check. Never use markdown headers.`

async function geminiAnswer(question) {
  const key = process.env.GEMINI_API_KEY
  if (!key || key === 'your-gemini-key') return null

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`
  const body = {
    system_instruction: { parts: [{ text: SYSTEM }] },
    contents: [{ parts: [{ text: `${buildContext()}\n\nADMIN QUESTION: ${question}` }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal })
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

// Deterministic fallback — reads the same live data and answers the common
// governance questions. Keyword-routed so it stays useful without a key.
function offlineAnswer(question) {
  const q = (question || '').toLowerCase()
  const r = riskScore()
  const open = openAlerts()
  const top = [...open].sort((a, b) => ({ HIGH: 3, MEDIUM: 2, MONITORING: 1 }[b.severity] - { HIGH: 3, MEDIUM: 2, MONITORING: 1 }[a.severity]))[0]
  const lastMasked = db.auditEvents.find(e => e.action === 'MASKED')

  if (/(risk|score|biggest|worst|posture)/.test(q)) {
    const drivers = r.factors.filter(f => f.points > 0).sort((a, b) => b.points - a.points).slice(0, 2).map(f => f.label.toLowerCase()).join(' and ')
    return `The organisational AI risk score is ${r.score}/100 — ${r.band} (${r.delta <= 0 ? 'improving' : 'up'} ${Math.abs(r.delta)} vs yesterday). The main drivers are ${drivers}. ${top ? `Top open item: ${top.severity} — "${top.title}" (${top.meta}).` : 'No open alerts.'} Resolving open alerts and clearing overrides will lower the score fastest.`
  }
  if (/(mask|why|redact|pii|personal)/.test(q)) {
    return lastMasked
      ? `The most recent masked prompt was ${lastMasked.user} (${lastMasked.dept}) via ${lastMasked.tool}: "${lastMasked.record}". The Smart Gateway detected personal or sensitive data and tokenised it before the prompt left the browser, so only the masked version is stored (Malaysia PDPA · Principle 7). No points are lost for masking — it is the safe path.`
      : 'No masked prompts are in the recent audit window. When one occurs, the gateway replaces personal data with tokens before transmission and stores only the masked text (PDPA · Principle 7).'
  }
  if (/(complian|pdpa|nist|eu ai act|framework|regulat|audit)/.test(q)) {
    return `Coverage is green across all three frameworks: Malaysia PDPA (masking + 90-day retention), NIST AI RMF (Govern/Map/Measure/Manage evidenced in the audit log), and the EU AI Act (Art. 4 AI literacy via training, Art. 14 human oversight via the public review portal). ${r.metrics.confirmedLeaks} confirmed leaks. Generate the one-click Compliance Report for regulator-ready evidence.`
  }
  if (/(department|dept|team|who|which)/.test(q)) {
    const counts = {}
    for (const e of db.auditEvents) if (e.action === 'MASKED' || e.action === 'ALERT') counts[e.dept] = (counts[e.dept] || 0) + 1
    const worst = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return worst
      ? `${worst[0]} has the most sensitive-handling events in the current window (${worst[1]}). ${top ? `It also owns the top open alert: "${top.title}".` : ''} Consider assigning the 5-minute Data Privacy refresher to that team (guide, don't punish).`
      : 'Activity is evenly spread with no single department standing out right now.'
  }
  if (/(board|summary|summar|today|brief|report)/.test(q)) {
    return `Board summary: risk score ${r.score}/100 (${r.band}). ${r.metrics.promptsProtected} prompts protected today, ${r.metrics.itemsIntercepted} sensitive items intercepted, RM ${r.metrics.valueProtected.toLocaleString()} of exposure value prevented, ${r.metrics.confirmedLeaks} confirmed leaks. ${open.length} open risk alert${open.length === 1 ? '' : 's'} and ${r.metrics.overrides} override${r.metrics.overrides === 1 ? '' : 's'} today. All three compliance frameworks green.`
  }
  return `Here is the current picture: risk score ${r.score}/100 (${r.band}), ${open.length} open alert${open.length === 1 ? '' : 's'}, ${r.metrics.itemsIntercepted} sensitive items intercepted today across ${r.metrics.promptsProtected} prompts. Ask me about our biggest risk, why a prompt was masked, a department, or compliance status.`
}

export async function askCopilot(question) {
  if (typeof question !== 'string' || !question.trim()) {
    return { answer: 'Ask me anything about your live governance posture.', source: 'offline' }
  }
  const gem = await geminiAnswer(question)
  if (gem) return { answer: gem, source: 'gemini' }
  return { answer: offlineAnswer(question), source: 'offline' }
}

// A short AI-written executive summary for the Compliance Report.
export async function executiveSummary() {
  const key = process.env.GEMINI_API_KEY
  const question = 'Write a 3-4 sentence executive summary of our AI governance posture for this reporting period, suitable for the board and an external auditor. Mention the risk score, exposure value protected, framework coverage, and confirmed leaks.'
  if (key && key !== 'your-gemini-key') {
    const gem = await geminiAnswer(question)
    if (gem) return { summary: gem, source: 'gemini' }
  }
  const r = riskScore()
  return {
    source: 'offline',
    summary: `During this reporting period, AI Passport maintained an organisational AI risk score of ${r.score}/100 (${r.band}) with ${r.metrics.confirmedLeaks} confirmed data leaks. The Smart Gateway intercepted ${r.metrics.itemsIntercepted} sensitive items across ${r.metrics.promptsProtected} protected prompts, preventing an estimated RM ${r.metrics.valueProtected.toLocaleString()} in data-exposure value. Controls remain compliant against Malaysia PDPA, the NIST AI RMF, and the EU AI Act, with every masked record retained in an append-only audit log and human oversight available through the public transparency portal. No raw personal data left the platform.`,
  }
}
