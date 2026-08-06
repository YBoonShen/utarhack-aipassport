// Layer 2 detection — person names and other context-dependent PII that regex
// can't catch (proposal §4). Primary: Gemini API (needs GEMINI_API_KEY in .env,
// free key from https://aistudio.google.com). Fallback: a small context-word
// heuristic so the demo still masks obvious names offline — the response is
// labelled 'gemini' or 'heuristic' so we never pretend the fallback is AI.
import { maskPrompt } from './detector.js'

// Flash-lite is fast (~0.8s), cheap and has the highest free-tier quota — ideal
// for a demo where several people hit the gateway at once — and it extracts
// names as well as the bigger models. Flash proper measures ~1.7s on the same
// prompt, which is a long time to hold up somebody's typing for no better
// answer. Override with GEMINI_MODEL in .env if you want a specific one.
//
// The version moves, and it moves *silently*: a retired model answers 404 and
// this layer degrades to the heuristic exactly as designed, so a key that is
// perfectly valid looks like a key that does not work. `gemini-2.5-flash` went
// first; `gemini-2.5-flash-lite` followed, and it is the worse trap of the two
// because ListModels still returns it — it is only generateContent that
// refuses, with "no longer available to new users". If Layer 2 or the report's
// executive summary quietly stops using the model, check this line first:
//
//   curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
//
// Exported because the compliance report's summary writer calls the same API.
// Two copies of this constant is how both of them broke on the same retirement.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
const GEMINI_TIMEOUT_MS = 8000

// ---- staying inside a free key's quota ---------------------------------------
//
// The extension checks the prompt while the employee types — once per pause —
// and again when they press send. On a free key (20 requests a minute) that
// spends the whole quota inside one paragraph, and every call after it comes
// back 429. The layer then does exactly what it is designed to do and degrades
// to the heuristic, silently, which is why the AI layer looked like it was "not
// working" while the key was perfectly valid.
//
// Two bounded fixes, both about not making a call that cannot help:
//
//   a result cache, keyed on the exact text — the send-time check asks about the
//     same string the preview just asked about, so it costs nothing;
//   a cooldown — one 429 means the next few seconds are 429 too, so the layer
//     stops asking instead of spending a request and an 8s timeout finding out.
const CACHE_MAX = 200
const CACHE_TTL_MS = 5 * 60_000
const COOLDOWN_MS = 60_000
const cache = new Map() // text -> { at, names }
let quotaBlockedUntil = 0

function cacheGet(text) {
  const hit = cache.get(text)
  if (!hit) return undefined
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(text)
    return undefined
  }
  // Re-inserting moves it to the end, so the eviction below drops the coldest.
  cache.delete(text)
  cache.set(text, hit)
  return hit.names
}

function cacheSet(text, names) {
  cache.set(text, { at: Date.now(), names })
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
}

/** Test seam: forget everything this process learned from the API. */
export function resetGeminiCache() {
  cache.clear()
  quotaBlockedUntil = 0
}

async function geminiDetectNames(text) {
  const key = process.env.GEMINI_API_KEY
  if (!key || key === 'your-gemini-key') return null

  const cached = cacheGet(text)
  if (cached) return cached
  if (Date.now() < quotaBlockedUntil) return null

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`
  // The model is asked for *spans as written*, not for tidied-up names. Two of
  // these rules exist because of real failures: a model left to itself returns
  // "Lim Meng Meng" for text that says "lim MeNg Meng" (title-casing it), and
  // splits a full name into one entry per word. Both used to leave part of the
  // name in the prompt — see maskNames, which now forgives the first and merges
  // the second rather than trusting the model to get either right.
  const body = {
    contents: [{
      parts: [{
        text: `Find every person name (customers, colleagues, any individual) in the text below.

Rules:
- Copy each name EXACTLY as it appears, character for character, keeping its original capitalisation. Names may be written in lower case, UPPER CASE or MiXeD case — report them as written.
- Return each person's full name as ONE entry: "lim MeNg Meng" is one name, not three.
- Do not include titles or roles (Mr, Encik, customer, manager) in the name itself.
- Do not report company, product, place or day names.

Respond with ONLY a JSON array of the name strings, e.g. ["lim MeNg Meng","Sarah Tan"]. If there are none, respond with [].

Text:
${text}`,
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
    if (!res.ok) {
      // 429 (quota) and 503 (overloaded) are both "come back later". Asking again
      // on the next keystroke wastes the employee's time, not just the quota.
      if (res.status === 429 || res.status === 503) quotaBlockedUntil = Date.now() + COOLDOWN_MS
      return null
    }
    const data = await res.json()
    // Join every text part — a thinking model can return a "thought" part before
    // the answer, so parts[0] is not always the JSON we asked for.
    const raw = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const names = parsed.filter(n => typeof n === 'string' && n.trim().length > 1)
    cacheSet(text, names)
    return names
  } catch {
    return null // network/timeout/parse problems all degrade to the heuristic
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
//   Source 4 (any case): a run of 2+ word-tokens containing a gazetteer name,
//     whatever their capitalisation — "lim meng meng", "lim MeNg MeNg". Nobody
//     capitalises reliably when they are typing fast, and the three sources above
//     all read capitalisation as the signal that something is a name at all, so
//     an irregularly-cased name was invisible to every one of them.
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
  // Ordinary lower-case words that only matter to Source 4. The three
  // capitalisation-based sources never saw these — a lower-case word could not
  // start or extend a candidate — but a case-blind pass walks straight through
  // them, so "Kumar still" and "lim again" would be masked as names without
  // this. They are stop-words, not name patterns: the list says what a person is
  // *not*, which is the side of the decision it is safe to be wrong about.
  'still', 'again', 'before', 'after', 'soon', 'later', 'yesterday', 'now',
  'then', 'here', 'there', 'back', 'also', 'just', 'only', 'very', 'more',
  'most', 'some', 'any', 'all', 'each', 'both', 'same', 'other', 'next', 'last',
  'first', 'new', 'old', 'asap', 'via', 'per', 'due', 'ok', 'okay', 'one',
  'two', 'three', 'many', 'few', 'less', 'well', 'much', 'too', 'out', 'up',
  'down', 'over', 'under', 'into', 'than', 'while', 'since', 'until', 'during',
  'between', 'within', 'without', 'across', 'around', 'because', 'such', 'own',
  'about', 'above', 'below', 'off', 'once', 'ever', 'never', 'always', 'often',
  'noon', 'night', 'today', 'tonight', 'time', 'date', 'urgent', 'asap',
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

// ---- source 4: names whose capitalisation tells us nothing ------------------
//
// Sources 1–3 all use a capital letter as the signal that a word might be a
// name. Employees type "lim meng meng" and "lim MeNg MeNg", and to those three
// sources those strings contain no name at all — which is how a prompt with a
// customer's name in it reached an AI tool untouched.
//
// This pass drops capitalisation as evidence, so it needs a different anchor:
// a run of word-tokens is only a candidate when the gazetteer recognises one of
// them. Everything else is about not over-reaching from that anchor:
//
//   - a run stops at any stop-word, so "lim by tomorrow" ends at "lim";
//   - a lower-case token that looks like an inflected English word ("flagged",
//     "needs", "quickly") cannot extend a run, which is what keeps "Rahman
//     flagged" from becoming a name;
//   - a run of one lower-case word is not enough on its own — "the tan lines"
//     must not mask "tan" — unless a person frame introduced it ("email lim").
//
// Capitalised single tokens keep the behaviour they already had.

// Word tokens only. Runs are joined by spaces/tabs, never by punctuation or a
// line break: "Lim, Tan" and a two-line list are two names, not one.
const WORD = /[A-Za-z][A-Za-z'’-]*/g
const RUN_GAP = /^[ \t]+$/
// Endings that make a lower-case word an ordinary English one rather than a
// name part. A morphology rule, not a word list — it generalises to inflections
// nobody thought to enumerate.
const INFLECTED = /(?:ed|ing|ly|es|s|tion|sion|ment|ness|ous|ful|able|ible|est|ise|ize)$/
const MAX_RUN = 4

// Layer 1 has already run, so the text can hold [MASKED-IC] and friends. Blanked
// to spaces (not removed) so every offset still points at the original string.
const blankTokens = text => text.replace(/\[MASKED-[A-Z-]+\]/g, m => ' '.repeat(m.length))

const FRAME_WORDS = new Set([...TITLES_ROLES, ...PERSON_VERBS])

// Can this word sit inside a name when its capitalisation proves nothing?
function nameEligible(word) {
  if (word.length < 2 || word.length > 15) return false
  if (inGazetteer(word)) return true // a known name token, whatever its case
  if (isNonName(word)) return false
  if (/^[A-Z]/.test(word)) return true // capitalised: sources 1–3 already trust this
  return !INFLECTED.test(word.toLowerCase())
}

function caseBlindNames(text) {
  const scan = blankTokens(text)
  const tokens = [...scan.matchAll(WORD)].map(m => ({ word: m[0], start: m.index, end: m.index + m[0].length }))
  const names = []

  let i = 0
  while (i < tokens.length) {
    if (!nameEligible(tokens[i].word)) { i++; continue }
    // Extend while each next token is eligible and only whitespace separates it.
    let j = i
    while (
      j + 1 < tokens.length &&
      j + 1 - i < MAX_RUN &&
      nameEligible(tokens[j + 1].word) &&
      RUN_GAP.test(scan.slice(tokens[j].end, tokens[j + 1].start))
    ) j++

    const run = tokens.slice(i, j + 1)
    const before = tokens[i - 1]
    const framed = Boolean(
      before &&
      FRAME_WORDS.has(before.word.toLowerCase()) &&
      /^[ \t.]+$/.test(scan.slice(before.end, run[0].start))
    )
    const anchored = run.some(t => inGazetteer(t.word))
    const enough = run.length >= 2 || framed || /^[A-Z]/.test(run[0].word)
    if (anchored && enough) names.push(text.slice(run[0].start, run[run.length - 1].end))
    i = j + 1
  }
  return names
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
  // Source 4 — the same names written without the capitals.
  for (const name of caseBlindNames(text)) names.add(name)
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

// ---- turning detected names into masked spans -------------------------------
//
// A detector names a person; this decides which characters get replaced. Keeping
// the two apart is what makes masking deterministic, because a detector — the
// API especially — does not hand back the exact substring it found:
//
//   - it title-cases what it read, answering "Lim Meng Meng" for "lim MeNg Meng";
//   - it normalises the spacing between the parts;
//   - it sometimes splits one person into several entries, "Lim" and "Meng Meng".
//
// Matching those answers back literally is what produced a half-masked prompt
// like "lim [MASKED-NAME]": the entry that matched was replaced and the entry
// that had been re-cased silently matched nothing. So each name is located
// case-insensitively, the located ranges are merged, and a range is replaced
// whole. Once a span is identified the replacement is a slice, not a search:
// the same input always produces the same output.

const NAME_TOKEN = '[MASKED-NAME]'
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Where `name` appears in `text`, forgiving the two things a detector changes
 * legitimately: letter case, and how much whitespace sits between the parts.
 */
function namePattern(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean).map(escapeRe)
  if (!parts.length) return null
  // \b only means anything next to a word character, and a name can end in "." or "'".
  const lead = /^\w/.test(name.trim()) ? '\\b' : ''
  const tail = /\w$/.test(name.trim()) ? '\\b' : ''
  return new RegExp(`${lead}${parts.join('\\s+')}${tail}`, 'gi')
}

const placeholderRanges = text =>
  [...text.matchAll(/\[MASKED-[A-Z-]+\]/g)].map(m => [m.index, m.index + m[0].length])

/**
 * The character ranges in `text` that the detected names occupy, merged.
 *
 * Ranges that overlap, touch, or are separated only by the space between two
 * parts of one person's name become a single range — which is what turns
 * ["Lim","Meng Meng"] into one `[MASKED-NAME]` instead of two adjacent ones.
 * Ranges landing inside a Layer 1 token are dropped: "[MASKED-IC]" is not a
 * person, whatever a detector thought it saw in there.
 *
 * @returns {[number, number][]} sorted, non-overlapping, ascending
 */
export function nameSpans(text, names) {
  const unique = [...new Set((names || []).map(n => String(n || '').trim()))]
    .filter(n => n.length > 1)
  const blocked = placeholderRanges(text)
  const found = []

  for (const name of unique) {
    const pattern = namePattern(name)
    if (!pattern) continue
    for (const m of text.matchAll(pattern)) {
      const start = m.index
      const end = start + m[0].length
      if (end === start) continue
      if (blocked.some(([bs, be]) => start < be && end > bs)) continue
      found.push([start, end])
    }
  }

  // Longest first at the same start, so a containing span absorbs the ones inside it.
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged = []
  for (const [start, end] of found) {
    const last = merged[merged.length - 1]
    const adjacent = last && /^[ \t]{1,2}$/.test(text.slice(last[1], start))
    if (last && (start <= last[1] || adjacent)) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

/**
 * Mask a list of names inside already Layer-1-masked text.
 * @returns {{ masked: string, count: number }}
 */
export function maskNames(masked, names) {
  const spans = nameSpans(masked, names)
  let out = masked
  // Right to left, so every remaining offset is still the offset it was measured at.
  for (let i = spans.length - 1; i >= 0; i--) {
    out = out.slice(0, spans[i][0]) + NAME_TOKEN + out.slice(spans[i][1])
  }
  return { masked: out, count: spans.length }
}

/**
 * Layer 2 end to end on already-Layer-1-masked text: detect, then mask.
 *
 * The retry is the one thing this adds over calling the two in sequence. A name
 * the API reports but that cannot be located — a reformatted span, or one it
 * invented — masks nothing at all, and answering "gemini" while handing back an
 * untouched prompt is the worst of both layers. So a zero-span API answer is
 * treated as no answer and the offline heuristic gets its pass.
 *
 * @returns {{ masked: string, count: number, source: 'gemini'|'heuristic'|'none' }}
 */
export async function maskNamesIn(text) {
  const { names, source } = await detectNames(text)
  let result = maskNames(text, names)
  let used = source

  if (result.count === 0 && source === 'gemini') {
    const retry = maskNames(text, heuristicDetectNames(text))
    if (retry.count > 0) {
      result = retry
      used = 'heuristic'
    }
  }
  return { ...result, source: result.count > 0 ? used : 'none' }
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
  const { masked, count, source } = await maskNamesIn(layer1.masked)
  if (count > 0) detections.push({ type: 'NAME', count })

  return { masked, detections, layer2: source }
}
