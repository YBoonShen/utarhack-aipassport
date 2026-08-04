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

globalThis.AIP_RULES = {
  RULES: [
    // Malaysian IC: 990101-14-5678 (with or without dashes)
    { type: 'IC', regex: /\b\d{6}-?\d{2}-?\d{4}\b/g, token: '[MASKED-IC]' },
    // Malaysian passport: letter + 8 digits, e.g. A12345678
    { type: 'PASSPORT', regex: /\b[A-Z]\d{8}\b/g, token: '[MASKED-PASSPORT]' },
    // Financial figures: RM 4,500 / RM4500.00 / USD 1,000,000
    { type: 'FINANCIAL', regex: /\b(?:RM|MYR|USD|SGD)\s?\d[\d,]*(?:\.\d{1,2})?\b/g, token: '[MASKED-AMOUNT]' },
    // Malaysian phone numbers: 012-3456789, +60123456789, 03-12345678 etc.
    { type: 'PHONE', regex: /(?:\+?60|0)1\d[- ]?\d{3,4}[- ]?\d{4}\b/g, token: '[MASKED-PHONE]' },
    // Email addresses. Every quantifier is bounded (RFC limits: 64-char local
    // part, 63-char labels) so a near-miss like "a.a.a…@" costs constant work per
    // start position instead of backtracking quadratically over the whole prompt.
    { type: 'EMAIL', regex: /\b[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}\b/g, token: '[MASKED-EMAIL]' },
    // Credit/debit card numbers (13-16 digits, optionally spaced/dashed)
    { type: 'CARD', regex: /\b(?:\d[ -]?){13,16}\b/g, token: '[MASKED-CARD]' },
    // Simple credential patterns: password: xxxx / apikey=xxxx
    { type: 'CREDENTIAL', regex: /\b(?:password|pwd|api[_-]?key|token|secret)\s*[:=]\s*\S+/gi, token: '[MASKED-CREDENTIAL]' },
    // Source code & secrets: private-key blocks, DB connection strings, cloud/service keys
    { type: 'SECRET', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|\b(?:mongodb|postgres(?:ql)?|mysql|redis|amqp|jdbc):\/\/\S+|\bAKIA[0-9A-Z]{16}\b|\b(?:ghp|gho|sk|xoxb)[-_][A-Za-z0-9_-]{16,}\b/g, token: '[MASKED-SECRET]' },
    // Customer records: account / case / order / invoice / reference IDs
    { type: 'CUSTOMER_RECORD', regex: /\b(?:account|a\/c|acct|case|order|invoice|customer|cust|reference|ref)\.?\s*(?:no\.?|number|id|#|:)?\s*([A-Z]{0,4}-?\d[\dA-Z-]{2,})\b/gi, token: '[MASKED-RECORD]' },
  ],

  // The admin's sensitive-data controls, grouped exactly as server.js /api/detect
  // groups them. Duplicating the grouping would let the offline fallback mask
  // something the org has switched off, so the mapping lives in one place here
  // and the sync test checks it covers every rule.
  CONTROL_TYPES: {
    personalIdentifiers: ['IC', 'PASSPORT', 'PHONE', 'EMAIL'],
    customerRecords: ['CARD', 'CUSTOMER_RECORD'],
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
    const matches = masked.match(rule.regex)
    if (matches && matches.length > 0) {
      detections.push({ type: rule.type, count: matches.length })
      masked = masked.replace(rule.regex, rule.token)
    }
  }
  return { masked, detections }
}
