// Layer 2 detection — person names and other context-dependent PII that regex
// can't catch (proposal §4). Primary: Gemini API (needs GEMINI_API_KEY in .env,
// free key from https://aistudio.google.com). Fallback: a small context-word
// heuristic so the demo still masks obvious names offline — the response is
// labelled 'gemini' or 'heuristic' so we never pretend the fallback is AI.
import { maskPrompt } from './detector.js'

// Flash-lite is fast (~1s), cheap and has the highest free-tier quota — ideal for
// a demo where several people hit the gateway at once — and it extracts names as
// well as the bigger models. The retired `gemini-2.5-flash` 404s for new keys and
// the thinking `gemini-flash-latest` alias takes ~4s (it tripped the old timeout).
// Override with GEMINI_MODEL in .env if you want a specific one.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
const GEMINI_TIMEOUT_MS = 8000

async function geminiDetectNames(text) {
  const key = process.env.GEMINI_API_KEY
  if (!key || key === 'your-gemini-key') return null

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`
  const body = {
    contents: [{
      parts: [{
        text: `Extract every person name (customers, colleagues, any individual) that appears verbatim in the text below. Respond with ONLY a JSON array of the exact name strings, e.g. ["Lim","Sarah Tan"]. If there are none, respond with [].\n\nText:\n${text}`,
      }],
    }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
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
    // Join every text part — a thinking model can return a "thought" part before
    // the answer, so parts[0] is not always the JSON we asked for.
    const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('')
    const names = JSON.parse(raw)
    return Array.isArray(names) ? names.filter(n => typeof n === 'string' && n.length > 1) : null
  } catch {
    return null // network/quota/parse problems all degrade to the heuristic
  } finally {
    clearTimeout(timer)
  }
}

// Offline fallback for person names. Presidio uses an NER model to decide
// "is this capitalised span a PERSON or not"; with no model on-device we
// approximate that decision lexically. Three sources propose candidates and one
// filter (below) accepts or rejects them:
//
//   Source 1 (person frame): a capitalised word right after a title/role noun or
//     an interpersonal verb — "Encik Ahmad", "email Sarah", "notify Xavier".
//   Source 2 (gazetteer): a capitalised sequence containing a known name token —
//     "Rahman reported…", "Tan Wei Ming asked…".
//   Source 3 (multi-word): any run of 2+ capitalised words — this is what catches
//     an arbitrary name with no context and not in the gazetteer, "John Smith".
//
// The filter is what keeps Source 3 from masking "Meeting Room" or "Google
// Sheets": a candidate is rejected if every token is an ordinary English word or
// a known product/term (NON_NAME). Leading/trailing non-name words are trimmed
// ("Dear Sarah" → "Sarah"), and a single leftover word is only kept when it is
// in the gazetteer or sat right after a person frame — so a lone capitalised
// word like "Explain" or "SQL" is never invented into a name.
const TITLES_ROLES = [
  'customer', 'client', 'colleague', 'employee', 'candidate', 'patient',
  'applicant', 'vendor', 'supplier', 'buyer', 'tenant', 'guest',
  'mr', 'mrs', 'ms', 'miss', 'mdm', 'madam', 'dr', 'prof', 'sir',
  'encik', 'puan', 'cik', 'tuan', 'datuk', 'dato', 'datin', 'haji', 'hajah',
]
// Verbs whose object is a person. Safe to include now that the NON_NAME filter
// drops "Contact Support" / "Email Marketing" (support, marketing are ordinary
// words) while keeping "Contact Sarah" / "Email Xavier".
const PERSON_VERBS = [
  'contact', 'email', 'call', 'message', 'notify', 'inform', 'remind', 'meet',
  'reply', 'tell', 'ask', 'greet', 'thank', 'escalate', 'assist', 'text',
  'invite', 'ping', 'phone', 'whatsapp', 'dm', 'cc',
]
// Distinctly-name tokens: Malay, Chinese and Indian given names and surnames
// common in Malaysia. Gives high recall on local names and lets a single-word
// name ("Rahman") be masked on its own.
const NAME_GAZETTEER = new Set([
  'lim', 'tan', 'lee', 'wong', 'ng', 'chan', 'chai', 'chin', 'chong', 'chow',
  'goh', 'khoo', 'koh', 'lau', 'liew', 'loh', 'ong', 'phua',
  'teo', 'toh', 'yap', 'yeap', 'yeo', 'yong', 'wei', 'ming',
  'kai', 'kaw', 'peiyin', 'pei', 'yin', 'xin', 'mei', 'wen', 'jia', 'hui',
  'ahmad', 'ali', 'aminah', 'aisyah', 'aisha', 'azman', 'faiz', 'faizal', 'hafiz',
  'hassan', 'ibrahim', 'ikhlas', 'ismail', 'kamal', 'muhammad', 'mohd',
  'nurul', 'rahman', 'rashid', 'razak', 'siti', 'zaki', 'zainab', 'zulkifli',
  'aziz', 'karim', 'yusof', 'yusuf', 'abdullah', 'hakim',
  'kumar', 'priya', 'raj', 'ravi', 'suresh', 'devi', 'anand', 'ganesh',
  'muthu', 'nadarajah', 'ramasamy', 'letchumi',
  'sarah', 'samantha', 'daniel', 'jason', 'kevin', 'aaron', 'nadia',
])
// The negative signal — ordinary English words plus product/tech/business terms
// that are frequently capitalised. A capitalised span made only of these is not a
// person. This list is the offline stand-in for what an NER model would "know".
const NON_NAME = new Set([
  // function words / pronouns / determiners
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'to', 'from', 'with', 'for',
  'of', 'in', 'on', 'at', 'by', 'as', 'is', 'are', 'was', 'were', 'be', 'this',
  'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'you',
  'your', 'our', 'he', 'she', 'his', 'her', 'my', 'us', 'who', 'what', 'when',
  'where', 'why', 'how', 'which', 'not', 'no', 'yes', 'do', 'does', 'did', 'will',
  'would', 'can', 'could', 'should', 'may', 'might', 'must', 'have', 'has', 'had',
  'get', 'got', 'make', 'made', 'dear', 'hi', 'hello', 'please', 'thanks', 'regards',
  // common verbs seen at sentence start
  'explain', 'summarise', 'summarize', 'draft', 'write', 'review', 'create',
  'update', 'send', 'list', 'plan', 'book', 'outline', 'compare', 'describe',
  'define', 'suggest', 'give', 'show', 'tell', 'help', 'build', 'check', 'set',
  'add', 'remove', 'find', 'search', 'track', 'order', 'call', 'email', 'contact',
  'meet', 'reply', 'notify', 'inform', 'remind', 'escalate', 'assist', 'increase',
  'reduce', 'charge', 'refund', 'verify', 'close', 'open', 'rotate', 'connect',
  'prepare', 'schedule', 'confirm', 'cancel', 'approve', 'reject', 'draft',
  // business / product / tech nouns
  'meeting', 'room', 'report', 'sales', 'marketing', 'support', 'success',
  'customer', 'client', 'vendor', 'supplier', 'account', 'invoice', 'team',
  'board', 'form', 'portal', 'platform', 'system', 'service', 'services',
  'manager', 'department', 'group', 'project', 'product', 'policy', 'agreement',
  'contract', 'budget', 'revenue', 'forecast', 'data', 'privacy', 'security',
  'machine', 'learning', 'cloud', 'server', 'database', 'code', 'file', 'files',
  'document', 'documents', 'page', 'pages', 'slide', 'slides', 'phone', 'card',
  'number', 'serial', 'parcel', 'box', 'week', 'month', 'day', 'today',
  'tomorrow', 'quarter', 'morning', 'afternoon', 'evening', 'login', 'password',
  'token', 'config', 'repo', 'repository', 'branch', 'build', 'deploy', 'test',
  'tests', 'bug', 'feature', 'version', 'release', 'workshop', 'standup',
  'retrospective', 'agenda', 'checklist', 'template', 'campaign', 'strategy',
  'onboarding', 'feedback', 'journey', 'experience', 'relations', 'care',
  'center', 'centre', 'office', 'company', 'business', 'enterprise', 'staff',
  'people', 'person', 'user', 'users', 'admin', 'role', 'level', 'alert', 'risk',
  'audit', 'compliance', 'governance', 'framework', 'control', 'summary',
  'overview', 'dashboard', 'directory', 'profile', 'gateway', 'detection',
  'tool', 'tools', 'model', 'models', 'licence', 'license', 'training', 'module',
  'operating', 'procedure', 'standard', 'native', 'visual', 'studio', 'legal',
  'finance', 'engineering', 'operations', 'hr', 'it', 'ceo', 'cto', 'nda',
  // days / months (frequently capitalised, not people)
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  // product / brand / acronym terms
  'sql', 'nosql', 'rest', 'graphql', 'https', 'http', 'api', 'aws', 'azure',
  'gcp', 'react', 'vue', 'angular', 'node', 'java', 'python', 'javascript',
  'typescript', 'google', 'microsoft', 'apple', 'amazon', 'github', 'docker',
  'kubernetes', 'linux', 'windows', 'mac', 'chrome', 'firefox', 'excel', 'word',
  'sheets', 'docs', 'drive', 'slack', 'zoom', 'teams', 'jira', 'figma', 'gemini',
  'chatgpt', 'openai', 'presidio', 'firebase', 'vercel', 'mysql', 'postgres',
  'postgresql', 'redis', 'mongodb', 'jwt', 'pdpa', 'nist', 'gdpr', 'eu', 'us',
  'uk', 'my', 'rm', 'myr', 'usd', 'sgd', 'web', 'app', 'apps', 'vs', 'ui',
  'ux', 'qa', 'faq', 'id', 'ci', 'cd', 'pr', 'db', 'saas',
])
// Frame words are never part of the name itself — a capitalised "Ask"/"Mr" at a
// sentence start would otherwise be swallowed into "Ask Priya" / "Mr John Smith".
for (const w of [...TITLES_ROLES, ...PERSON_VERBS]) NON_NAME.add(w)
const isNonName = t => NON_NAME.has(t.toLowerCase())
const inGazetteer = t => NAME_GAZETTEER.has(t.toLowerCase())

const NAME_PART = '(?:[A-Z][a-z]+|[A-Z]{2,})'
// A run of 1–4 capitalised words, e.g. "Tan Wei Ming".
const CAP_SEQUENCE = new RegExp(`\\b${NAME_PART}(?:\\s${NAME_PART}){0,3}\\b`, 'g')
// A person frame: title/role/verb immediately before a capitalised run. The
// frame word matches either case ("email"/"Email"); NAME_PART stays capital-only
// (no `i` flag), so the capture cannot run on into the lowercase words after the
// name — "Email Sarah about it" captures "Sarah", not "Sarah about it".
const FRAME_WORD = [...TITLES_ROLES, ...PERSON_VERBS]
  .map(w => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`)
  .join('|')
const FRAME = new RegExp(
  `\\b(?:${FRAME_WORD})\\.?\\s+(${NAME_PART}(?:\\s${NAME_PART}){0,2})`,
  'g'
)

// Accept or reject a candidate span, returning the trimmed name or null.
function refineName(seq, framed) {
  let tokens = seq.split(/\s+/)
  while (tokens.length && isNonName(tokens[0])) tokens.shift()
  while (tokens.length && isNonName(tokens[tokens.length - 1])) tokens.pop()
  if (!tokens.length) return null
  const hasGaz = tokens.some(inGazetteer)
  // A lone leftover word is only a name if the gazetteer knows it or a person
  // frame introduced it — otherwise "SQL", "Java", "Report" would be masked.
  if (tokens.length === 1 && !hasGaz && !framed) return null
  return tokens.join(' ')
}

function heuristicDetectNames(text) {
  const names = new Set()
  // Source 1 — person frame (framed candidates may be a single word).
  for (const m of text.matchAll(FRAME)) {
    const name = refineName(m[1], true)
    if (name) names.add(name)
  }
  // Sources 2 & 3 — every capitalised run; kept if it holds a gazetteer token
  // (any length) or is multi-word and not entirely ordinary/product words.
  for (const m of text.matchAll(CAP_SEQUENCE)) {
    const seq = m[0]
    const tokens = seq.split(/\s+/)
    const framed = tokens.some(inGazetteer) // gazetteer lets a single word through
    if (framed || tokens.length >= 2) {
      const name = refineName(seq, framed)
      if (name) names.add(name)
    }
  }
  return [...names]
}

/**
 * Layer 2 only: detect person names in the original text.
 * @returns {{ names: string[], source: 'gemini'|'heuristic' }}
 */
export async function detectNames(text) {
  const gemini = await geminiDetectNames(text)
  if (gemini) return { names: gemini, source: 'gemini' }
  return { names: heuristicDetectNames(text), source: 'heuristic' }
}

/**
 * Mask a list of names inside already Layer-1-masked text.
 * @returns {{ masked: string, count: number }}
 */
export function maskNames(masked, names) {
  let count = 0
  // Longest names first, so "Tan Wei Ming" is masked as one span before the
  // single-token "Tan" pass could break it into "[MASKED-NAME] Wei Ming".
  const ordered = [...new Set(names)].sort((a, b) => b.length - a.length)
  for (const name of ordered) {
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
    const hits = masked.match(pattern)
    if (hits) {
      count += hits.length
      masked = masked.replace(pattern, '[MASKED-NAME]')
    }
  }
  return { masked, count }
}

/**
 * Full two-layer scan: Layer 1 regex, then Layer 2 names.
 * @returns {{ masked: string, detections: {type,count}[], layer2: 'gemini'|'heuristic'|'none' }}
 */
export async function maskPromptFull(text) {
  const layer1 = maskPrompt(text)
  const detections = [...layer1.detections]

  // Layer 2 receives the already-masked text, not the raw prompt — see the same
  // rule in server.js /api/detect.
  const { names, source } = await detectNames(layer1.masked)
  const { masked, count } = maskNames(layer1.masked, names)
  if (count > 0) detections.push({ type: 'NAME', count })

  return { masked, detections, layer2: count > 0 ? source : 'none' }
}
