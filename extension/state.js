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
    at: 0,
  },
}

/**
 * The single place "is this employee protected?" is answered.
 *
 * status:
 *   'active'    — signed-in employee, gateway answering. Full two-layer checks.
 *   'degraded'  — signed-in employee, gateway unreachable. Local Layer 1 only,
 *                 which still masks rather than blocks or leaks.
 *   'signedOut' — nobody is signed in on the dashboard, so there is no employee
 *                 to protect and the extension must stay out of the way.
 *   'notEmployee' — an admin session; same, protection is an employee feature.
 *
 * `active` drives interception. It is true for 'degraded' on purpose: offline is
 * when protection matters most, and the fallback path never blocks the tool.
 */
globalThis.AIP_STATE.derive = function derive({ user, profile, settings, online, error }) {
  const base = {
    online: Boolean(online),
    user: user || null,
    profile: profile || null,
    settings: settings || null,
    mode: settings?.mode || null,
    error: error || null,
    at: Date.now(),
  }

  if (!user && !online) {
    // No session *and* no gateway: the backend has never been reached from this
    // browser profile, so there is no evidence anyone is signed in. Reporting
    // "signed out" would blame the employee for a backend that is not running.
    return { ...base, status: 'offline', active: false, signedIn: false, reason: 'gateway-never-reached' }
  }
  if (!user) {
    return { ...base, status: 'signedOut', active: false, signedIn: false, reason: 'no-session' }
  }
  if (user.role !== 'employee') {
    return { ...base, status: 'notEmployee', active: false, signedIn: false, reason: `role-${user.role}` }
  }
  if (!online) {
    // The session came from the mirrored copy in storage. Treating a cached
    // employee as protected is the safe direction: the alternative is switching
    // protection off the moment the network hiccups.
    return { ...base, status: 'degraded', active: true, signedIn: true, reason: 'gateway-unreachable' }
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
    default:
      return {
        tone: '', icon: '◌', kicker: 'CHECKING',
        title: 'Checking protection…',
        note: 'Contacting the Smart Gateway.',
      }
  }
}
