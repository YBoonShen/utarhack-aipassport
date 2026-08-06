// How an audit event is described to the employee it belongs to.
//
// The admin Audit Log shows the raw action code (MASKED, DENIED, SIGN-IN) next
// to the control it maps to, because that is what an auditor reads. The same
// event on an employee's own page is the same record told in plain words — no
// second source of data, only different wording over /api/activity/mine.
//
// One place for it, because the Home card and the activity page must never
// describe the same event two different ways.

const ACTION_TEXT = {
  MASKED: 'Sensitive content masked',
  CLEAN: 'Prompt checked · nothing sensitive found',
  ALERT: 'Unsafe prompt flagged',
  REDIRECTED: 'Redirected to an approved tool',
  DENIED: 'Access refused',
  BLOCKED: 'Prompt blocked',
  COMPLETED: 'Training completed',
  REQUESTED: 'AI tool requested',
  APPROVAL: 'AI tool approved',
  SUSPENDED: 'AI tool suspended',
  ASSIGNED: 'Training assigned to you',
  // Reaching a tool or model the register has not cleared for you. These reach
  // an employee's own page now that every occurrence is recorded, not only the
  // one that raised the alert.
  UNAPPROVED: 'Unapproved AI tool or model used',
  RESTRICTED: 'Used above your AI License level',
  'SIGN-IN': 'Signed in',
  'SIGN-OUT': 'Signed out',
}

// Colour follows what the event means, matching the admin log's palette so the
// same event is not green in one place and amber in another.
const ACTION_CHIP = {
  MASKED: 'bg-[#e9f8f2] text-[#078b6c]',
  CLEAN: 'bg-[#eef2ff] text-[#365fd9]',
  ALERT: 'bg-[#fff0f0] text-[#d92d20]',
  DENIED: 'bg-[#fff0f0] text-[#d92d20]',
  BLOCKED: 'bg-[#fff0f0] text-[#d92d20]',
  REDIRECTED: 'bg-[#fff5de] text-[#d97706]',
  SUSPENDED: 'bg-[#fceded] text-[#c72929]',
  UNAPPROVED: 'bg-[#fff5de] text-[#d97706]',
  RESTRICTED: 'bg-[#fff5de] text-[#d97706]',
  COMPLETED: 'bg-[#e9f8f2] text-[#078b6c]',
  APPROVAL: 'bg-[#e9f8f2] text-[#078b6c]',
  REQUESTED: 'bg-[#eef2ff] text-[#365fd9]',
  ASSIGNED: 'bg-[#ede9fe] text-[#6d28d9]',
  'SIGN-IN': 'bg-[#eef2ff] text-[#365fd9]',
  'SIGN-OUT': 'bg-[#ededf2] text-[#667085]',
}

/** Plain-language title for one event. Unknown actions pass through as-is. */
export function actionText(event) {
  return ACTION_TEXT[event?.action] || event?.action || 'Activity'
}

export function actionChip(event) {
  return ACTION_CHIP[event?.action] || 'bg-[#ededf2] text-[#667085]'
}
