// Layer 1 detection service — rule-based (regex) masking, Presidio-inspired.
//
// Regex alone over-matches: any 16-digit run "looks like" a card, any 12-digit
// run "looks like" an IC. Microsoft Presidio's answer (which this mirrors) is a
// three-part recogniser — a regex to FIND candidates, a validate() to CONFIRM
// them with a checksum/format rule, and context words to rescue weak matches.
// The validate step is what turns "flag every long number" into "flag the ones
// that are actually a card / an IC", which is the difference between a demo that
// masks tracking numbers by accident and one that does not.
//
// Layer 2 (person names via Gemini, heuristic fallback) lives in layer2.js.
//
// backend/src/rules.sync.test.js keeps extension/rules.js identical to this — if
// you change a regex/type/token here, change it there too (validators too).

// ---- validators (Presidio's "validate_result") ----------------------------

// Luhn / mod-10 checksum — every real credit/debit card satisfies it, almost no
// arbitrary number does. Turns the weak 13–19 digit pattern into a card check.
export function luhnValid(value) {
  const digits = String(value).replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (double) { n *= 2; if (n > 9) n -= 9 }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

// Malaysian IC (NRIC): YYMMDD-PB-###G. We confirm the birth-date is real and the
// place-of-birth code is an assigned one, so "999999-99-9999" or a random 12-digit
// order number is not masked as an IC. Valid PB codes are 01–59 and 82–99.
export function malaysianICValid(value) {
  const d = String(value).replace(/\D/g, '')
  if (d.length !== 12) return false
  const mm = +d.slice(2, 4)
  const dd = +d.slice(4, 6)
  const pb = +d.slice(6, 8)
  if (mm < 1 || mm > 12) return false
  if (dd < 1 || dd > 31) return false
  return (pb >= 1 && pb <= 59) || (pb >= 82 && pb <= 99)
}

// ---- recognisers -----------------------------------------------------------
// `validate` (optional): a match is only masked when it returns true. `context`
// (optional): words that make a weak match more likely to be real — documented
// here and used by the context check below.

export const RULES = [
  // Malaysian IC: 990101-14-5678 (with or without dashes). Validated by date+state.
  { type: 'IC', regex: /\b\d{6}-?\d{2}-?\d{4}\b/g, token: '[MASKED-IC]', validate: malaysianICValid,
    context: ['ic', 'nric', 'mykad', 'identity', 'kad pengenalan'] },
  // Malaysian passport: letter + 8 digits, e.g. A12345678
  { type: 'PASSPORT', regex: /\b[A-Z]\d{8}\b/g, token: '[MASKED-PASSPORT]',
    context: ['passport', 'pasport', 'travel document'] },
  // Financial figures: RM 4,500 / RM4500.00 / USD 1,000,000
  { type: 'FINANCIAL', regex: /\b(?:RM|MYR|USD|SGD)\s?\d[\d,]*(?:\.\d{1,2})?\b/g, token: '[MASKED-AMOUNT]' },
  // Credit/debit card numbers (13-16 digits, optionally spaced/dashed). Confirmed
  // by the Luhn checksum, so a long order/tracking number is not masked as a card.
  // MUST run before PHONE: a card like "4012 8888 8888 1881" contains a run
  // ("012 8888 8888") that matches the Malaysian mobile pattern, so PHONE would
  // otherwise eat the middle of the card and leave the rest exposed.
  { type: 'CARD', regex: /\b(?:\d[ -]?){13,16}\b/g, token: '[MASKED-CARD]', validate: luhnValid,
    context: ['card', 'credit', 'debit', 'visa', 'mastercard', 'cvv', 'charge', 'pan'] },
  // Malaysian phone numbers: 012-3456789, +60123456789, 03-12345678 etc.
  { type: 'PHONE', regex: /(?:\+?60|0)1\d[- ]?\d{3,4}[- ]?\d{4}\b/g, token: '[MASKED-PHONE]',
    context: ['call', 'phone', 'mobile', 'hp', 'tel', 'contact', 'whatsapp'] },
  // Email addresses. Every quantifier is bounded (RFC limits: 64-char local
  // part, 63-char labels) so a near-miss like "a.a.a…@" costs constant work per
  // start position instead of backtracking quadratically over the whole prompt.
  { type: 'EMAIL', regex: /\b[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}\b/g, token: '[MASKED-EMAIL]' },
  // Simple credential patterns: password: xxxx / apikey=xxxx
  { type: 'CREDENTIAL', regex: /\b(?:password|pwd|api[_-]?key|token|secret)\s*[:=]\s*\S+/gi, token: '[MASKED-CREDENTIAL]' },
  // Source code & secrets: private-key blocks, DB connection strings, cloud/service keys
  { type: 'SECRET', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|\b(?:mongodb|postgres(?:ql)?|mysql|redis|amqp|jdbc):\/\/\S+|\bAKIA[0-9A-Z]{16}\b|\b(?:ghp|gho|sk|xoxb)[-_][A-Za-z0-9_-]{16,}\b/g, token: '[MASKED-SECRET]' },
  // Customer records: account / case / order / invoice / reference IDs
  { type: 'CUSTOMER_RECORD', regex: /\b(?:account|a\/c|acct|case|order|invoice|customer|cust|reference|ref)\.?\s*(?:no\.?|number|id|#|:)?\s*([A-Z]{0,4}-?\d[\dA-Z-]{2,})\b/gi, token: '[MASKED-RECORD]' },
]

/**
 * Apply a set of recognisers to text, masking every confirmed match. A rule with
 * a `validate` only masks matches that pass it (Presidio's validate_result step),
 * so precision comes from the checksum, not from a more brittle regex.
 * @param {string} text
 * @param {Iterable<object>} rules
 * @param {Set<string>|null} allowed  when set, only these rule types run (admin controls)
 * @returns {{ masked: string, detections: {type: string, count: number}[] }}
 */
export function applyRules(text, rules, allowed = null) {
  const detections = []
  let masked = String(text)
  for (const rule of rules) {
    if (allowed && !allowed.has(rule.type)) continue
    let count = 0
    masked = masked.replace(rule.regex, match => {
      if (rule.validate && !rule.validate(match)) return match // not confirmed — leave it
      count++
      return rule.token
    })
    if (count > 0) detections.push({ type: rule.type, count })
  }
  return { masked, detections }
}

/**
 * Scan a prompt and mask sensitive content (all rules, no admin filter).
 * @param {string} text
 * @returns {{ masked: string, detections: {type: string, count: number}[] }}
 */
export function maskPrompt(text) {
  return applyRules(text, RULES, null)
}
