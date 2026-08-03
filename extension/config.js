// AI Passport extension — single source of configuration.
//
// Loaded three ways, so it must stay a plain script with no imports/exports:
//   - content script (first entry in manifest content_scripts.js)
//   - service worker (importScripts in background.js)
//   - popup (<script src="config.js">)
//
// Adding another approved AI tool means adding one entry to TOOLS and one match
// pattern in manifest.json — nothing else in the extension hardcodes a host.

globalThis.AIP_CONFIG = {
  // Local hackathon backend. Production swaps this for the HTTPS deployment and
  // adds an auth token to the request — see background.js callApi().
  apiBase: 'http://localhost:5001/api',
  // The employee dashboard this extension belongs to (Vite dev server).
  dashboardBase: 'http://localhost:5173',

  // Wait this long after the last keystroke before asking the backend.
  debounceMs: 500,
  // Below this length a prompt can't realistically carry an identifier, so the
  // backend is never called for it.
  minPromptLength: 12,
  // Cached profile/settings are refreshed at most this often.
  statusTtlMs: 30_000,

  // Approved AI tools. `hosts` are matched as suffixes of location.hostname.
  //
  // NOTE — isolation seam: the backend's /api/visas returns visa *requests*, not
  // the employee's approved-tool list, so approval falls back to this table.
  // background.js resolveTool() already consults /api/visas first and honours a
  // DECLINED/REDIRECTED decision, so when the API grows an approved-tools
  // endpoint only that function changes.
  TOOLS: [
    {
      name: 'ChatGPT',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      // Tried in order; the content script also picks up any editable the user
      // actually types into, so a selector change upstream is not fatal.
      selectors: ['#prompt-textarea', 'div[contenteditable="true"]', 'form textarea'],
    },
  ],
}

// Returns the tool config for a hostname, or null when this isn't an AI tool
// the extension knows about.
globalThis.AIP_CONFIG.matchTool = function matchTool(hostname = '') {
  const host = String(hostname).toLowerCase()
  return (
    globalThis.AIP_CONFIG.TOOLS.find(t =>
      t.hosts.some(h => host === h || host.endsWith(`.${h}`))
    ) || null
  )
}

// "IC" -> "IC NUMBER", "CUSTOMER_RECORD" -> "CUSTOMER RECORD" for the panel chips.
globalThis.AIP_CONFIG.detectionLabel = function detectionLabel(type) {
  const named = { IC: 'IC NUMBER', CARD: 'CARD NUMBER', FINANCIAL: 'FINANCIAL FIGURE' }
  return named[type] || String(type).replace(/_/g, ' ')
}
