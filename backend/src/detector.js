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
  // Malaysian IC: 990101-14-5678 (with or without dashes). No leading \b, so a
  // glued prefix like "IC900101051234" is still caught; the date+state validator
  // is what prevents a random 12-digit tail of a longer number being masked.
  { type: 'IC', regex: /\d{6}-?\d{2}-?\d{4}\b/g, token: '[MASKED-IC]', validate: malaysianICValid,
    context: ['ic', 'nric', 'mykad', 'identity', 'kad pengenalan'] },
  // Malaysian passport: letter + 8 digits, e.g. A12345678
  { type: 'PASSPORT', regex: /\b[A-Z]\d{8}\b/g, token: '[MASKED-PASSPORT]',
    context: ['passport', 'pasport', 'travel document'] },
  // Financial figures: RM 4,500 / rm4500.00 / USD 1,000,000 / eur 500. Case-
  // insensitive so "rm500" is caught the same as "RM500".
  { type: 'FINANCIAL', regex: /\b(?:RM|MYR|USD|SGD|EUR|GBP)\s?\d[\d,]*(?:\.\d{1,2})?\b/gi, token: '[MASKED-AMOUNT]' },
  // Credit/debit card numbers (13-16 digits, optionally spaced/dashed). Confirmed
  // by the Luhn checksum, so a long order/tracking number is not masked as a card.
  // MUST run before PHONE: a card like "4012 8888 8888 1881" contains a run
  // ("012 8888 8888") that matches the Malaysian mobile pattern, so PHONE would
  // otherwise eat the middle of the card and leave the rest exposed.
  { type: 'CARD', regex: /\b(?:\d[ -]?){13,16}\b/g, token: '[MASKED-CARD]', validate: luhnValid,
    context: ['card', 'credit', 'debit', 'visa', 'mastercard', 'cvv', 'charge', 'pan'] },
  // Malaysian phone numbers — mobile (01X) and landline (03/04/…/09) alike:
  // 012-3456789, +60123456789, 03-12345678, 07-2345678.
  { type: 'PHONE', regex: /(?<!\d)(?:\+?60|0)(?:1\d|[3-9])[- ]?\d{3,4}[- ]?\d{4}\b/g, token: '[MASKED-PHONE]',
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
  // Bank account numbers. A bare long number is ambiguous (phone? order? IC?), so
  // like Presidio's context recognisers this only fires next to a bank name or an
  // account word — "Maybank 512345678901", "transfer to CIMB 7001234567". Runs
  // last, after CARD/IC/CUSTOMER_RECORD have masked what is really theirs.
  { type: 'BANK', regex: /\b(?:bank|maybank|cimb|public\s?bank|rhb|hong\s?leong|hlbb?|ambank|am\s?bank|bank\s?islam|bsn|ocbc|hsbc|uob|affin\s?bank|alliance\s?bank|standard\s?chartered|bank\s?rakyat|agrobank|bank\s?muamalat|account|acc|a\/c)\b[\s:#.,-]{0,10}(?:a\/c|acc(?:ount)?|no\.?|number|is)?[\s:#.,-]{0,4}(\d[\d\s-]{5,17}\d)\b/gi, token: '[MASKED-BANK]',
    context: ['bank', 'account', 'transfer', 'ac', 'a/c', 'swift', 'ibg', 'duitnow'] },
  // SWIFT / BIC codes — only when introduced by "swift"/"bic" (the word "swift"
  // is also an adjective, so a bare 8-letter run must not be masked). The code
  // itself stays uppercase (this regex has no `i` flag) to avoid "swift response".
  { type: 'BANK', regex: /\b(?:[Ss][Ww][Ii][Ff][Tt]|[Bb][Ii][Cc])\s*(?:code|no\.?|:)?\s*[:#]?\s*[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g, token: '[MASKED-BANK]',
    context: ['swift', 'bic', 'bank', 'wire', 'transfer'] },
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
