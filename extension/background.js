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

// Two different questions, deliberately two different calls.
//
//   resolveTool()  — "where does this employee stand, and what applies here?"
//                    A question. GET, cached, safe to ask as often as anything
//                    needs to know. Asking used to POST, which meant opening the
//                    popup wrote an audit event about a use that never happened.
//
//   reportToolUse() — "they are on it." An event. POST, once per arrival, and
//                    the thing that turns "the extension knew" into a risk alert
//                    an admin can act on.
//
// The register is the authority for both: the same list an admin curates on Tool
// Approvals, folded with this employee's licence level and their own request
// history, so the extension never forms a second opinion about approval.

const POLICY_KEY = 'aipPolicy' // last good verdict per tool, for offline
const POLICY_TTL_MS = 60_000

// Keyed by tool *and* model: the checkpoint asks for a verdict on every send, so
// that the one refusal which applies to a harmless prompt — a banned
// destination — is known before the prompt is looked at. Uncached, that would be
// a network round trip per keystroke-completed message; cached per model it is
// one per model per minute. Only the tool-level answer is persisted for offline
// use, because a model-specific answer is about a picker the employee can change
// between two prompts.
const policyCache = new Map() // `${toolName}::${model}` -> { at, policy }

// Everything the checkpoint needs about where a prompt is heading: this
// employee's standing, the selected model's standing, the mode that really
// applies and which approved tools to offer instead.
//
// Offline it answers from the last verdict this browser saw, and if there has
// never been one it answers "approved". That direction is deliberate: a gateway
// that cannot be reached must never be the reason an employee cannot work, and
// the checkpoint still masks with the local rules either way.
function policyOf(policy) {
  return {
    approved: Boolean(policy.approved),
    // This employee's standing on the tool: active · locked · review · declined
    // · suspended · banned · unreviewed.
    access: policy.access,
    // Why the gateway would refuse, as risk.js named it (tool-unapproved,
    // model-banned, data-scope…). It used to be a second copy of `access`,
    // which meant the panel could not tell a banned tool from a banned model.
    reason: policy.reason,
    // The one refusal that applies to a prompt with nothing in it.
    banned: Boolean(policy.banned),
    explain: policy.explain,
    mode: policy.mode,
    orgMode: policy.orgMode,
    tightened: Boolean(policy.tightened),
    model: policy.model || null,
    minLevel: policy.minLevel || null,
    approvedModels: policy.approvedModels || [],
    alternatives: policy.alternatives || [],
    blockOn: policy.blockOn || [],
    dataScope: policy.dataScope || null,
    online: true,
  }
}

async function resolveTool(toolName, model = '') {
  const known = CFG.TOOLS.find(t => t.name === toolName) || null
  if (!known) return { approved: false, reason: 'unknown', tool: null }

  const key = `${toolName}::${model}`
  const cached = policyCache.get(key)
  if (cached && Date.now() - cached.at < POLICY_TTL_MS) {
    return { ...cached.policy, tool: known, cached: true }
  }

  const query = new URLSearchParams({ tool: toolName })
  if (model) query.set('model', model)

  try {
    const resolved = policyOf(await callApi(`/gateway/tool-status?${query}`))
    policyCache.set(key, { at: Date.now(), policy: resolved })
    // Only the tool-level verdict is persisted for offline use — see above.
    if (!model) {
      await chrome.storage.local.set({ [POLICY_KEY]: { ...(await readPolicyStore()), [toolName]: resolved } })
    }
    return { ...resolved, tool: known }
  } catch (err) {
    noteApiFailure(err)
  }

  const stored = (await readPolicyStore())[toolName]
  if (stored) {
    CFG.log('tool', `gateway unreachable — using the last known verdict for ${toolName}`)
    return { ...stored, tool: known, online: false, cached: true }
  }
  // Never seen this tool answered. Fail open, and say so: a gateway that cannot
  // be reached must never be the reason an employee cannot work, and the
  // checkpoint still masks with the local rules either way.
  return { approved: true, access: 'active', reason: 'gateway-unreachable', banned: false, tool: known, online: false, alternatives: [] }
}

async function readPolicyStore() {
  const stored = await chrome.storage.local.get(POLICY_KEY)
  return stored[POLICY_KEY] || {}
}

// The arrival itself. Separate from resolving so that asking a question can
// never write a record. The backend de-duplicates per employee + tool per hour,
// so re-arming the checkpoint on a navigation cannot fill the queue.
async function reportToolUse(toolName, model = '') {
  try {
    const seen = await postJson('/gateway/tool-use', { tool: toolName, ...(model ? { model } : {}) })
    if (seen.policy) {
      const resolved = policyOf(seen.policy)
      policyCache.set(`${toolName}::${model}`, { at: Date.now(), policy: resolved })
      if (!model) {
        await chrome.storage.local.set({ [POLICY_KEY]: { ...(await readPolicyStore()), [toolName]: resolved } })
      }
      return { ...seen, ...resolved }
    }
    return seen
  } catch (err) {
    noteApiFailure(err)
    return { __error: String(err?.message || err) }
  }
}

// ---- message handling ------------------------------------------------------

const handlers = {
  // While-typing check. `preview` means the backend runs detection but records
  // no audit event, no counters and no points. `model` travels with it so the
  // returned mode is the one that will really apply — a warning that says
  // "you'll be asked to mask this" when the answer is "this cannot go here" is
  // worse than no warning.
  async AIP_DETECT({ prompt, tool, model }) {
    try {
      return await postJson('/detect', { prompt, tool, model, preview: true })
    } catch (err) {
      noteApiFailure(err)
      throw err
    }
  },

  // The employee chose to protect and send: this is the real event, recorded in
  // the existing audit log exactly like a prompt sent from /gateway.
  async AIP_COMMIT({ prompt, tool, model }) {
    try {
      return await postJson('/detect', { prompt, tool, model })
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

  // Resolve only — never records. Safe for the popup and for re-checking on
  // every send.
  async AIP_TOOL({ tool, model }) {
    return resolveTool(tool, model || '')
  },

  // The employee arrived on a tool. This is the recorded event.
  async AIP_TOOL_USE({ tool, model }) {
    return reportToolUse(tool, model || '')
  },

  // The checkpoint refused a send. The backend never sees a prompt that does not
  // go — the while-typing check runs with `preview: true` and records nothing —
  // so without this the employee would be stopped and the organisation would
  // learn nothing. `types` only: the categories found, never the text.
  async AIP_BLOCKED({ tool, model, reason, types }) {
    try {
      return await postJson('/gateway/blocked', { tool, model: model || null, reason, types: types || [] })
    } catch (err) {
      noteApiFailure(err)
      return { __error: String(err?.message || err) }
    }
  },

  // The employee changed model inside an approved tool. Recorded on its own so
  // an admin sees the switch even when no prompt follows it.
  async AIP_MODEL_USE({ tool, model }) {
    try {
      return await postJson('/gateway/model-use', { tool, model })
    } catch (err) {
      noteApiFailure(err)
      return { __error: String(err?.message || err) }
    }
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
