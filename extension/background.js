// AI Passport — service worker.
//
// Every backend call goes through here rather than through the content script.
// The worker runs on the extension's own origin with host_permissions for the
// API, so there is no CORS negotiation and no mixed-content problem calling
// http://localhost from an https AI tool page.
//
// Detection itself is never reimplemented here: this is a thin relay to the
// existing /api/detect (detector.js + layer2.js), the same endpoint /gateway
// uses, so the extension and the web Gateway always agree.

importScripts('config.js')

const CFG = globalThis.AIP_CONFIG

async function callApi(path, options) {
  // Production: attach the employee's session token here. Nothing secret is
  // ever shipped inside the extension.
  const res = await fetch(`${CFG.apiBase}${path}`, options)
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

// ---- status (profile + gateway policy) -------------------------------------
// Cached briefly so a page with an active composer doesn't refetch constantly,
// and kept in storage so the popup still shows the last known state offline.

let statusCache = { at: 0, data: null }

async function getStatus(force = false) {
  const fresh = Date.now() - statusCache.at < CFG.statusTtlMs
  if (!force && fresh && statusCache.data) return statusCache.data

  try {
    const [profile, settings] = await Promise.all([
      callApi('/profile'),
      callApi('/settings'),
    ])
    const data = { online: true, profile, settings, mode: settings.mode }
    statusCache = { at: Date.now(), data }
    await chrome.storage.local.set({ aipStatus: data, aipStatusAt: Date.now() })
    return data
  } catch {
    // Fall back to whatever we last saw, flagged as stale.
    const stored = await chrome.storage.local.get(['aipStatus', 'aipStatusAt'])
    return stored.aipStatus
      ? { ...stored.aipStatus, online: false, staleAt: stored.aipStatusAt }
      : { online: false, profile: null, settings: null, mode: null }
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
    return postJson('/detect', { prompt, tool, preview: true })
  },

  // The employee chose to protect and send: this is the real event, recorded in
  // the existing audit log exactly like a prompt sent from /gateway.
  async AIP_COMMIT({ prompt, tool }) {
    return postJson('/detect', { prompt, tool })
  },

  async AIP_STATUS({ force }) {
    return getStatus(Boolean(force))
  },

  async AIP_TOOL({ tool }) {
    return resolveTool(tool)
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
