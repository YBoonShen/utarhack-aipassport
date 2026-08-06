// AI Passport extension — single source of configuration.
//
// Loaded three ways, so it must stay a plain script with no imports/exports:
//   - content script (first entry in manifest content_scripts.js)
//   - service worker (importScripts in background.js)
//   - popup (<script src="config.js">)
//
// Adding another approved AI tool means adding one entry to TOOLS and a match
// pattern in manifest.json (host_permissions, content_scripts.matches and
// web_accessible_resources.matches) — nothing else in the extension hardcodes a
// host. If the tool's own domain is one employees can reach without a
// subdomain (e.g. kimi.com, not just www.kimi.com), add *both* the bare host
// and the `*.host` wildcard: Chrome's match-pattern spec treats `*.host` as
// "host plus its subdomains" for content-script purposes but does not itself
// match the bare host, so the wildcard alone silently leaves that page
// unprotected — no content script, no detection, nothing in the audit log.

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
  // How long a resolved protection state may be re-used before the worker asks
  // the backend again. This is the upper bound on how stale "am I signed in?"
  // can be, so it is deliberately short: a sign-out has to reach an AI tab the
  // employee is still typing into.
  stateTtlMs: 10_000,
  // The background floor, for when no AI tab is open to drive anything.
  // chrome.alarms will not fire faster than once a minute.
  statePollMinutes: 1,
  // The foreground heartbeat: while an AI tool tab is visible, its checkpoint
  // re-asks this often. Together with stateTtlMs that puts a signed-out state on
  // screen within roughly 10–25 seconds of the employee signing out, without a
  // reload and without polling a backend nobody is using.
  heartbeatMs: 15_000,

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

  // AI tools this extension can run a checkpoint on. `hosts` are matched as
  // suffixes of location.hostname.
  //
  // This table says what the extension can *operate*, never what the employee is
  // *allowed* to use. Approval is the backend register's answer and nothing here
  // may second-guess it: background.js resolveTool() asks
  // GET /api/gateway/tool-status, which folds the org register, this employee's
  // licence level and their own request history into one verdict.
  //
  // `modelSelectors` name the model picker, in the same specific → generic order
  // as the composer and send selectors, and for the same reason: upstream markup
  // changes, and reading no model must degrade to "unknown" rather than to a
  // wrong answer. An unidentified model is never treated as unapproved — see
  // modelStatus() in the backend store.
  //
  // `modelParam` is a URL query parameter that names the model when present. It
  // is the cheapest and most reliable signal there is, so it is tried first.
  //
  // Verifying a picker: open the tool with DevTools and run
  //   document.querySelector('<selector>')?.innerText
  // It should print the model name the UI is showing.
  TOOLS: [
    {
      name: 'ChatGPT',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      // Tried in order; the content script also picks up any editable the user
      // actually types into, so a selector change upstream is not fatal.
      selectors: ['#prompt-textarea', 'div[contenteditable="true"]', 'form textarea'],
      sendSelectors: ['#composer-submit-button', 'button[data-testid="send-button"]', 'form button[type="submit"]'],
      modelParam: 'model',
      modelSelectors: [
        '[data-testid="model-switcher-dropdown-button"]',
        'button[aria-label*="model" i]',
        'button[aria-haspopup="menu"][id*="model" i]',
      ],
    },
    {
      name: 'Claude',
      hosts: ['claude.ai'],
      // Also a ProseMirror contenteditable, so writeText()'s insertText path applies.
      selectors: ['div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]'],
      sendSelectors: ['button[aria-label="Send message"]', 'button[aria-label*="Send" i]', 'fieldset button[type="submit"]'],
      modelSelectors: [
        '[data-testid="model-selector-dropdown"]',
        'button[aria-label*="model" i]',
        'button[aria-haspopup="listbox"]',
      ],
    },
    {
      name: 'Gemini',
      hosts: ['gemini.google.com'],
      // Composer lives inside a <rich-textarea> custom element.
      selectors: ['rich-textarea div[contenteditable="true"]', 'div[contenteditable="true"]'],
      sendSelectors: ['button.send-button', 'button[aria-label*="Send" i]', 'button[mattooltip*="Send" i]'],
      modelSelectors: [
        '.gds-mode-switch-button',
        'button[aria-label*="model" i]',
        'bard-mode-switcher button',
      ],
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

// Which model the tool currently has selected, as the UI writes it — or '' when
// it cannot be told. Read lazily, at the moment a prompt is about to be sent,
// rather than watched: a MutationObserver on somebody else's picker would run
// all session for a value that only matters at send time.
//
// Returning '' is a legitimate answer and the common one on tools with no
// picker. The backend treats an unidentified model as UNKNOWN and lets it
// through, because the alternative — blocking whenever the register cannot name
// what it is looking at — punishes the employee for a stale register.
globalThis.AIP_CONFIG.readModel = function readModel(tool, doc = document, url = location.href) {
  if (!tool) return ''

  // A model named in the URL is stated rather than inferred, so it wins.
  if (tool.modelParam) {
    try {
      const value = new URL(url).searchParams.get(tool.modelParam)
      if (value) return String(value).trim()
    } catch {
      /* not a parseable URL — fall through to the picker */
    }
  }

  for (const sel of tool.modelSelectors || []) {
    const el = doc.querySelector(sel)
    // innerText, not textContent: the picker's accessible label and its hidden
    // menu items are all textContent, and concatenating them produces a string
    // that matches several models at once.
    const text = (el?.innerText || '').trim()
    if (!text) continue
    // Pickers are short labels. Anything long is the menu, not the selection.
    const firstLine = text.split('\n')[0].trim()
    if (firstLine && firstLine.length <= 40) return firstLine
  }
  return ''
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
