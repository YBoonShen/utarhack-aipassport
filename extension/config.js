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
  // Cached protection state is refreshed at most this often on demand; the
  // alarm in background.js refreshes it in the background as well, which is how
  // a dashboard login reaches an AI tab that is already open.
  stateTtlMs: 20_000,
  statePollMinutes: 1,

  // Every call out of the extension is bounded. An unbounded fetch is how the
  // checkpoint used to hang with the employee's prompt locked inside it.
  apiTimeoutMs: 8_000,
  // Slightly longer than apiTimeoutMs so a slow-but-alive backend surfaces its
  // own error rather than looking like a dead service worker.
  askTimeoutMs: 10_000,
  // Absolute ceiling on one checkpoint. If no decision has been reached by now
  // something went wrong that we did not anticipate, and the composer is handed
  // straight back to the employee. Nothing may hold a prompt longer than this.
  releaseMs: 15_000,

  // Console tracing for development. Never receives prompt text — only lengths,
  // detection types and state transitions.
  debug: true,

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
      sendSelectors: ['#composer-submit-button', 'button[data-testid="send-button"]', 'form button[type="submit"]'],
    },
    {
      name: 'Claude',
      hosts: ['claude.ai'],
      // Also a ProseMirror contenteditable, so writeText()'s insertText path applies.
      selectors: ['div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]'],
      sendSelectors: ['button[aria-label="Send message"]', 'button[aria-label*="Send" i]', 'fieldset button[type="submit"]'],
    },
    {
      name: 'Gemini',
      hosts: ['gemini.google.com'],
      // Composer lives inside a <rich-textarea> custom element.
      selectors: ['rich-textarea div[contenteditable="true"]', 'div[contenteditable="true"]'],
      sendSelectors: ['button.send-button', 'button[aria-label*="Send" i]', 'button[mattooltip*="Send" i]'],
    },
    {
      name: 'DeepSeek',
      hosts: ['deepseek.com'],
      // The one tool here with a plain <textarea> composer rather than a
      // contenteditable, so writeText() takes its React value-setter path.
      selectors: ['textarea#chat-input', 'textarea[placeholder]', 'textarea'],
      // DeepSeek's send control is a div with generated class names, so there is
      // nothing stable to name. It is left to sendFallback's role/aria matching —
      // and Enter is intercepted regardless of which element sends.
      sendSelectors: ['div[role="button"][aria-label*="send" i]'],
    },
    {
      name: 'Kimi',
      hosts: ['kimi.com', 'moonshot.cn'],
      selectors: ['[data-testid="msh-chatinput-editor"]', 'div[contenteditable="true"]'],
      sendSelectors: ['[data-testid*="send-button" i]', '.send-button', '[aria-label*="send" i]'],
    },
  ],

  // Last-resort send-button match, used when a tool's own sendSelectors miss
  // after an upstream markup change. Kept generic on purpose — the checkpoint
  // must degrade to "still intercepts" rather than "silently stops working".
  //
  // The [role="button"] and data-testid entries matter for tools that never use
  // a real <button> (DeepSeek, Kimi). Widening this is safe because onClick only
  // acts when the composer actually holds text, so a "Send feedback" control on
  // an empty composer is never intercepted.
  sendFallback: [
    'button[data-testid="send-button"]',
    '[data-testid*="send-button" i]',
    '[aria-label*="send" i]',
    'form button[type="submit"]',
  ].join(', '),
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

// Development tracing. Scoped so the three contexts (page, worker, popup) are
// distinguishable in one console, and gated by `debug` so a production build is
// silent. Callers pass counts and types — never prompt text.
globalThis.AIP_CONFIG.log = function log(scope, ...args) {
  if (!globalThis.AIP_CONFIG.debug) return
  console.log(`%c[AI Passport]%c ${scope}`, 'color:#e0b31e;font-weight:700', 'color:#5c6a82', ...args)
}

// Failures are always logged, debug flag or not: a swallowed protection error is
// how a broken checkpoint goes unnoticed.
globalThis.AIP_CONFIG.logError = function logError(scope, ...args) {
  console.warn(`[AI Passport] ${scope}`, ...args)
}

// "IC" -> "IC NUMBER", "CUSTOMER_RECORD" -> "CUSTOMER RECORD" for the panel chips.
globalThis.AIP_CONFIG.detectionLabel = function detectionLabel(type) {
  const named = { IC: 'IC NUMBER', CARD: 'CARD NUMBER', FINANCIAL: 'FINANCIAL FIGURE' }
  return named[type] || String(type).replace(/_/g, ' ')
}
