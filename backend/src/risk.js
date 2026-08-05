// Risk alert rules — what raises an alert, and at what severity.
//
// The proposal's whole posture is "mask, don't block" and "guide, don't
// punish", and that only works if the alerts an admin sees are the ones that
// actually mean something. A single masked prompt is the system working: it is
// not a risk, and raising an alert for it would train an admin to ignore the
// queue. What deserves attention is a *pattern* — the same identifier going
// into AI tools again and again, or company data heading for a tool nobody
// approved.
//
// So the three levels below are defined by what the organisation has actually
// lost, not by how alarming the wording is:
//
//   HIGH        Protected data left the organisation, or a pattern has repeated
//               past the point where guidance alone is enough. Review in 4h.
//   MEDIUM      The gateway held — nothing escaped — but the behaviour needs a
//               conversation or a refresher. Review today.
//   MONITORING  A trend with no individual responsible. Observe; escalate only
//               if it persists.
//
// Every rule states its own threshold here rather than in the code that fires
// it, so the queue can be explained to an auditor from one file.

export const SEVERITY = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', MONITORING: 'MONITORING' }

/** How long an alert of each severity is given before it is overdue. */
export const RESPONSE_HOURS = { HIGH: 4, MEDIUM: 24, MONITORING: 72 }

// ---- rule 1: repeated identifiers ------------------------------------------
// One masked prompt is protection working. The same *kind* of identifier being
// masked over and over in a short window is a habit, and a habit is what
// training fixes. Counting per identifier type rather than per prompt is what
// makes the alert able to say "the same identifier pattern", which is the
// finding an admin can act on.

export const REPEAT_WINDOW_MINUTES = 15
/** Occurrences of one identifier type, within the window, that raise MEDIUM. */
export const REPEAT_WARN_AT = 3
/** …and that escalate the same alert to HIGH rather than raising a second. */
export const REPEAT_ESCALATE_AT = 5

/** Drops events that have aged out of the window. */
export function pruneRepeats(events, now = Date.now(), windowMinutes = REPEAT_WINDOW_MINUTES) {
  const cutoff = now - windowMinutes * 60_000
  return events.filter(e => e.at >= cutoff)
}

/** { IC: 3, NAME: 1 } — how often each identifier type was masked, per employee. */
export function repeatCounts(events, employeeId) {
  const counts = {}
  for (const e of events) {
    if (e.employeeId !== employeeId) continue
    counts[e.type] = (counts[e.type] || 0) + 1
  }
  return counts
}

/**
 * The identifier type that has repeated most, and the severity it earns.
 * Returns null while everything is still below the warning threshold — the
 * common case, and the one that must stay silent.
 */
export function repeatVerdict(counts) {
  const [type, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || []
  if (!type || count < REPEAT_WARN_AT) return null
  return {
    type,
    count,
    severity: count >= REPEAT_ESCALATE_AT ? SEVERITY.HIGH : SEVERITY.MEDIUM,
  }
}

// ---- rule 2: unapproved tool -----------------------------------------------
// Data reaching a tool the organisation never reviewed is the risk the visa
// workflow exists to remove, so using one is always worth an alert — but the
// gateway still masked the prompt, so it is guidance (MEDIUM), not a breach.
// A tool suspended after a vendor incident is different: the organisation has
// already decided nobody may use it, so using it anyway is HIGH.

export const TOOL_SEVERITY = {
  UNAPPROVED: SEVERITY.MEDIUM,
  SUSPENDED: SEVERITY.HIGH,
}

/** One alert per employee + tool per this long, so a session isn't a queue. */
export const TOOL_REPEAT_WINDOW_MINUTES = 60

// ---- rule 2b: unapproved model ----------------------------------------------
// A greenlit tool is not a greenlit vendor catalogue. Platforms ship new models
// continuously, and an organisation that reviewed Claude Sonnet has reviewed
// neither the data handling nor the retention terms of whatever shipped last
// week. So a model carries its own status inside an approved tool, and reaching
// for an unreviewed one is the same class of finding as reaching for an
// unreviewed tool — MEDIUM, because the gateway still refuses to let sensitive
// content go there.
//
// A model the register has never heard of is NOT flagged. Platforms rename
// models constantly and the extension reads a UI label, not an API id: treating
// "could not identify" as "unapproved" would alert on the register being out of
// date rather than on anything the employee did.

export const MODEL_SEVERITY = {
  UNAPPROVED: SEVERITY.MEDIUM,
  SUSPENDED: SEVERITY.HIGH,
}

/** One alert per employee + tool + model per this long. */
export const MODEL_REPEAT_WINDOW_MINUTES = 60

// ---- rule 3: overriding the checkpoint -------------------------------------
// The gateway found sensitive content and the employee sent the original
// anyway. This is the one case where data demonstrably left the organisation,
// so it is HIGH the first time and stays HIGH.

export const OVERRIDE_SEVERITY = SEVERITY.HIGH

// ---- shared -----------------------------------------------------------------

// ---- how a tool's approval changes the gateway policy ------------------------
//
// The proposal's answer to "an employee is on a tool nobody approved" is neither
// a ban nor a shrug. Banning the site pushes the usage somewhere nothing can see
// it — the failure the case study names outright — and treating the tool exactly
// like an approved one would make the approval workflow decorative.
//
// So approval does not decide whether the tool opens. It decides **what the tool
// is allowed to receive**:
//
//   approved tool, approved model  → the organisation's own mode (mask, warn…)
//   unapproved tool or model       → Block: clean prompts flow, sensitive ones
//                                    do not go there at all
//   a category the tool is not cleared for → Block, whatever the tool's status
//
// Every one of those can only ever *tighten* the org's mode. A tool's own
// settings can never loosen the policy an admin set, so this can never become
// the reason something leaked.

export const MODES = { WARN: 'Warn only', MASK: 'Mask and continue', BLOCK: 'Block' }

/** Loosest → strictest. `tighten()` picks the higher of two modes, never lower. */
export const MODE_RANK = { [MODES.WARN]: 1, [MODES.MASK]: 2, [MODES.BLOCK]: 3 }

export function tighten(a, b) {
  if (!b) return a
  if (!a) return b
  return (MODE_RANK[b] || 0) > (MODE_RANK[a] || 0) ? b : a
}

/**
 * The mode that actually applies to one prompt, and why.
 *
 * `access` is the employee's standing on the tool (see toolAccessFor), `model`
 * the model's status, `blockOn` the detection types this tool is not cleared to
 * receive, and `types` what was found in the prompt.
 */
export function effectiveMode({ orgMode, access, modelStatus, blockOn = [], types = [] }) {
  const refused = types.filter(t => blockOn.includes(t))

  if (access === 'suspended') {
    return { mode: MODES.BLOCK, reason: 'tool-suspended', refused: types }
  }
  if (access && access !== 'active') {
    return { mode: MODES.BLOCK, reason: 'tool-unapproved', refused: types }
  }
  if (modelStatus === 'SUSPENDED' || modelStatus === 'UNAPPROVED') {
    return { mode: MODES.BLOCK, reason: 'model-unapproved', refused: types }
  }
  if (refused.length > 0) {
    return { mode: MODES.BLOCK, reason: 'data-scope', refused }
  }
  return { mode: orgMode, reason: 'org-policy', refused: [] }
}

/** Human label for a detection type, matching the employee-facing wording. */
export const IDENTIFIER_LABELS = {
  IC: 'IC number',
  PASSPORT: 'passport number',
  PHONE: 'phone number',
  EMAIL: 'email address',
  NAME: 'personal name',
  CARD: 'card number',
  FINANCIAL: 'financial figure',
  CREDENTIAL: 'credential',
  SECRET: 'secret or key',
  CUSTOMER_RECORD: 'customer record ID',
}

export function identifierLabel(type) {
  return IDENTIFIER_LABELS[type] || String(type || '').toLowerCase().replace(/_/g, ' ')
}

/** When an alert of this severity is due, as an ISO timestamp. */
export function dueAtFor(severity, from = Date.now()) {
  return new Date(from + (RESPONSE_HOURS[severity] ?? 24) * 3_600_000).toISOString()
}

/**
 * "Due in 2h 18m" / "Overdue by 5m" — derived on read from `dueAt`, so the
 * queue counts down while an admin is looking at it instead of printing a
 * deadline that was true when the alert was written.
 */
export function dueLabel(dueAt, now = Date.now()) {
  if (!dueAt) return null
  const ms = new Date(dueAt).getTime() - now
  const mins = Math.round(Math.abs(ms) / 60_000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const span = h > 0 ? `${h}h ${m}m` : `${m}m`
  return ms >= 0 ? `Due in ${span}` : `Overdue by ${span}`
}
