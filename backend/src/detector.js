// Layer 1 detection service — rule-based (regex) masking.
// Layer 2 (Gemini API for names/context) will be added later — see proposal Section 4.

export const RULES = [
  // Malaysian IC: 990101-14-5678 (with or without dashes)
  { type: 'IC', regex: /\b\d{6}-?\d{2}-?\d{4}\b/g, token: '[MASKED-IC]' },
  // Malaysian passport: letter + 8 digits, e.g. A12345678
  { type: 'PASSPORT', regex: /\b[A-Z]\d{8}\b/g, token: '[MASKED-PASSPORT]' },
  // Financial figures: RM 4,500 / RM4500.00 / USD 1,000,000
  { type: 'FINANCIAL', regex: /\b(?:RM|MYR|USD|SGD)\s?\d[\d,]*(?:\.\d{1,2})?\b/g, token: '[MASKED-AMOUNT]' },
  // Malaysian phone numbers: 012-3456789, +60123456789, 03-12345678 etc.
  { type: 'PHONE', regex: /(?:\+?60|0)1\d[- ]?\d{3,4}[- ]?\d{4}\b/g, token: '[MASKED-PHONE]' },
  // Email addresses
  { type: 'EMAIL', regex: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, token: '[MASKED-EMAIL]' },
  // Credit/debit card numbers (13-16 digits, optionally spaced/dashed)
  { type: 'CARD', regex: /\b(?:\d[ -]?){13,16}\b/g, token: '[MASKED-CARD]' },
  // Simple credential patterns: password: xxxx / apikey=xxxx
  { type: 'CREDENTIAL', regex: /\b(?:password|pwd|api[_-]?key|token|secret)\s*[:=]\s*\S+/gi, token: '[MASKED-CREDENTIAL]' },
  // Source code & secrets: private-key blocks, DB connection strings, cloud/service keys
  { type: 'SECRET', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|\b(?:mongodb|postgres(?:ql)?|mysql|redis|amqp|jdbc):\/\/\S+|\bAKIA[0-9A-Z]{16}\b|\b(?:ghp|gho|sk|xoxb)[-_][A-Za-z0-9_-]{16,}\b/g, token: '[MASKED-SECRET]' },
  // Customer records: account / case / order / invoice / reference IDs
  { type: 'CUSTOMER_RECORD', regex: /\b(?:account|a\/c|acct|case|order|invoice|customer|cust|reference|ref)\.?\s*(?:no\.?|number|id|#|:)?\s*([A-Z]{0,4}-?\d[\dA-Z-]{2,})\b/gi, token: '[MASKED-RECORD]' },
]

/**
 * Scan a prompt and mask sensitive content.
 * @param {string} text
 * @returns {{ masked: string, detections: {type: string, count: number}[] }}
 */
export function maskPrompt(text) {
  let masked = text
  const detections = []
  for (const rule of RULES) {
    const matches = masked.match(rule.regex)
    if (matches && matches.length > 0) {
      detections.push({ type: rule.type, count: matches.length })
      masked = masked.replace(rule.regex, rule.token)
    }
  }
  return { masked, detections }
}
