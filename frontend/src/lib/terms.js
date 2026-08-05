// The product's vocabulary, in one place.
//
// The app previously said "visa", "tool request", "tool approval" and "AI tool"
// for the same idea, and "Available now" / "Assigned" / "Start module" for the
// same training state. Screens now import their words from here, so a term is
// changed once rather than hunted through the pages.
//
// The governing rule: the metaphor may name the PRODUCT, but it must never name
// a navigation item, an action, or a status. "AI Passport" on a masthead is a
// brand and reads as one; "Training Stamp" as the heading of a section a person
// has to act on is a puzzle. Artwork is exempt — the ink-seal certification and
// the ID-card layout stay, because a seal and a badge are what these documents
// have always looked like and neither costs the reader anything to decode.
//
// The agreed vocabulary:
//   AI Passport      the whole record — level, XP, certifications, safe-use history
//   AI License       the level itself (Trainee → Guardian) and what it unlocks
//   Certification    one per training module completed; the ink seal is its artwork
//   AI Tools         the employee's own view: which tools they may use
//   Tool Access      the thing being granted; "request tool access"
//   Tool Approval    the admin's decision on a request
//   AI Safety Score  the safe-use standing on the credential card
//   Smart Gateway    the checker that masks sensitive content before sending
//   Safety Points    the XP that moves the AI License level
//
// "Visa" is retired from everything a person reads. It survives only in
// internal identifiers (/api/visas, db.visaRequests) where renaming would break
// the Chrome extension and already-persisted records for no user benefit.
//
// "Stamp" is retired on the same terms and for the same reason. It survives in
// db.profile.stamps, stampFor() and BUILTIN_STAMPS in backend/src/store.js —
// renaming those would invalidate every persisted profile to change a word no
// employee sees. The seal itself still prints TRAINING VERIFIED, which is what
// it has always meant.

/** Where the employee manages their own tool access. */
export const TOOL_ACCESS_PATH = '/tools'

/**
 * The product's own built-in assistant, as it is named in the tool register.
 *
 * It is in the register because it is the default tool on every prompt event
 * (backend recordPromptEvent / the extension) and the Smart Gateway checks the
 * register on every use — an unregistered name there would read as an
 * unapproved tool. It is not, however, something an employee requests access
 * to, so the AI Tools page leaves it out: that page is about third-party tools
 * and the permission to send them company data.
 */
export const BUILT_IN_ASSISTANT = 'AI Assistant'

// ---- status labels ---------------------------------------------------------
// One label per state, used by every screen that shows that state.

/** Training module states. */
export const TRAINING_STATUS = {
  completed: 'Completed',
  inProgress: 'In progress',
  notStarted: 'Not started',
  unavailable: 'Not available yet', // published to you, but has no questions
}

/**
 * Tool access states as the employee sees them.
 *
 * `pending` covers both server review stages (SECURITY REVIEW and COMPLIANCE):
 * which desk a request is sitting on is the admin's business, not a distinction
 * the employee is asked to learn.
 */
export const ACCESS_STATUS = {
  approved: 'Approved',
  pending: 'Pending',
  blocked: 'Blocked',
  declined: 'Declined',
  locked: 'Locked',
}

/** Server request statuses that mean "not decided yet". */
export const PENDING_STATUSES = ['SECURITY REVIEW', 'COMPLIANCE']

/** Employee-facing label for a raw request status from /api/visas. */
export function accessStatusOf(status) {
  if (status === 'APPROVED') return ACCESS_STATUS.approved
  if (PENDING_STATUSES.includes(status)) return ACCESS_STATUS.pending
  if (status === 'DECLINED' || status === 'REDIRECTED') return ACCESS_STATUS.declined
  return ACCESS_STATUS.pending
}

// ---- notification categories -----------------------------------------------
// 'VISA UPDATE' is the pre-rename category still present in persisted
// notifications, so both keys have to resolve to the same row styling.

export const TOOL_ACCESS_CATEGORY = 'TOOL ACCESS'
export const LEGACY_TOOL_ACCESS_CATEGORY = 'VISA UPDATE'
