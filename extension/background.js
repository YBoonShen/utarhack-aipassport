// AI Passport — service worker.
//
// Two jobs, and nothing else:
//
//  1. It is the only place that calls the backend. The worker runs on the
//     extension's own origin with host_permissions for the API, so there is no
//     CORS negotiation and no mixed-content problem calling http://localhost
//     from an https AI tool page. Detection itself is never reimplemented here:
//     this is a thin relay to /api/detect (detector.js + layer2.js), the same
//     endpoint /gateway uses, so the extension and the web Gateway agree.
//
//  2. It is the only *writer* of the protection state (state.js). It resolves
//     the dashboard session and the gateway policy, derives one record, and
//     publishes it to chrome.storage. The popup and the content scripts read
//     that record; none of them derives protection independently any more.

importScripts('config.js', 'rules.js', 'state.js')

const CFG = globalThis.AIP_CONFIG
const STATE = globalThis.AIP_STATE

async function callApi(path, options) {
  // Production: attach the employee's session token here. Nothing secret is
  // ever shipped inside the extension.
  //
  // Every request is bounded. A backend that accepts the connection and then
  // never answers (Layer 2 waiting on Gemini, a paused container) would
  // otherwise leave the caller — and the employee's prompt — waiting forever.
  const res = await fetch(`${CFG.apiBase}${path}`, {
    ...options,
    signal: AbortSignal.timeout(CFG.apiTimeoutMs),
  })
  if (!res.ok) throw new Error(`API ${path} failed (${res.status})`)
  return res.json()
}

function postJson(path, body) {
  return callApi(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ---- protection state ------------------------------------------------------
// The employee's session, profile and the org policy resolved together, into the
// single record every surface reads. Resolved together on purpose: three
// separate fetches produced three separate opinions about being online, which is
// how the popup could say "protected" while the next detect call failed.

let cached = null // last derived state, so a warm worker answers instantly
let inFlight = null // single-flight: concurrent tabs share one refresh

async function fetchState() {
  // /auth/session is the authority on who is signed in — the dashboard writes it
  // on login, so the extension follows the web app without sharing localStorage.
  const [session, profile, settings] = await Promise.all([
    callApi('/auth/session'),
    callApi('/profile'),
    callApi('/settings'),
  ])
  return STATE.derive({ user: session?.user || null, profile, settings, online: true })
}

// Everything the gateway told us last time, so an offline worker still knows who
// is signed in instead of silently switching protection off.
async function fetchStateOffline(error) {
  const stored = await chrome.storage.local.get(STATE.KEY)
  const last = stored[STATE.KEY]
  return STATE.derive({
    user: last?.user || null,
    profile: last?.profile || null,
    settings: last?.settings || null,
    online: false,
    error,
  })
}

async function refreshState(force = false) {
  if (!force && cached && Date.now() - cached.at < CFG.stateTtlMs) return cached
  if (inFlight) return inFlight

  inFlight = (async () => {
    let next
    try {
      next = await fetchState()
    } catch (err) {
      next = await fetchStateOffline(String(err?.message || err))
    }
    return publish(next)
  })()

  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

// The publish step is what synchronises everyone: one storage write, and
// chrome.storage.onChanged delivers it to the popup and to every content script
// in every open AI tab at the same time. No per-tab messaging to miss.
async function publish(next) {
  const changed = !cached || cached.status !== next.status || cached.mode !== next.mode
  cached = next
  await chrome.storage.local.set({ [STATE.KEY]: next })
  if (changed) {
    CFG.log('state', `protection -> ${next.status}`, {
      signedIn: next.signedIn, online: next.online, mode: next.mode, reason: next.reason,
    })
  }
  // Back online is the moment anything held during the outage can be recorded.
  // Driven from here rather than from a timer of its own, so there is still only
  // one thing in this worker deciding whether the gateway is reachable.
  if (next.online) flushQueue().catch(() => {})
  return next
}

// A backend call that failed is first-hand evidence the gateway is down, so the
// state is re-derived rather than waiting for the next poll to notice.
function noteApiFailure(err) {
  CFG.logError('api', String(err?.message || err))
  if (cached?.online !== false) refreshState(true).catch(() => {})
}

// ---- the offline queue -----------------------------------------------------
//
// When the gateway is unreachable the content script still masks and still
// sends: protection never waits for a server. The audit record is the part that
// cannot be written, and losing it is not neutral — it silently shrinks the
// admin's totals for the length of the outage, in the one place the case study
// needs a complete log. So the event is parked here and posted the moment the
// gateway answers again.
//
// Only the *masked* text is ever queued. A queue of raw prompts sitting in
// browser storage waiting for a server to come back would be a worse leak than
// the one this whole extension exists to prevent.

const QUEUE_KEY = 'aipQueue'
const QUEUE_MAX = 50

async function readQueue() {
  const stored = await chrome.storage.local.get(QUEUE_KEY)
  return Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] : []
}

async function enqueue(entry) {
  const queue = await readQueue()
  // Oldest first out when full: a bounded queue must drop something, and the
  // recent events are the ones an admin is still able to act on.
  const next = [...queue, entry].slice(-QUEUE_MAX)
  await chrome.storage.local.set({ [QUEUE_KEY]: next })
  CFG.log('queue', `event held for the audit log (${next.length} pending)`)
  return next.length
}

let flushing = false

// Posts everything held, then removes exactly what the backend confirmed.
// Entries the server reports as duplicates are dropped too — it has them, this
// browser just never heard the first answer.
async function flushQueue() {
  if (flushing) return { flushed: 0 }
  const queue = await readQueue()
  if (queue.length === 0) return { flushed: 0 }

  flushing = true
  try {
    const res = await postJson('/detect/backfill', { events: queue })
    const done = new Set([...(res.accepted || []), ...(res.duplicates || [])])
    const left = queue.filter(e => !done.has(e.id))
    await chrome.storage.local.set({ [QUEUE_KEY]: left })
    CFG.log('queue', `${done.size} offline event(s) recorded, ${left.length} still pending`)
    return { flushed: done.size, pending: left.length }
  } catch (err) {
    // Still down. The queue is untouched, so nothing is lost by trying again.
    CFG.log('queue', 'gateway still unreachable, events kept', String(err?.message || err))
    return { flushed: 0, pending: queue.length }
  } finally {
    flushing = false
  }
}

// ---- approved tools --------------------------------------------------------

// Resolves whether a tool is approved for this employee. /api/visas holds visa
// *requests*, so a decision there wins; otherwise the tool table in config.js
// applies. Replace this body when the backend exposes an approved-tools list —
// nothing else in the extension needs to change.
async function resolveTool(toolName) {
  const known = CFG.TOOLS.find(t => t.name === toolName) || null
  if (!known) return { approved: false, reason: 'unknown', tool: null }

  try {
    const visas = await callApi('/visas')
    const decision = visas.find(v => v.tool === toolName)
    if (decision && ['DECLINED', 'REDIRECTED'].includes(decision.status)) {
      return { approved: false, reason: 'declined', tool: known, request: decision }
    }
  } catch {
    /* offline — fall through to the configured tool table */
  }
  return { approved: true, reason: 'approved', tool: known }
}

// ---- message handling ------------------------------------------------------

const handlers = {
  // While-typing check. `preview` means the backend runs detection but records
  // no audit event, no counters and no points.
  async AIP_DETECT({ prompt, tool }) {
    try {
      return await postJson('/detect', { prompt, tool, preview: true })
    } catch (err) {
      noteApiFailure(err)
      throw err
    }
  },

  // The employee chose to protect and send: this is the real event, recorded in
  // the existing audit log exactly like a prompt sent from /gateway.
  async AIP_COMMIT({ prompt, tool }) {
    try {
      return await postJson('/detect', { prompt, tool })
    } catch (err) {
      noteApiFailure(err)
      throw err
    }
  },

  // Warn-only mode, "Send original": the same penalised + logged path the web
  // Gateway uses, so an override from the extension is indistinguishable from
  // one made in the dashboard.
  async AIP_OVERRIDE({ prompt }) {
    return postJson('/gateway/override', { prompt })
  },

  // The gateway was down, the prompt was masked on-device and sent. This is its
  // audit record, held until the gateway can take it. `masked` only — see the
  // queue section above.
  async AIP_QUEUE({ masked, tool, at }) {
    const pending = await enqueue({
      id: crypto.randomUUID(),
      prompt: masked,
      tool: tool || 'AI Assistant',
      at: at || new Date().toISOString(),
    })
    return { pending }
  },

  // How many events are still waiting to reach the audit log. The popup shows
  // it so an outage is visible to the employee, not only to the admin.
  async AIP_PENDING() {
    return { pending: (await readQueue()).length }
  },

  // The canonical protection state. Content scripts call this once at startup
  // (and when the tab is re-focused) purely to trigger a refresh — the value
  // itself reaches them through storage either way.
  async AIP_STATE({ force }) {
    return refreshState(Boolean(force))
  },

  async AIP_TOOL({ tool }) {
    return resolveTool(tool)
  },

  // The employee's own Smart Gateway events, for the popup's Recent activity.
  // Reuses the existing notification feed — masked-only by construction, so no
  // raw prompt content can reach the popup.
  async AIP_ACTIVITY() {
    const items = await callApi('/notifications')
    return items
      .filter(n => n.category === 'SMART GATEWAY' && !n.deleted)
      .slice(0, 3)
      .map(({ id, title, body, time }) => ({ id, title, body, time }))
  },
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg?.type]
  if (!handler) return false
  handler(msg)
    .then(data => sendResponse({ ok: true, data }))
    // The content script must never break the AI site, so failures come back as
    // data rather than as a rejected promise.
    .catch(err => sendResponse({ ok: false, error: String(err.message || err) }))
  return true // keep the message channel open for the async reply
})

// ---- keeping the state current ---------------------------------------------
// A dashboard login happens in a different tab, on a different origin: nothing
// notifies the extension. The alarm is what makes "sign in, go back to ChatGPT"
// work without reloading anything — the content script picks the change up
// through storage, so protection turns on in a tab that never navigated.

chrome.alarms.create('aip-state', { periodInMinutes: CFG.statePollMinutes })
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'aip-state') refreshState(true).catch(() => {})
})

// A cold worker starts with no cache. Resolving immediately means the first
// prompt of the session is not the one that pays for it.
chrome.runtime.onStartup.addListener(() => refreshState(true).catch(() => {}))
chrome.runtime.onInstalled.addListener(() => refreshState(true).catch(() => {}))
refreshState(true).catch(() => {})
