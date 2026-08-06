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

// ---- rule 1b: a credential or secret, on the first occurrence ---------------
// The rule above is deliberately patient: one masked IC number is the gateway
// working, and alerting on it would teach an admin to ignore the queue. That
// reasoning holds for personal identifiers, which are pasted in by habit and
// cost nothing once masked.
//
// It does not hold for a credential or a private key. Those two categories are
// not "personal data that was protected in time" — they are an access path to a
// system, and the employee's clipboard, their shell history and whatever they
// pasted from still hold the live secret after the gateway has masked it. The
// organisation's response is to rotate the key, and that is worth telling an
// admin about the first time rather than the third.
//
// So these types skip the window entirely and raise HIGH on occurrence one.
// Everything else keeps the pattern rule, which is what stops the queue filling
// with protected prompts.
export const CRITICAL_TYPES = ['CREDENTIAL', 'SECRET']
export const CRITICAL_SEVERITY = SEVERITY.HIGH

/** The critical types present in one prompt's detections, in rule order. */
export function criticalTypes(detections = []) {
  return CRITICAL_TYPES.filter(t => detections.some(d => d.type === t))
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
  // A banned tool is the organisation's most explicit instruction: not "review
  // this" but "nobody may send anything here". Reaching one anyway is HIGH on
  // its first occurrence, like an override.
  BANNED: SEVERITY.HIGH,
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
  BANNED: SEVERITY.HIGH,
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
// So approval does not decide whether the tool opens, and it does not decide
// whether a prompt may be sent either. **An unreviewed destination is told, not
// refused.** The employee gets the organisation's own mode — sensitive content
// is masked before it goes, exactly as on an approved tool — plus a notice
// saying the tool has not been reviewed and naming what to use instead, and the
// admin gets the audit event and the alert.
//
// That is a deliberate reversal of the earlier design, which refused sensitive
// prompts on an unreviewed tool. Refusing them protected nothing that masking
// does not already protect — the masked prompt carries no company data either
// way — while costing the employee their work and teaching them to finish the
// job in a browser the gateway cannot see. Governance here comes from the
// record, not from the refusal.
//
//   approved tool, approved model  → the organisation's own mode (mask, warn…)
//   unreviewed tool or model       → the same mode, plus `notify`: masked,
//                                    sent, recorded, and said out loud
//   suspended / above your licence → Block: an admin has already decided this
//                                    person may not send here
//   a category the tool is not cleared for → Block, whatever the tool's status
//   banned destination             → Block, clean prompts included
//
// A ban and a suspension are the two verdicts that are not advice: the
// organisation has already looked at this destination and said no. "Unreviewed"
// is the opposite — nobody has looked yet — and an unmade decision is not a
// reason to stop somebody working. `banned` stays its own flag rather than being
// folded into `mode`, because a mode describes what happens to sensitive content
// and a ban has nothing to do with content.
//
// Nothing here can ever *loosen* the org's mode: `notify` adds a message, never
// permission, so this can never become the reason something leaked.

export const MODES = { WARN: 'Warn only', MASK: 'Mask and continue', BLOCK: 'Block' }

/**
 * The modes an admin may actually set organisation-wide.
 *
 * Block is not one of them. Blocking every sensitive prompt across the whole
 * organisation is the "just say no" posture the case study rules out — it moves
 * the work to a personal laptop where nothing can see it — so Block survives
 * only as a verdict this file *derives* for a destination that has not been
 * cleared. The Settings screen offers the two org-wide modes and nothing else.
 */
export const ORG_MODES = [MODES.MASK, MODES.WARN]

export const isOrgMode = mode => ORG_MODES.includes(mode)

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
 * `access` is the employee's standing on the tool (see toolAccessFor),
 * `modelStatus` the register's word on the selected model, `modelAccess` that
 * status folded with the employee's licence level (see toolModelsFor),
 * `blockOn` the detection types this tool is not cleared to receive, and
 * `types` what was found in the prompt.
 *
 * `banned` is true only for a destination nothing may be sent to. Every caller
 * that decides whether to send has to read it *before* it looks at detections,
 * because it is the one refusal that applies to a prompt with nothing in it.
 *
 * `notify` is true for a destination nobody has reviewed. It is the opposite
 * kind of answer: the prompt goes, masked like any other, and the flag is what
 * tells the caller to say so. A caller that ignores it sends a protected prompt
 * and tells the employee nothing — which is a worse product, not a leak.
 */
export function effectiveMode({ orgMode, access, modelStatus, modelAccess, blockOn = [], types = [] }) {
  const refused = types.filter(t => blockOn.includes(t))
  const verdict = (mode, reason, extra = {}) =>
    ({ mode, reason, refused: [], banned: false, notify: false, ...extra })

  // Bans first: they answer regardless of what the prompt contains.
  if (access === 'banned') {
    return verdict(MODES.BLOCK, 'tool-banned', { refused: types, banned: true })
  }
  if (modelStatus === 'BANNED' || modelAccess === 'banned') {
    return verdict(MODES.BLOCK, 'model-banned', { refused: types, banned: true })
  }
  // Then the decisions an admin has already made about this person: a tool
  // withdrawn org-wide, and a tool or model above the licence they hold. Those
  // are answers, not gaps, so they still refuse.
  if (access === 'suspended') {
    return verdict(MODES.BLOCK, 'tool-suspended', { refused: types })
  }
  if (access === 'locked') {
    return verdict(MODES.BLOCK, 'tool-level', { refused: types })
  }
  // A model above the employee's licence level is a training gap, not a vendor
  // risk — the model itself is cleared, this person is not cleared for it — so
  // it holds sensitive content back under its own reason rather than reading as
  // "nobody reviewed this".
  if (modelAccess === 'locked') {
    return verdict(MODES.BLOCK, 'model-level', { refused: types })
  }
  if (modelStatus === 'SUSPENDED') {
    return verdict(MODES.BLOCK, 'model-suspended', { refused: types })
  }
  // A data scope is an admin's explicit instruction about a category of content,
  // so it outranks the notice below: a tool that may not receive customer
  // records may not receive them masked either, reviewed or not.
  if (refused.length > 0) {
    return verdict(MODES.BLOCK, 'data-scope', { refused })
  }
  // Nobody has reviewed this destination yet. Notice, not refusal — the org's
  // own mode still runs, so sensitive content is masked before it goes.
  if (access && access !== 'active') {
    return verdict(orgMode, 'tool-unapproved', { notify: true })
  }
  if (modelStatus === 'UNAPPROVED') {
    return verdict(orgMode, 'model-unapproved', { notify: true })
  }
  return verdict(orgMode, 'org-policy')
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
