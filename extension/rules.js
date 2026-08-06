// AI Passport — local Layer 1 rules.
//
// A mirror of backend/src/detector.js RULES, and the only detection logic that
// ships inside the extension. It exists for exactly one situation: the Smart
// Gateway could not be reached. Without it the checkpoint has two bad options —
// block the employee out of their AI tool, or wave the raw prompt through. With
// it there is a third: mask locally, show what was masked, and let them carry on.
//
// The backend stays authoritative. It adds Layer 2 (person names via Gemini),
// the admin's live controls and the audit record, none of which can run here, so
// a local result is always labelled as the offline fallback it is.
//
// backend/src/rules.sync.test.js fails if this table drifts from detector.js.

// Validators mirror backend/src/detector.js — a match is only masked when it
// passes (Luhn for cards, date+state for the IC), so the offline fallback does
// not mask a tracking number as a card or a random 12-digit run as an IC.
function luhnValid(value) {
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
function malaysianICValid(value) {
  const d = String(value).replace(/\D/g, '')
  if (d.length !== 12) return false
  const mm = +d.slice(2, 4)
  const dd = +d.slice(4, 6)
  const pb = +d.slice(6, 8)
  if (mm < 1 || mm > 12) return false
  if (dd < 1 || dd > 31) return false
  return (pb >= 1 && pb <= 59) || (pb >= 82 && pb <= 99)
}

globalThis.AIP_RULES = {
  RULES: [
    // Malaysian IC: 990101-14-5678 (with or without dashes). No leading \b so a
    // glued prefix ("IC900101051234") is still caught; the validator gates it.
    { type: 'IC', regex: /\d{6}-?\d{2}-?\d{4}\b/g, token: '[MASKED-IC]', validate: malaysianICValid },
    // Malaysian passport: letter + 8 digits, e.g. A12345678
    { type: 'PASSPORT', regex: /\b[A-Z]\d{8}\b/g, token: '[MASKED-PASSPORT]' },
    // Financial figures: RM 4,500 / rm4500.00 / USD 1,000,000 / eur 500 (case-insensitive)
    { type: 'FINANCIAL', regex: /\b(?:RM|MYR|USD|SGD|EUR|GBP)\s?\d[\d,]*(?:\.\d{1,2})?\b/gi, token: '[MASKED-AMOUNT]' },
    // Credit/debit card numbers (13-16 digits, optionally spaced/dashed). Luhn-confirmed.
    // MUST run before PHONE — a card's middle digits can look like a mobile number.
    { type: 'CARD', regex: /\b(?:\d[ -]?){13,16}\b/g, token: '[MASKED-CARD]', validate: luhnValid },
    // Malaysian phone numbers — mobile (01X) and landline (03/04/…/09) alike.
    { type: 'PHONE', regex: /(?<!\d)(?:\+?60|0)(?:1\d|[3-9])[- ]?\d{3,4}[- ]?\d{4}\b/g, token: '[MASKED-PHONE]' },
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
    // Bank account numbers — fires next to a bank name / account word only.
    { type: 'BANK', regex: /\b(?:bank|maybank|cimb|public\s?bank|rhb|hong\s?leong|hlbb?|ambank|am\s?bank|bank\s?islam|bsn|ocbc|hsbc|uob|affin\s?bank|alliance\s?bank|standard\s?chartered|bank\s?rakyat|agrobank|bank\s?muamalat|account|acc|a\/c)\b[\s:#.,-]{0,10}(?:a\/c|acc(?:ount)?|no\.?|number|is)?[\s:#.,-]{0,4}(\d[\d\s-]{5,17}\d)\b/gi, token: '[MASKED-BANK]' },
    // SWIFT / BIC codes — only when introduced by "swift"/"bic".
    { type: 'BANK', regex: /\b(?:[Ss][Ww][Ii][Ff][Tt]|[Bb][Ii][Cc])\s*(?:code|no\.?|:)?\s*[:#]?\s*[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g, token: '[MASKED-BANK]' },
  ],

  // The admin's sensitive-data controls, grouped exactly as server.js /api/detect
  // groups them. Duplicating the grouping would let the offline fallback mask
  // something the org has switched off, so the mapping lives in one place here
  // and the sync test checks it covers every rule.
  CONTROL_TYPES: {
    personalIdentifiers: ['IC', 'PASSPORT', 'PHONE', 'EMAIL'],
    customerRecords: ['CARD', 'CUSTOMER_RECORD', 'BANK'],
    financialFigures: ['FINANCIAL'],
    sourceCode: ['CREDENTIAL', 'SECRET'],
  },
}

// Which rule types may run, given the admin's controls. An unknown `controls`
// (the policy was never fetched) enables everything: offline, masking too much
// is recoverable and masking too little is not.
globalThis.AIP_RULES.enabledTypes = function enabledTypes(controls) {
  const groups = globalThis.AIP_RULES.CONTROL_TYPES
  if (!controls) return new Set(Object.values(groups).flat())
  return new Set(Object.entries(groups).flatMap(([key, types]) => (controls[key] ? types : [])))
}

/**
 * Layer 1 only. Same rules, same order and therefore the same tokens the backend
 * would have produced — Layer 2 names are the one thing missing.
 * @returns {{ masked: string, detections: {type: string, count: number}[] }}
 */
globalThis.AIP_RULES.mask = function mask(text, controls) {
  const allowed = globalThis.AIP_RULES.enabledTypes(controls)
  const detections = []
  let masked = String(text)
  for (const rule of globalThis.AIP_RULES.RULES) {
    if (!allowed.has(rule.type)) continue
    let count = 0
    masked = masked.replace(rule.regex, match => {
      if (rule.validate && !rule.validate(match)) return match // not confirmed
      count++
      return rule.token
    })
    if (count > 0) detections.push({ type: rule.type, count })
  }
  return { masked, detections }
}
