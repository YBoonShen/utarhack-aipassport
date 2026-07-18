// Layer 2 detection — person names and other context-dependent PII that regex
// can't catch (proposal §4). Primary: Gemini API (needs GEMINI_API_KEY in .env,
// free key from https://aistudio.google.com). Fallback: a small context-word
// heuristic so the demo still masks obvious names offline — the response is
// labelled 'gemini' or 'heuristic' so we never pretend the fallback is AI.
import { maskPrompt } from './detector.js'

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const GEMINI_TIMEOUT_MS = 4000

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
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
    const names = JSON.parse(raw)
    return Array.isArray(names) ? names.filter(n => typeof n === 'string' && n.length > 1) : null
  } catch {
    return null // network/quota/parse problems all degrade to the heuristic
  } finally {
    clearTimeout(timer)
  }
}

// Offline fallback: a capitalised word (or two) right after a person-context
// word — "customer Lim", "Encik Ahmad", "our colleague Sarah Tan". The context
// word matches either case ("ms"/"Ms"); the name itself must stay capitalised.
const CONTEXT_WORDS = ['customer', 'client', 'colleague', 'employee', 'candidate', 'patient', 'mr', 'mrs', 'ms', 'miss', 'dr', 'encik', 'puan', 'cik']
const NAME_PART = '(?:[A-Z][a-z]+|[A-Z]{2,})'
const CONTEXT = new RegExp(
  `\\b(?:${CONTEXT_WORDS.map(w => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`).join('|')})\\.?\\s+(${NAME_PART}(?:\\s${NAME_PART}){0,2})`,
  'g'
)

function heuristicDetectNames(text) {
  const names = new Set()
  for (const m of text.matchAll(CONTEXT)) names.add(m[1])
  return [...names]
}

/**
 * Full two-layer scan: Layer 1 regex, then Layer 2 names.
 * @returns {{ masked: string, detections: {type,count}[], layer2: 'gemini'|'heuristic'|'none' }}
 */
export async function maskPromptFull(text) {
  const layer1 = maskPrompt(text)
  let masked = layer1.masked
  const detections = [...layer1.detections]

  let names = await geminiDetectNames(text)
  const layer2 = names ? 'gemini' : 'heuristic'
  if (!names) names = heuristicDetectNames(text)

  let count = 0
  for (const name of names) {
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
    const hits = masked.match(pattern)
    if (hits) {
      count += hits.length
      masked = masked.replace(pattern, '[MASKED-NAME]')
    }
  }
  if (count > 0) detections.push({ type: 'NAME', count })

  return { masked, detections, layer2: count > 0 ? layer2 : 'none' }
}
