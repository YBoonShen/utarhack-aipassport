// AI Passport — the canonical protection state.
//
// One derivation, three readers. background.js is the only writer: it fetches
// the dashboard session and the gateway policy, calls derive(), and stores the
// result in chrome.storage.local under KEY. The popup and every content script
// *read that record* and subscribe to chrome.storage.onChanged.
//
// Nothing else is allowed to decide whether the employee is protected. That is
// the whole point: the popup used to answer "is protection active?" from
// online + tool + ping while the content script never asked the question at all,
// so the two could — and did — disagree.
//
// chrome.storage is the channel rather than runtime messaging because a content
// script reads it synchronously fast, without waking the service worker, and
// onChanged fires in every context at once. A missed message can therefore never
// leave a tab holding stale protection state.

globalThis.AIP_STATE = {
  KEY: 'aipProtection',

  // Nothing known yet in this context. Deliberately distinct from "off": the
  // content script must not conclude "unprotected" during its first few
  // milliseconds, which is exactly how the spurious unavailable panel appeared.
  UNKNOWN: {
    status: 'unknown',
    active: false,
    online: false,
    signedIn: false,
    user: null,
    profile: null,
    settings: null,
    mode: null,
    reason: 'not-resolved-yet',
    verifiedAt: 0,
    at: 0,
  },
}

// How long a session the backend confirmed stays trusted after the backend stops
// answering.
//
// This window is the whole difference between the two failures that look
// identical from here. Inside it, a dropped connection is a dropped connection:
// the employee was signed in a moment ago, nothing has said otherwise, and
// switching protection off because of a hiccup would be both wrong and unsafe —
// on-device Layer 1 keeps masking (`degraded`). Outside it, we have simply
// stopped being able to tell, and continuing to describe them as protected would
// be a claim with nothing behind it (`unverified`).
//
// Two minutes because the worker re-checks roughly every 15–60 seconds: a real
// outage crosses it in a way a hiccup does not.
globalThis.AIP_STATE.AUTH_GRACE_MS = 120_000

/**
 * The single place "is this employee protected?" is answered.
 *
 * status:
 *   'active'      — signed-in employee, backend answering. Full two-layer checks.
 *   'degraded'    — signed-in employee, backend unreachable *and the session was
 *                   confirmed recently*. Local Layer 1 only, which still masks
 *                   rather than blocks or leaks.
 *   'unverified'  — a session was cached, but it has not been confirmed for
 *                   longer than the grace window. Not signed out — unable to
 *                   tell. Protection is off and says so.
 *   'signedOut'   — the backend answered, and nobody is signed in. There is no
 *                   employee to protect and the extension stays out of the way.
 *   'notEmployee' — an admin session; same, protection is an employee feature.
 *   'offline'     — the backend has never been reached from this browser
 *                   profile, so nothing at all is known.
 *
 * `active` drives interception. It is true for 'degraded' on purpose: an outage
 * is when protection matters most, and the fallback path never blocks the tool.
 * It is false for 'unverified' for the opposite reason: after the grace window
 * there is no evidence left to protect on.
 *
 * `verifiedAt` is when the backend last *answered* — the only clock that can
 * separate "the connection dropped" from "the session ended". A failed request
 * never moves it, and never invents a verdict.
 */
globalThis.AIP_STATE.derive = function derive({
  user, profile, settings, online, error, verifiedAt = 0, now = Date.now(),
}) {
  const base = {
    online: Boolean(online),
    user: user || null,
    profile: profile || null,
    settings: settings || null,
    mode: settings?.mode || null,
    error: error || null,
    // Answering right now *is* the confirmation; offline keeps whatever the last
    // real answer was.
    verifiedAt: online ? now : verifiedAt,
    at: now,
  }

  if (!user && !online && !verifiedAt) {
    // No session, no backend, and no backend has ever been reached from this
    // browser profile — so there is no evidence either way. Reporting "signed
    // out" here would blame the employee for a service that is not running.
    return { ...base, status: 'offline', active: false, signedIn: false, reason: 'gateway-never-reached' }
  }
  if (!user) {
    // Either the backend just said so, or it said so the last time it answered.
    // An outage cannot sign anybody *in*, so this stays true while it lasts.
    return { ...base, status: 'signedOut', active: false, signedIn: false, reason: 'no-session' }
  }
  if (user.role !== 'employee') {
    return { ...base, status: 'notEmployee', active: false, signedIn: false, reason: `role-${user.role}` }
  }
  if (!online) {
    const age = now - (verifiedAt || 0)
    if (verifiedAt && age <= globalThis.AIP_STATE.AUTH_GRACE_MS) {
      // A confirmed session, briefly out of contact. Keeping protection on is
      // the safe direction and the correct one — nothing has ended this session.
      return { ...base, status: 'degraded', active: true, signedIn: true, reason: 'gateway-unreachable' }
    }
    // Long enough that the cached session is no longer evidence of anything.
    return { ...base, status: 'unverified', active: false, signedIn: false, reason: 'session-unverified' }
  }
  return { ...base, status: 'active', active: true, signedIn: true, reason: 'ok' }
}

// How every surface describes that state. The popup shield and the on-page panel
// read from here, so the two can only ever say the same thing.
globalThis.AIP_STATE.summary = function summary(state, toolName) {
  const on = toolName || 'this AI tool'
  switch (state?.status) {
    case 'active':
      return {
        tone: 'ok', icon: '✓', kicker: 'PROTECTION ACTIVE',
        title: 'Your prompts are protected',
        note: 'Sensitive data is checked before a prompt leaves this browser.',
      }
    case 'degraded':
      return {
        tone: 'warn', icon: '!', kicker: 'PROTECTION LIMITED',
        title: 'Checking prompts on this device only',
        note: `The Smart Gateway is unreachable, so prompts are masked locally with Layer 1 rules. Names are not detected until it is back; masked records are held on this device and added to your audit log when it returns.`,
      }
    case 'notEmployee':
      return {
        tone: 'warn', icon: '◦', kicker: 'PROTECTION OFF',
        title: 'Signed in as an admin',
        note: `Prompt protection follows an employee session. Sign in as an employee to have prompts on ${on} checked.`,
      }
    case 'offline':
      return {
        tone: 'err', icon: '!', kicker: 'STATUS UNAVAILABLE',
        title: 'Unable to reach the Smart Gateway',
        // Tells the employee what it means for them and who can fix it. The
        // instruction that used to be here — "start the AI Passport backend" —
        // named infrastructure an employee has no access to anyway, so it was
        // disclosure without a matching benefit. It survives behind the debug
        // flag, which a production build turns off.
        note: 'AI Passport could not contact your organisation\'s gateway, and has nothing cached to fall back on. '
          + 'Prompts on this tab are not being checked. Try again, and contact your IT administrator if it continues.'
          + (globalThis.AIP_CONFIG?.debug ? ' (dev: is the AI Passport backend running?)' : ''),
        retry: true,
      }
    case 'signedOut':
      return {
        tone: 'warn', icon: '◦', kicker: 'PROTECTION OFF',
        title: 'Sign in to protect your prompts',
        note: `AI Passport follows whoever is signed in on the dashboard. Nobody is, so prompts on ${on} are not being checked.`,
      }
    case 'unverified':
      // Neither "signed in" nor "signed out": the session could not be confirmed
      // for long enough that saying either would be inventing an answer. What is
      // certain is the part that matters — prompts are not being checked.
      return {
        tone: 'warn', icon: '!', kicker: 'PROTECTION OFF',
        title: 'Your sign-in could not be confirmed',
        note: `AI Passport has not been able to confirm your session with your organisation, so prompts on ${on} are not being checked. `
          + 'This clears by itself when the connection returns — or sign in again.',
        retry: true,
      }
    default:
      return {
        tone: '', icon: '◌', kicker: 'CHECKING',
        title: 'Checking protection…',
        note: 'Contacting the Smart Gateway.',
      }
  }
}
