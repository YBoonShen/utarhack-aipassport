// AI Passport — content script for approved AI tools.
//
// This is the Smart Gateway checkpoint. It sits *in front of* the AI site's own
// send action: the prompt is intercepted, checked and masked before the site is
// ever allowed to submit it, so raw personal data never leaves the browser.
//
// Two layers of behaviour:
//   1. While typing — a debounced preview check that warns early. Advisory only.
//   2. On send (Enter / send button / form submit) — the blocking checkpoint.
//      Nothing reaches the AI provider until this has run.
//
// Deliberately cheap: capturing listeners on window instead of MutationObservers
// or polling. That survives the AI site's SPA navigation and dynamically
// rendered composers, and the extension does nothing until the employee types.
//
// Standing rule, because this code runs in front of somebody else's product:
// **the protection layer must never be the reason a prompt cannot be sent.**
// Every path that intercepts an event is responsible for reaching one of three
// ends — send it, show the employee a panel with the prompt still in their
// composer, or hand the send back. A watchdog enforces that; see beginWork().

(function () {
  const CFG = globalThis.AIP_CONFIG
  const RULES = globalThis.AIP_RULES
  const STATE = globalThis.AIP_STATE
  const tool = CFG.matchTool(location.hostname)
  if (!tool) return // not an AI tool this extension knows about

  // Re-injection — the popup's ensureCheckpoint, an extension reload, a manual
  // Load unpacked — must *replace* the previous copy, never stack on it. The old
  // boolean guard made the second copy a no-op instead, which is how a reloaded
  // extension left the page holding an orphaned script: one whose chrome.*
  // bridge is dead but whose capture listeners still sit in front of the send
  // button, cancelling every prompt. Tearing the previous instance down first
  // makes reinjection the repair it was meant to be.
  try {
    globalThis.__aipCheckpoint?.teardown('replaced')
  } catch {
    /* the previous copy may be orphaned; its listeners are gone either way */
  }

  const EDITABLE_TAGS = new Set(['TEXTAREA', 'INPUT'])

  let activeEl = null
  let debounceTimer = null
  let lastChecked = '' // last text sent to the backend — never re-sent unchanged
  let lastResult = null // its result, reused by the checkpoint so send is instant
  let ourOwnText = '' // text this extension wrote; must not re-trigger detection
  let panel = null
  let panelKind = null // which panel is on screen, so a notice can't hide a checkpoint

  // ---- protection state -----------------------------------------------------
  // Read, never derived. background.js publishes one record to chrome.storage;
  // this script mirrors it and re-reads on every change. `unknown` is not `off`:
  // during the first milliseconds after injection nothing has been resolved yet,
  // and treating that as "protection unavailable" was the original bug.

  let protection = STATE.UNKNOWN
  let armed = false // listeners installed and not torn down
  let alive = true // the chrome.* bridge still belongs to a live extension

  // ---- checkpoint state -----------------------------------------------------
  // `clearedText` is the exact string the checkpoint has approved to leave the
  // browser (either verified clean, or masked by us). `passThrough` covers the
  // instant in which we re-fire the site's own send action. Together they stop
  // our own resubmission from being intercepted again — no loops, no doubles.
  let clearedText = ''
  let passThrough = false
  let checking = false

  // The open checkpoint, if any: { text, masked, detections, layer2, origin }.
  // While this is set nothing has been sent — the prompt is held in the composer
  // and only "Send safe version" releases it. `sending` makes that click
  // idempotent, so a double-click cannot produce two submissions.
  let pending = null
  let sending = false
  let watchdog = null

  // ---- talking to the service worker ---------------------------------------

  // An MV3 service worker is not always running. A message sent to a worker that
  // is being torn down resolves with nothing, or rejects with a closed port —
  // both transient, both fixed by asking again, and neither a reason to tell the
  // employee their protection has failed. Only a genuine handler error (the
  // backend answered badly) or a dead extension is reported as such.
  async function ask(message, { retries = 1 } = {}) {
    if (!alive) return { __error: 'AI Passport was reloaded', __fatal: true }
    if (contextGone()) {
      teardown('context-invalidated')
      return { __error: 'AI Passport was reloaded', __fatal: true }
    }

    for (let attempt = 0; ; attempt++) {
      try {
        const res = await withTimeout(chrome.runtime.sendMessage(message), CFG.askTimeoutMs)
        if (res?.ok) return res.data
        // A defined-but-not-ok reply is the worker reporting a real failure.
        if (res) return { __error: res.error || 'Smart Gateway error' }
        // Undefined: nobody answered. The worker was asleep — wake it and retry.
        if (attempt < retries) {
          CFG.log('worker', `no reply to ${message.type}, retrying`)
          await sleep(150)
          continue
        }
        return { __error: 'The Smart Gateway did not respond', __transient: true }
      } catch (err) {
        const text = String(err?.message || err)
        if (/context invalidated|Extension context/i.test(text)) {
          teardown('context-invalidated')
          return { __error: 'AI Passport was reloaded', __fatal: true }
        }
        if (attempt < retries) {
          CFG.log('worker', `${message.type} failed (${text}), retrying`)
          await sleep(150)
          continue
        }
        return { __error: text, __transient: true }
      }
    }
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms))

  // chrome.runtime.id is undefined once this script has been orphaned by an
  // extension reload. Checking it is cheaper — and far more reliable — than
  // waiting for the exception every call would otherwise throw.
  function contextGone() {
    try {
      return !chrome.runtime?.id
    } catch {
      return true
    }
  }

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for the Smart Gateway')), ms)
      promise.then(
        value => { clearTimeout(timer); resolve(value) },
        err => { clearTimeout(timer); reject(err) }
      )
    })
  }

  // ---- protection state, mirrored from storage ------------------------------

  function applyState(next, source) {
    if (!next || next.at < protection.at) return
    const before = protection.status
    protection = next
    if (before === next.status) return

    CFG.log('state', `${before} → ${next.status} (${source})`, { mode: next.mode, online: next.online })

    if (!next.active) {
      // Protection just went off — a logout, or an admin session. Anything held
      // for review is void: leaving a checkpoint on screen would strand the
      // employee behind a decision nothing can complete any more.
      pending = null
      sending = false
      endWork()
      hidePanel()
      if (next.status === 'signedOut' || next.status === 'notEmployee') maybeShowSignedOut(next)
    } else if (panelKind === 'signedout') {
      // Protection came back, so the panel telling the employee they are not
      // signed in is now false. It closes itself rather than waiting to be
      // dismissed — a sign-in notice that outlives the sign-in is the one thing
      // it must never do.
      hidePanel()
      // Signing in ends this signed-out episode, so the notice is armed again
      // for the next one. Without this it would be shown once and never again.
      clearSignedOutNotice()
      // …and the destination banner is resolved for the employee who just
      // arrived: their licence level and tool access were unknowable a moment
      // ago, so whatever this page's standing is, it is only knowable now.
      reviewDestination(lastModel || '')
    }
  }

  async function readStoredState() {
    try {
      const stored = await chrome.storage.local.get(STATE.KEY)
      return stored[STATE.KEY] || null
    } catch {
      return null // orphaned context; ask() will notice and tear down
    }
  }

  // Startup order matters. Storage is local and answers in about a millisecond,
  // so the tab knows where it stands before the employee can finish a word;
  // the worker is then asked for a fresh answer, which also warms it up so the
  // first real prompt does not pay the cold-start cost.
  async function initState() {
    applyState(await readStoredState(), 'storage')
    const fresh = await ask({ type: 'AIP_STATE' })
    if (!fresh.__error) applyState(fresh, 'worker')
    CFG.log('init', `checkpoint armed on ${tool.name}`, { protection: protection.status })
  }

  function onStorageChanged(changes, area) {
    if (area !== 'local' || !changes[STATE.KEY]) return
    applyState(changes[STATE.KEY].newValue, 'broadcast')
  }

  // Signing in happens on the dashboard, in another tab, on another origin —
  // nothing tells this page about it. Asking when the tab is looked at again
  // turns "sign in, switch back to ChatGPT" into working protection without a
  // reload. Throttled so tab-flicking cannot become a request loop.
  let lastNudge = 0
  function nudgeState() {
    if (!armed) return

    // Two throttles stand between signing in and this tab noticing: the one
    // below, and the service worker's own cached record (stateTtlMs), which an
    // unforced AIP_STATE is answered from. Together they could leave the
    // "you are not signed in" panel on screen for the better part of a minute
    // after the employee had signed in — the panel outliving the very condition
    // it describes.
    //
    // So when that panel is the one on screen, this asks urgently: no local
    // throttle, and `force` so the worker re-fetches instead of repeating the
    // answer it already has. It is at most one extra request, and only in the
    // state where the tab is displaying something it has reason to doubt.
    const urgent = panelKind === 'signedout'
    if (!urgent && Date.now() - lastNudge < CFG.stateTtlMs) return
    lastNudge = Date.now()
    ask({ type: 'AIP_STATE', force: urgent }).then(res => {
      if (!res.__error) applyState(res, urgent ? 'nudge-urgent' : 'nudge')
    })
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') nudgeState()
  }

  function onPageHide(e) {
    if (!e.persisted) teardown('pagehide')
  }

  function onPageShow(e) {
    if (!e.persisted) return
    CFG.log('init', 'restored from bfcache — re-resolving protection state')
    nudgeState()
  }

  // ---- finding and reading the composer ------------------------------------

  function asEditable(node) {
    if (!node || node.nodeType !== 1) return null
    if (EDITABLE_TAGS.has(node.tagName)) return node
    const editable = node.closest?.('[contenteditable="true"], [contenteditable=""]')
    return editable || null
  }

  // Falls back to the configured selectors when nothing has been typed into yet.
  function findComposer() {
    if (activeEl?.isConnected) return activeEl
    for (const sel of tool.selectors) {
      const el = document.querySelector(sel)
      if (el) return el
    }
    return null
  }

  function readText(el) {
    if (!el) return ''
    return EDITABLE_TAGS.has(el.tagName) ? el.value : el.innerText
  }

  // Writes text so the AI site's own framework state updates too — setting
  // .value or .textContent alone leaves React/ProseMirror holding the old
  // prompt, and the site would send the unmasked original.
  function writeText(el, text) {
    el.focus()

    if (EDITABLE_TAGS.has(el.tagName)) {
      // Bypass React's value tracker so it doesn't swallow the change.
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set
      if (setter) setter.call(el, text)
      else el.value = text
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }

    // contenteditable (ChatGPT / Claude ProseMirror, Gemini rich-textarea):
    // replacing the selection through execCommand produces real
    // beforeinput/input events, which the editor processes as a normal edit —
    // so the site's internal state holds the masked text, not just the DOM.
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)

    let ok = false
    try {
      ok = document.execCommand('insertText', false, text)
    } catch {
      ok = false
    }
    if (!ok) {
      el.textContent = text
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
    }
    return true
  }

  // ---- finding the send control --------------------------------------------

  function sendSelector() {
    return (tool.sendSelectors || []).concat(CFG.sendFallback).join(', ')
  }

  // "Stop generating" reuses the send button on several tools. Cancelling that
  // click would leave the employee unable to stop the model — an interception
  // with nothing to check.
  const STOP_CONTROL = '[data-testid="stop-button"], [aria-label*="stop" i]'

  // The clicked node, resolved to the site's send button (or null when the
  // click was something else entirely).
  function asSendButton(node) {
    if (!node || node.nodeType !== 1) return null
    // An explicitly configured send control counts whatever element it is built
    // from: DeepSeek and Kimi compose theirs out of plain divs, so requiring a
    // <button> or role="button" would let those clicks past the checkpoint.
    const btn = node.closest?.(sendSelector()) || node.closest?.('button, [role="button"]')
    if (!btn) return null
    if (btn.matches(STOP_CONTROL)) return null
    return btn.matches(sendSelector()) ? btn : null
  }

  /**
   * Any control inside the composer, used only when a refusal is already in
   * force for the text sitting in it.
   *
   * asSendButton above can only recognise a send control it can *name*, and on
   * a tool whose button is a div with generated class names and no usable
   * aria-label there is nothing to name. On DeepSeek that meant a prompt the
   * gateway had already refused was sent anyway: the checkpoint never ran,
   * because the click never looked like a send.
   *
   * So when the gateway has decided this exact text must not leave, the net is
   * widened to any button inside the composer's own container. The trade is
   * deliberate and bounded: at worst an unrelated composer toggle takes one dead
   * click, and only while a prompt that cannot be sent is sitting in the box. In
   * every other state the conservative match above is the only one that applies,
   * so ordinary use of the site is untouched.
   */
  function asComposerControl(node) {
    if (!node || node.nodeType !== 1) return null
    const btn = node.closest?.('button, [role="button"], [type="submit"]')
    if (!btn || btn.matches(STOP_CONTROL)) return null

    const el = findComposer()
    if (!el) return null
    // The composer's own form, or the nearest few ancestors when it has none —
    // enough to reach the toolbar the send control sits in, not the whole page.
    let scope = el.closest('form')
    if (!scope) {
      scope = el
      for (let i = 0; i < 4 && scope.parentElement; i++) scope = scope.parentElement
    }
    return scope.contains(btn) && !el.contains(btn) ? btn : null
  }

  /**
   * Has the gateway already refused the text currently in the composer?
   *
   * Read from the debounced preview, which has run against this exact string —
   * `lastChecked` is what makes it "this text" rather than "some earlier text".
   * A banned destination refuses everything; anything else refuses only when
   * something sensitive was actually found.
   */
  function refusalInForce(text) {
    if (lastChecked !== text || !lastResult) return false
    if (lastResult.policy?.banned) return true
    return lastResult.mode === 'Block' && (lastResult.detections || []).length > 0
  }

  function findSendButton() {
    for (const sel of (tool.sendSelectors || []).concat(CFG.sendFallback)) {
      const el = document.querySelector(sel)
      if (el && !el.disabled) return el
    }
    return null
  }

  // ---- protection panel (shadow DOM so page CSS can't reach it) ------------

  function ensurePanel() {
    if (panel) return panel

    const host = document.createElement('div')
    host.id = 'ai-passport-host'
    // Only the host is styled inline; everything inside lives in the shadow root.
    host.style.cssText = 'position:fixed;z-index:2147483647;right:20px;bottom:20px;'
    const shadow = host.attachShadow({ mode: 'open' })

    // Guarded: getURL throws on an orphaned context, and an unstyled panel is
    // still infinitely better than an exception thrown while holding a prompt.
    try {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = chrome.runtime.getURL('styles.css')
      shadow.appendChild(link)
    } catch {
      /* no stylesheet available */
    }

    const card = document.createElement('div')
    card.className = 'aip-card'
    shadow.appendChild(card)

    document.documentElement.appendChild(host)
    panel = { host, shadow, card }
    return panel
  }

  // Hiding also empties the card. Leaving the markup behind would keep a live
  // "Send safe version" button in the shadow DOM after the checkpoint was
  // dismissed or already sent — invisible, but still clickable by script.
  function hidePanel() {
    panelKind = null
    if (!panel) return
    panel.host.style.display = 'none'
    panel.card.innerHTML = ''
  }

  // `size` names a layout modifier rather than meaning "wide":
  //   'wide'  — the checkpoint's own shell (its own padding and header band)
  //   'roomy' — an ordinary panel that needs a little more width for a list
  // It used to be a boolean that mapped to 'aip-wide' for both, so a notice
  // carrying approved alternatives silently borrowed the checkpoint's
  // zero-padding cream shell and stopped looking like a notice at all.
  function showPanel(kind, html, actions, size) {
    const p = ensurePanel()
    panelKind = kind
    p.host.style.display = 'block'
    p.card.className = size ? `aip-card aip-${size}` : 'aip-card'
    p.card.innerHTML = html
    // Closing is wired here, once, for every panel there will ever be. Each
    // panel used to declare its own `[data-close]` handler, so a panel that
    // forgot to — or that listed only some of its close controls — shipped a
    // button that did nothing. The checkpoint still overrides it below, because
    // closing *that* panel has to drop the prompt it is holding.
    const wired = { '[data-close]': dismiss, ...actions }
    for (const [selector, handler] of Object.entries(wired)) {
      // querySelectorAll, not querySelector: every panel carries the header's
      // `data-close` ×, and several add a second `data-close` — the visible
      // "Dismiss" button. Binding only the first match left that button inert
      // while the × beside it worked, which reads to the employee as a panel
      // that will not close. A selector names an action here, not one element.
      for (const el of p.card.querySelectorAll(selector)) {
        el.addEventListener('click', handler)
      }
    }
    return p
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  function chipsHtml(detections) {
    return detections
      .map(d => `<span class="aip-chip">${esc(CFG.detectionLabel(d.type))} ×${d.count}</span>`)
      .join('')
  }

  // Who is speaking, on one line. The second line — an all-caps "SMART GATEWAY"
  // kicker under the product name — said nothing the panel below it did not, and
  // it was the first thing the eye hit. The state it carried is now a 6px dot.
  function header(state) {
    return `
      <div class="aip-head">
        <span class="aip-ring">A</span>
        <div class="aip-title">
          <p class="aip-name">AI Passport</p>
          <span class="aip-kicker aip-${state}" aria-hidden="true"></span>
        </div>
        <button class="aip-x" data-close aria-label="Dismiss">×</button>
      </div>`
  }

  const countOf = detections => (detections || []).reduce((n, d) => n + d.count, 0)

  // ---- while-typing preview (advisory) --------------------------------------

  function scheduleCheck() {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => runCheck().catch(err => CFG.logError('preview', err)), CFG.debounceMs)
  }

  async function runCheck() {
    if (checking || sending) return // the checkpoint is mid-flight; it owns the panel
    if (!protection.active) return
    const el = findComposer()
    if (!el) return hidePanel()
    activeEl = el

    const text = readText(el)
    // Safe prompt, our own masked text, or nothing worth checking: stay invisible.
    if (!text || text.trim().length < CFG.minPromptLength) return hidePanel()
    if (text === ourOwnText) return hidePanel()
    if (text === lastChecked) return // unchanged since the last call — no request

    lastChecked = text
    lastResult = null

    // Degraded means the gateway is unreachable. Firing a request every 500ms at
    // a backend we already know is down is pure noise; the local rules give the
    // same early warning for free.
    if (!protection.online) {
      const local = RULES.mask(text, protection.settings?.controls)
      if (local.detections.length === 0) return hidePanel()
      return renderWarning(text, { detections: local.detections, mode: protection.mode, offline: true })
    }

    const res = await ask({ type: 'AIP_DETECT', prompt: text, tool: tool.name, model: currentModel() })
    if (res.__error) {
      // Advisory only. The checkpoint re-checks on send and has its own fallback,
      // so a failed preview is logged and otherwise ignored.
      CFG.log('preview', 'check failed, deferring to the checkpoint', res.__error)
      return
    }
    // The employee kept typing while we waited — that keystroke already queued
    // another check, so this stale result is dropped.
    if (readText(findComposer()) !== text) return

    lastResult = res
    if (!res.detections || res.detections.length === 0) return hidePanel()
    renderWarning(text, res)
  }

  // Early warning while typing. Purely informational — the real enforcement
  // happens at the checkpoint, so this never has to be acted on.
  function renderWarning(original, res) {
    const total = countOf(res.detections)
    const plural = total === 1 ? '' : 's'
    const state = res.mode === 'Block' ? 'block' : res.mode === 'Warn only' ? 'warn' : 'ok'
    // A Block warning has to say *which* block, because the way out differs:
    // a policy block needs a different prompt, an unapproved tool or model needs
    // a different destination. Saying "company policy" for all four would send
    // the employee to edit a prompt that was never the problem.
    const blockNote = {
      'tool-banned': `${tool.name} is banned by your organisation, so nothing is sent from here — this prompt included.`,
      'model-banned': `${res.policy?.model?.name || 'The selected model'} is banned by your organisation, so nothing is sent to it at all.${res.policy?.approvedModels?.length ? ` Switch to ${res.policy.approvedModels.join(' or ')}.` : ''}`,
      'tool-unapproved': `This AI tool is not approved by your organisation, so this prompt will not be sent from here. Remove the ${total} item${plural} above, or use an approved tool.`,
      'tool-suspended': `${tool.name} has been suspended organisation-wide. This prompt will not be sent from here.`,
      'model-unapproved': `${res.policy?.model?.name || 'The selected model'} has not been reviewed, so this prompt will not be sent to it.${res.policy?.approvedModels?.length ? ` Switch to ${res.policy.approvedModels.join(' or ')}.` : ''}`,
      'model-level': `${res.policy?.model?.name || 'The selected model'} is above your AI License level, so this prompt will not be sent to it.${res.policy?.approvedModels?.length ? ` ${res.policy.approvedModels.join(' or ')} ${res.policy.approvedModels.length === 1 ? 'is' : 'are'} available to you now.` : ''}`,
      'data-scope': `${tool.name} is not cleared to receive ${detectedSummary(res.detections)}. Remove the ${total} item${plural} above before sending.`,
      'org-policy': `Company policy blocks prompts containing personal data. Remove the ${total} item${plural} above before sending.`,
    }[res.policy?.reason || 'org-policy']

    const note = res.offline
      ? `The Smart Gateway is unreachable, so this was checked on your device with Layer 1 rules. You will still be shown a safe version before anything is sent.`
      : res.mode === 'Block'
        ? blockNote
        : res.mode === 'Warn only'
          ? `Your organisation's policy is <strong>Warn only</strong>. Nothing has been changed — you will be asked what to do when you send.`
          : `When you send, the checkpoint will show you the safe version first. Nothing leaves this browser until you approve it.`

    showPanel(
      'warning',
      `${header(state)}
       <p class="aip-lead">Sensitive information detected</p>
       <div class="aip-chips">${chipsHtml(res.detections)}</div>
       <p class="aip-body">${note}</p>
       <div class="aip-actions"><button class="aip-btn aip-ghost" data-edit>Edit prompt</button></div>`,
      { '[data-edit]': dismissToEdit }
    )
  }

  // ---- the checkpoint -------------------------------------------------------
  // Everything below runs *before* the AI site is allowed to submit.

  // Nothing may hold a prompt indefinitely. beginWork arms a deadline; if the
  // checkpoint has not reached a decision by then, the locks are dropped and the
  // composer belongs to the employee again. Without this, one hung await turns
  // Enter and the Send button into dead keys for the rest of the session — the
  // silent failure that made the AI site look broken.
  function beginWork(label) {
    checking = true
    clearTimeout(watchdog)
    watchdog = setTimeout(() => releaseStuck(label), CFG.releaseMs)
  }

  function endWork() {
    clearTimeout(watchdog)
    watchdog = null
    checking = false
  }

  function releaseStuck(label) {
    CFG.logError('checkpoint', `${label} reached no decision in ${CFG.releaseMs}ms — releasing the composer`)
    checking = false
    sending = false
    pending = null
    showNotice(
      'Protection timed out',
      'AI Passport could not finish checking that prompt, so it has released your message box. Your prompt is untouched — press send again to try once more.'
    )
  }

  // Re-fires the site's own send action, exactly once, with the approved text
  // already in the composer.
  function fireSend(origin) {
    const btn = origin.btn?.isConnected ? origin.btn : findSendButton()
    if (btn && !btn.disabled) {
      btn.click()
      return true
    }
    // No send button found — fall back to the Enter key the employee pressed.
    const el = origin.el?.isConnected ? origin.el : findComposer()
    if (!el) return false
    el.focus()
    for (const type of ['keydown', 'keypress', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true, composed: true,
      }))
    }
    return true
  }

  // Marks `text` as approved and lets it go. The composer already holds it.
  async function approveAndSend(text, origin) {
    clearedText = text
    ourOwnText = text
    lastChecked = text
    passThrough = true
    // One frame for the site's React state to settle after writeText() — a send
    // button that was disabled while the composer was mid-update is enabled
    // again by the time we click it.
    await sleep(80)
    try {
      fireSend(origin)
      CFG.log('send', 'prompt submitted', { chars: text.length, via: origin.kind })
    } catch (err) {
      CFG.logError('send', err)
    } finally {
      setTimeout(() => { passThrough = false }, 0)
    }
  }

  // The single entry point for every send path (Enter, button, form submit).
  async function checkpoint(text, origin) {
    if (checking || sending) return // already checking, or a confirmed send is in flight

    // A checkpoint is already open. Pressing Enter again must re-show it, not
    // re-detect and certainly not send — only the button sends.
    if (pending) {
      if (pending.text === text) return renderCheckpoint()
      pending = null // the prompt changed, so the reviewed version is stale
    }

    beginWork('checkpoint')
    try {
      // The state may not have arrived yet — an AI page reloaded a moment ago,
      // or a worker that had gone to sleep. Resolve it *now* instead of guessing:
      // guessing "off" leaks the prompt, guessing "on" produced the spurious
      // unavailable panel.
      if (protection.status === 'unknown') {
        const res = await ask({ type: 'AIP_STATE' })
        if (!res.__error) applyState(res, 'checkpoint')
        // Still unknown, and the extension itself is alive: the worker could not
        // be reached. Not knowing whether this employee is protected is not a
        // reason to send their prompt unexamined — the local rules take it.
        else if (!res.__fatal && protection.status === 'unknown') {
          return fallback(text, origin, res.__error)
        }
      }

      // Protection is genuinely off (nobody signed in, or the extension has been
      // torn down). We intercepted only to keep the ordering; hand the send
      // straight back untouched.
      if (!protection.active) {
        CFG.log('checkpoint', `protection ${protection.status} — passing the prompt through`)
        hidePanel()
        await approveAndSend(text, origin)
        return
      }

      // Which model this is going to, read now rather than watched. It travels
      // with the detection call so the mode that comes back is the one that
      // really applies to *this* prompt on *this* model.
      const model = noteModel(currentModel())

      CFG.log('checkpoint', 'intercepted', {
        chars: text.length, via: origin.kind, state: protection.status, model: model || 'unknown',
      })

      // Is this destination banned? Asked first, and asked about every prompt,
      // because a ban is the one refusal that has nothing to do with what the
      // employee typed: "hello" to a model withdrawn after a breach is still a
      // prompt to a model withdrawn after a breach. Every other rule here is
      // about content and can wait until the content has been looked at.
      //
      // The answer is cached per tool + model for a minute in the worker, so
      // this costs a message rather than a request on all but the first send.
      const verdict = await ask({ type: 'AIP_TOOL', tool: tool.name, model })
      if (!verdict.__error && verdict.banned) return showBanned(verdict, model)

      // Too short to carry an identifier: the backend is never called for it,
      // matching the same threshold the preview check uses.
      if (text.trim().length < CFG.minPromptLength) {
        hidePanel()
        await approveAndSend(text, origin)
        return
      }

      // Already known to be offline: go straight to the local rules rather than
      // making the employee wait out a request that is going to fail.
      if (!protection.online) return fallback(text, origin, 'The Smart Gateway is unreachable')

      // Reuse the debounced preview when it is for exactly this text, so the
      // common case (employee finished typing, then pressed send) is instant.
      let res = lastChecked === text && lastResult ? lastResult : null
      if (!res) {
        showPanel(
          'checking',
          `${header('ok')}
           <p class="aip-lead">Checking your prompt…</p>
           <p class="aip-body">AI Passport is checking for personal data before this prompt leaves your browser.</p>`,
          {}
        )
        CFG.log('detect', 'request started', { chars: text.length })
        res = await ask({ type: 'AIP_DETECT', prompt: text, tool: tool.name, model })
      }

      // Detection failed. The prompt is NOT sent unchecked — but it is not left
      // stuck either: the local Layer 1 rules take over from here.
      if (res.__error) {
        CFG.logError('detect', 'request failed', res.__error)
        return fallback(text, origin, res.__error)
      }

      CFG.log('detect', 'request completed', {
        detections: (res.detections || []).map(d => d.type), mode: res.mode, layer2: res.layer2,
      })

      lastChecked = text
      lastResult = res

      // The gateway may have learned of a ban between the arrival check above
      // and this answer — an admin banning a model reaches an open tab within
      // the minute — so the fresher verdict wins.
      if (res.policy?.banned) return showBanned({ ...res.policy, banned: true }, model)

      if (!res.detections || res.detections.length === 0) {
        hidePanel()
        // Clean prompt: record the event (this is the audit entry for a sent
        // prompt) and send the original untouched. Fire-and-forget so the
        // employee is never made to wait on logging.
        commit(text)
        await approveAndSend(text, origin)
        return
      }

      if (res.mode === 'Block') return showBlocked(res, origin, model)
      if (res.mode === 'Warn only') return showWarnOnly(text, res, origin)
      // Mask and continue: hold the prompt and show the checkpoint. Nothing is
      // submitted until the employee confirms.
      showCheckpoint(text, res, origin)
    } catch (err) {
      // Anything unforeseen in here would otherwise strand a prompt the employee
      // can no longer send. The local rules still get the last word.
      CFG.logError('checkpoint', err)
      fallback(text, origin, String(err?.message || err))
    } finally {
      endWork()
    }
  }

  // The audit record. Fire-and-forget in every case: the mask is already decided,
  // so a failed write must never hold up the employee's prompt.
  function commit(text) {
    ask({ type: 'AIP_COMMIT', prompt: text, tool: tool.name, model: currentModel() }).then(res => {
      if (res.__error) CFG.logError('commit', 'audit event not recorded', res.__error)
    })
  }

  // ---- which model is selected ----------------------------------------------
  //
  // Read on demand rather than watched. A MutationObserver on somebody else's
  // model picker would run for the whole session to answer a question that only
  // matters at the instant a prompt is sent, and this file's whole design is
  // cheap listeners over standing observers.
  //
  // Reading nothing is a normal answer — not every tool has a picker, and
  // upstream markup moves. The backend treats an unidentified model as UNKNOWN
  // and lets it through; blocking on "we could not tell" would punish the
  // employee for the register being out of date.

  let lastModel = null

  function currentModel() {
    try {
      return CFG.readModel(tool)
    } catch (err) {
      CFG.logError('model', err)
      return ''
    }
  }

  // A change of model is worth recording even when no prompt follows it, so an
  // admin sees the switch. Deduped on the value, so re-reading the same label
  // costs nothing.
  function noteModel(model) {
    if (!model || model === lastModel) return model
    const first = lastModel === null
    lastModel = model
    CFG.log('model', `selected: ${model}`)
    // The arrival already reported the model it found, so only a genuine change
    // is sent separately — and the standing banner is re-resolved with it, so a
    // switch onto a banned model says so before a prompt is typed rather than
    // after one has been written.
    if (!first) {
      ask({ type: 'AIP_MODEL_USE', tool: tool.name, model }).catch(() => {})
      reviewDestination(model)
    }
    return model
  }

  // The audit record for a prompt sent while the gateway was down. Held by the
  // service worker and posted when the gateway answers again, so an outage costs
  // the admin's log nothing but a delay.
  //
  // `safe` is what may be written to disk, and it is never the employee's raw
  // prompt: the masked version when Layer 1 caught something, and a text-free
  // placeholder when it did not. A clean prompt still needs to be *counted* —
  // otherwise every outage quietly deflates "prompts protected" — but its text
  // has been through no masking pass, so it is not what gets parked in storage.
  function queueOffline(safe) {
    ask({ type: 'AIP_QUEUE', masked: safe, tool: tool.name, at: new Date().toISOString() }).then(res => {
      if (res.__error) CFG.logError('queue', 'offline event not held', res.__error)
      else CFG.log('queue', `offline event held (${res.pending} pending)`)
    })
  }

  // Plain ASCII: this string is the audit record itself, and it travels through
  // JSON, the store and an exported HTML report before an auditor reads it.
  const CLEAN_OFFLINE_RECORD = '(clean prompt - checked on device, text not retained)'

  // ---- graceful fallback ----------------------------------------------------

  // The Smart Gateway could not answer. This is the one path that decides what
  // happens then, and it has exactly two outcomes — never a dead end:
  //
  //   nothing sensitive found locally → send it, because refusing to send an
  //     ordinary prompt is breaking the tool for no benefit;
  //   something sensitive found       → the same checkpoint as always, masked
  //     with the local Layer 1 rules and labelled as the fallback it is.
  //
  // What it never does is send content it *knows* is sensitive.
  function fallback(text, origin, reason) {
    const local = RULES.mask(text, protection.settings?.controls)
    CFG.log('fallback', 'local Layer 1 took over', {
      reason, detections: local.detections.map(d => d.type),
    })

    if (local.detections.length === 0) {
      hidePanel()
      queueOffline(CLEAN_OFFLINE_RECORD)
      return approveAndSend(text, origin)
    }
    pending = { text, masked: local.masked, detections: local.detections, layer2: 'none', origin, offline: true, reason }
    renderCheckpoint()
  }

  // "name, IC number and financial amount" — the same summary the web Gateway's
  // checkpoint prints under the two prompt blocks.
  function detectedSummary(detections) {
    const labels = (detections || []).map(d => CFG.detectionLabel(d.type).toLowerCase())
    if (labels.length <= 1) return labels[0] || 'sensitive content'
    return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
  }

  // Highlights the [MASKED-…] tokens inside already-escaped text.
  function highlightTokens(escaped) {
    return escaped.replace(/\[MASKED-[A-Z-]+\]/g, t => `<span class="aip-tok">${t}</span>`)
  }

  // Mask and continue: show the checkpoint and STOP. Nothing is submitted here —
  // the employee reviews the safe version and releases it with the button. This
  // is the whole point of a checkpoint: an automatic send would give them no
  // opportunity to review what the AI tool is about to receive.
  function showCheckpoint(original, res, origin) {
    pending = { text: original, masked: res.masked, detections: res.detections, layer2: res.layer2, origin }
    renderCheckpoint()
  }

  function renderCheckpoint() {
    if (!pending) return
    const total = countOf(pending.detections)
    const layer2 = pending.layer2 && pending.layer2 !== 'none'
      ? ` &nbsp;·&nbsp; Layer 2: ${pending.layer2 === 'gemini' ? 'Gemini AI' : 'context heuristic'}`
      : ''
    const provenance = pending.offline
      ? 'Masked on your device · the Smart Gateway was unreachable, so names are not checked. The masked record is held and added to your audit log when it is back'
      : `Detected: ${esc(detectedSummary(pending.detections))}${layer2} &nbsp;·&nbsp; Audit records store only the masked version`

    const p = showPanel(
      'checkpoint',
      `<div class="aip-cp-head">
         <span class="aip-cp-ring">✓</span>
         <div>
           <p class="aip-cp-title">Checkpoint — Smart Gateway</p>
           <p class="aip-cp-sub">${total} sensitive item${total === 1 ? '' : 's'} found. Review the safe version before sending.</p>
         </div>
       </div>
       <div class="aip-cp-body">
         <p class="aip-cp-label">YOUR ORIGINAL PROMPT</p>
         <div class="aip-cp-original">${esc(pending.text)}</div>

         <p class="aip-cp-label">SAFE VERSION · WHAT THE AI TOOL RECEIVES</p>
         <div class="aip-cp-safe">${highlightTokens(esc(pending.masked))}</div>

         <div class="aip-cp-meta${pending.offline ? ' aip-offline' : ''}">
           <span class="aip-cp-dot"></span>
           <p>${provenance}</p>
         </div>

         <div class="aip-cp-why" data-why hidden>
           Personal identifiers (names, IC/passport numbers, phone numbers, credentials, financial figures) can identify a specific person.
           Masking them keeps the prompt useful while your company's data never leaves the browser.
         </div>

         <div class="aip-cp-actions">
           <button class="aip-btn aip-gold aip-cp-send" data-send>Send safe version&nbsp;&nbsp;→</button>
           <button class="aip-btn aip-ghost" data-edit>Edit prompt</button>
           <button class="aip-cp-link" data-whytoggle>Why was this masked?</button>
         </div>
       </div>`,
      {
        '[data-send]': confirmSend,
        '[data-edit]': cancelCheckpoint,
        '[data-close]': cancelCheckpoint,
        '[data-whytoggle]': () => {
          const why = p.card.querySelector('[data-why]')
          if (why) why.hidden = !why.hidden
        },
      },
      'wide'
    )
  }

  // The only path that releases a masked prompt. Uses the exact string shown in
  // the SAFE VERSION block, so what was reviewed is what gets sent.
  async function confirmSend() {
    if (!pending || sending) return // double-click, or already gone
    sending = true
    beginWork('confirmSend')

    try {
      const { text, masked, origin, offline } = pending
      const btn = panel?.card.querySelector('[data-send]')
      if (btn) {
        btn.disabled = true
        btn.textContent = 'Sending…'
      }

      const el = origin.el?.isConnected ? origin.el : findComposer()
      if (!el) {
        CFG.logError('confirmSend', 'the composer disappeared before the masked prompt could be placed')
        pending = null
        hidePanel()
        return
      }

      // The audit record for this send. The backend re-derives the mask from the
      // original and stores only that — the raw prompt is never persisted. Not
      // awaited: the safe version is already decided, and a slow or failed audit
      // write must not hold the employee's prompt hostage.
      //
      // Offline, the same record is queued instead of written. It carries the
      // masked text, which is what the log would have stored anyway.
      if (offline) queueOffline(masked)
      else commit(text)

      // Cleared before writing so the composer's own input event cannot treat this
      // as the employee editing the prompt and tear the checkpoint down mid-send.
      pending = null
      writeText(el, masked)
      CFG.log('mask', 'safe version placed in the composer', {
        from: text.length, to: masked.length, offline: Boolean(offline),
      })
      await approveAndSend(masked, { ...origin, el })

      // Only now, with the masked prompt placed and submitted, does it close.
      hidePanel()
    } catch (err) {
      // The masked text may or may not have made it into the composer. Either
      // way the employee gets their message box back, with their own prompt
      // still in it — never a disabled button and a panel that does nothing.
      CFG.logError('confirmSend', err)
      pending = null
      hidePanel()
      showNotice(
        'Could not send the safe version',
        'AI Passport hit an unexpected error while replacing your prompt. Nothing was sent. Your message box is yours again — check its contents and send when you are ready.'
      )
    } finally {
      sending = false
      endWork()
    }
  }

  function cancelCheckpoint() {
    pending = null
    dismissToEdit()
  }

  // The incident record for a prompt this checkpoint refused.
  //
  // The backend never sees it: the while-typing check runs with `preview: true`
  // and records nothing, and a refused prompt is never committed. Without this
  // call the employee is stopped and the organisation learns nothing, which is
  // the half of "guide, don't punish" that makes the guidance improvable.
  // Fire-and-forget, and types only — the categories found, never the text.
  function reportBlocked(reason, model, detections) {
    ask({
      type: 'AIP_BLOCKED',
      tool: tool.name,
      model: model || '',
      reason,
      types: (detections || []).map(d => d.type),
    }).then(res => {
      if (res.__error) CFG.logError('blocked', 'incident not recorded', res.__error)
    })
  }

  // The one-tap way out. An alternative is only offered when the register knows
  // a URL for it and this employee is approved for it — a suggestion that leads
  // nowhere is worse than no suggestion.
  function alternativesHtml(policy, label = 'APPROVED FOR YOU') {
    const alternatives = (policy.alternatives || []).slice(0, 2)
    if (!alternatives.length) return ''
    return `<div class="aip-alt">
         <p class="aip-alt-label">${label}</p>
         ${alternatives.map(a => `
           <a class="aip-alt-row" href="${esc(a.url)}" target="_blank" rel="noopener">
             <span class="aip-alt-name">${esc(a.name)}</span>
             <span class="aip-alt-scope">${esc(a.dataScope || '')}</span>
             <span class="aip-alt-go">Open&nbsp;→</span>
           </a>`).join('')}
       </div>`
  }

  // Banned: nothing is sent from here, and that is true of an ordinary question
  // too. This is the only panel that appears without the prompt having been
  // examined at all — it is about the destination, not the content — so it never
  // shows detection chips and never offers "edit prompt" as the way out. The way
  // out is a different model, or a different tool.
  function showBanned(policy, model) {
    const modelName = policy.model?.name || model
    const banned = policy.reason === 'tool-banned' ? 'tool' : 'model'
    const models = policy.approvedModels || []

    reportBlocked(policy.reason || 'model-banned', model, [])
    CFG.log('checkpoint', `refused — ${policy.reason}`, { tool: tool.name, model: modelName || 'unknown' })

    showPanel(
      'blocked',
      `${header('block')}
       <p class="aip-lead">${banned === 'tool'
        ? `${esc(tool.name)} is banned by your organisation`
        : `${esc(modelName || 'This model')} is banned by your organisation`}</p>
       <p class="aip-body">${banned === 'tool'
        ? `Nothing is sent to ${esc(tool.name)} from AI Passport — an ordinary question included. Your prompt is still in the message box; please move this work to an approved tool.`
        : `${esc(tool.name)} itself is fine. ${esc(modelName || 'The selected model')} has been withdrawn after a security concern, so no prompt is sent to it, whether or not it contains company data.${models.length ? ` Switch to ${esc(models.join(' or '))} and send again — everything works as normal there.` : ''}`}</p>
       ${banned === 'model' && models.length
        ? `<div class="aip-alt">
             <p class="aip-alt-label">APPROVED MODELS ON ${esc(tool.name.toUpperCase())}</p>
             ${models.map(m => `<div class="aip-alt-row"><span class="aip-alt-name">${esc(m)}</span><span class="aip-alt-scope">Approved for you</span></div>`).join('')}
           </div>`
        : alternativesHtml(policy)}
       <div class="aip-actions">
         <button class="aip-btn aip-ghost" data-tools>View my AI tools</button>
         <button class="aip-btn aip-gold" data-close>Got it</button>
       </div>`,
      {
        '[data-tools]': () => {
          window.open(`${CFG.dashboardBase}/tools`, '_blank', 'noopener')
        },
      },
      'roomy'
    )
  }

  // Block: the prompt is held in the composer and never sent.
  //
  // Several different things reach this panel and they are not the same message,
  // so it says which one happened and what to do about it. Each is a rule about
  // where the prompt was heading, and each has a way out the employee can take
  // right now — a different tool, a different model, more training, or a
  // different prompt.
  //
  // What none of them do is stop the employee using the site. The tool is
  // working normally the moment they take the personal data out, which is the
  // whole distinction between refusing the data and banning the tool.
  function showBlocked(res, origin, model) {
    const total = countOf(res.detections)
    const items = `${total} item${total === 1 ? '' : 's'}`
    const policy = res.policy || {}
    const reason = policy.reason || 'org-policy'
    const models = policy.approvedModels || []
    const modelName = policy.model?.name

    // The refusal reaches the admin dashboard as an incident. Reaching an
    // unapproved tool is a browser tab; trying to put company data into one is
    // the thing the approval workflow exists to catch.
    reportBlocked(reason, model, res.detections)

    // The headline carries the organisation's own sentence for the unapproved
    // case — the wording the employee has to recognise across the extension, the
    // web gateway and their AI Tools page — and the body carries the detail. The
    // sentence appears once, at the top, not again three lines down.
    const lead = {
      'tool-unapproved': 'This AI tool is not approved by your organisation',
      'tool-suspended': `${tool.name} has been suspended`,
      'model-unapproved': `${modelName || 'This model'} is not approved`,
      'model-level': `${modelName || 'This model'} is above your AI License level`,
      'data-scope': `${tool.name} is not cleared for this data`,
      'org-policy': 'Prompt blocked',
    }[reason]

    const body = {
      'tool-unapproved': `${esc(tool.name)} has not been reviewed, so your prompt was not sent and nothing was recorded from it. The tool keeps working normally — only company or customer data is held back.`,
      'tool-suspended': `${esc(policy.explain || '')} Nothing was sent. Please move this work to an approved tool.`,
      'model-unapproved': `${esc(tool.name)} is approved, but ${esc(modelName || 'the selected model')} has not been reviewed, so sensitive prompts are not sent to it.${models.length ? ` Switch to ${esc(models.join(' or '))} and send again.` : ''}`,
      'model-level': `${esc(modelName || 'The selected model')} is approved for the organisation but needs a higher AI License level than you hold, so sensitive prompts are not sent to it.${models.length ? ` ${esc(models.join(' or '))} ${models.length === 1 ? 'is' : 'are'} available to you now.` : ''} Finishing your assigned training is what raises your level.`,
      'data-scope': `${esc(tool.name)} is approved for ${esc(policy.dataScope || 'a narrower kind of data')}, and this prompt contains ${esc(detectedSummary(res.detections))}. That category is not sent here even masked.`,
      'org-policy': `Company policy blocks prompts containing personal data, so this prompt was not sent. Remove the ${items} above and try again.`,
    }[reason]

    const switchTo = reason === 'org-policy' ? '' : alternativesHtml(policy)

    // What the tool would have received if it were approved. Shown read-only and
    // with no way to send it: the employee can see exactly which values were
    // held back, which is the difference between "your prompt was refused" and
    // "your prompt was refused, and here is what was in it". There is
    // deliberately no "send this instead" button — masked company data still
    // reaches a vendor nobody has reviewed, which is the whole reason this
    // destination is refused.
    const safePreview = res.masked
      ? `<p class="aip-held-label">WHAT WAS HELD BACK</p>
         <div class="aip-held">${highlightTokens(esc(res.masked))}</div>`
      : ''

    showPanel(
      'blocked',
      `${header('block')}
       <p class="aip-lead">${esc(lead)}</p>
       <div class="aip-chips">${chipsHtml(res.detections)}</div>
       <p class="aip-body">${body}</p>
       ${safePreview}
       ${switchTo}
       <div class="aip-actions">
         ${reason === 'org-policy' ? '' : `<button class="aip-btn aip-ghost" data-request>${reason === 'model-level' ? 'Open my training' : 'Request access'}</button>`}
         <button class="aip-btn aip-gold" data-edit>Edit prompt</button>
       </div>`,
      {
        '[data-edit]': dismissToEdit,
        '[data-request]': () => {
          const to = reason === 'model-level' ? '/training' : '/tools'
          window.open(`${CFG.dashboardBase}${to}`, '_blank', 'noopener')
        },
      },
      switchTo || safePreview ? 'roomy' : ''
    )
  }

  // Warn only: the employee decides. Nothing is sent until they choose.
  function showWarnOnly(original, res, origin) {
    const total = countOf(res.detections)
    showPanel(
      'warnonly',
      `${header('warn')}
       <p class="aip-lead">Sensitive information detected</p>
       <div class="aip-chips">${chipsHtml(res.detections)}</div>
       <p class="aip-body">Your organisation's policy is <strong>Warn only</strong>, so nothing has been sent yet. Protecting replaces the ${total} item${total === 1 ? '' : 's'} with masked tokens.</p>
       <div class="aip-actions">
         <button class="aip-btn aip-gold" data-protect>Protect &amp; send</button>
         <button class="aip-btn aip-ghost" data-original>Send original</button>
       </div>`,
      {
        // Same checkpoint as Mask-and-continue — review, then release.
        '[data-protect]': () => showCheckpoint(original, res, origin),
        '[data-original]': async () => {
          // Same penalty path the web Gateway uses for an overridden checkpoint.
          hidePanel()
          const res2 = await ask({ type: 'AIP_OVERRIDE', prompt: original })
          if (res2.__error) CFG.logError('override', 'not recorded', res2.__error)
          approveAndSend(original, origin)
        },
      }
    )
  }

  // Protection is off because nobody is signed in. Informational and dismissible:
  // the extension is not intercepting anything in this state, so this must not
  // look like something the employee has to resolve before using their AI tool.
  // ---- the signed-out notice, shown once per signed-out episode -------------
  //
  // "Nobody is signed in" is worth saying once. It was being said on every AI
  // tab the employee opened, which is the shape of a nag rather than a notice:
  // the extension is not intercepting anything in this state, so the panel asks
  // for attention it does not need, on a page it does not own, every time.
  //
  // The marker lives in chrome.storage.local rather than in this script, because
  // "every tab" is precisely the problem — a per-tab flag would still fire once
  // per tab. It is cleared when protection turns active (applyState above), so
  // signing out again is a new episode and gets its own single notice.
  const SIGNED_OUT_NOTICE_KEY = 'aipSignedOutNotice'

  async function signedOutNoticeSeen() {
    try {
      const stored = await chrome.storage.local.get(SIGNED_OUT_NOTICE_KEY)
      return Boolean(stored[SIGNED_OUT_NOTICE_KEY])
    } catch {
      // Orphaned context or storage unavailable. Err towards silence: a missed
      // notice costs nothing here, a repeated one is the bug being fixed.
      return true
    }
  }

  function clearSignedOutNotice() {
    chrome.storage.local.remove(SIGNED_OUT_NOTICE_KEY).catch(() => {})
  }

  async function maybeShowSignedOut(state) {
    if (await signedOutNoticeSeen()) {
      CFG.log('state', 'signed out — notice already shown this session, staying quiet')
      return
    }
    try {
      await chrome.storage.local.set({ [SIGNED_OUT_NOTICE_KEY]: Date.now() })
    } catch {
      /* the notice is still worth showing even if it cannot be remembered */
    }
    // The state may have moved on while storage was being read.
    if (protection.active || panelKind === 'checkpoint') return
    showSignedOut(state)
  }

  // Its own panel kind rather than a generic 'notice': this is the one panel
  // that must vanish the moment the employee signs in, and the destination
  // banners (unapproved tool, banned model) must not vanish with it.
  function showSignedOut(state) {
    if (panelKind === 'checkpoint') return
    const admin = state.status === 'notEmployee'
    showPanel(
      'signedout',
      `${header('off')}
       <p class="aip-lead">Prompts are not being protected</p>
       <p class="aip-body">${admin
         ? 'You are signed in as an admin. Prompt protection follows an employee session.'
         : 'Nobody is signed in to AI Passport, so prompts on this page are not being checked.'
       } ${esc(tool.name)} works as normal — nothing here is blocked.</p>
       <div class="aip-actions">
         <button class="aip-btn aip-ghost" data-close>Dismiss</button>
         <a class="aip-btn aip-gold" href="${CFG.dashboardBase}/login" target="_blank" rel="noopener">Sign in</a>
       </div>`
    )
  }

  // A short, non-blocking status. Used only where something went wrong that the
  // employee should know about but must not be stopped by.
  function showNotice(title, body) {
    if (panelKind === 'checkpoint') return
    showPanel(
      'notice',
      `${header('warn')}
       <p class="aip-lead">${esc(title)}</p>
       <p class="aip-body">${esc(body)}</p>
       <div class="aip-actions"><button class="aip-btn aip-ghost" data-close>Dismiss</button></div>`
    )
  }

  function dismiss() {
    hidePanel()
  }

  function dismissToEdit() {
    hidePanel()
    findComposer()?.focus()
  }

  // ---- listeners ------------------------------------------------------------

  // Every listener runs inside this. An exception thrown while the extension is
  // holding a cancelled event is precisely how the page ends up unusable, so a
  // throw drops all locks and puts the send back in the employee's hands.
  function guard(name, fn) {
    return function guarded(e) {
      try {
        fn(e)
      } catch (err) {
        CFG.logError(name, err)
        endWork()
        sending = false
        pending = null
      }
    }
  }

  function onInput(e) {
    const el = asEditable(e.target)
    if (!el) return
    activeEl = el
    // The employee edited the prompt after we masked it — resume checking.
    if (readText(el) !== ourOwnText) ourOwnText = ''
    // Editing invalidates a checkpoint the employee was reviewing: the safe
    // version on screen no longer corresponds to what is in the composer.
    if (pending && !sending && readText(el) !== pending.text) {
      pending = null
      hidePanel()
    }
    scheduleCheck()
  }

  function onFocusIn(e) {
    const el = asEditable(e.target)
    if (el) activeEl = el
  }

  // Should this text be allowed straight through? Only if the checkpoint has
  // already approved this exact string, or we are mid-resubmission.
  function isApproved(text) {
    return passThrough || text === clearedText
  }

  // Is it our business to intercept this send at all? `unknown` counts: the state
  // has simply not arrived yet, and checkpoint() resolves it before deciding.
  // Anything else (signed out, torn down) means hands off the AI site entirely.
  function shouldIntercept() {
    return armed && alive && (protection.active || protection.status === 'unknown')
  }

  // A send arrived while an earlier one is still being decided. It has to be
  // cancelled — letting it through would send the unchecked original — but that
  // is only safe because beginWork() guarantees the earlier one ends.
  //
  // An open checkpoint is deliberately *not* handled here: checkpoint() already
  // knows how to re-show a review of the same prompt and how to start again on a
  // changed one, and routing it there is what stops an edited prompt from
  // becoming a keypress that does nothing at all.
  function holdRepeat(e) {
    e.preventDefault()
    e.stopImmediatePropagation()
  }

  // Enter (and Ctrl/Cmd+Enter) in the composer. Shift+Enter is a newline on all
  // supported tools, so it is left alone.
  function onKeyDown(e) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return
    if (!shouldIntercept()) return
    const el = asEditable(e.target)
    if (!el) return
    const text = readText(el)
    if (!text.trim()) return
    if (isApproved(text)) return
    activeEl = el
    if (checking || sending) return holdRepeat(e)
    e.preventDefault()
    e.stopImmediatePropagation()
    checkpoint(text, { kind: 'enter', el })
  }

  // Send button — including buttons rendered long after page load, because the
  // listener is delegated from window rather than bound to the button.
  function onClick(e) {
    if (passThrough || !shouldIntercept()) return
    const el = findComposer()
    const text = readText(el)
    if (!text.trim()) return
    if (isApproved(text)) return
    // A named send control always goes to the checkpoint. Anything else in the
    // composer does too, but only while this text is already known to be
    // unsendable — see asComposerControl for why that widening is bounded.
    const btn = asSendButton(e.target) || (refusalInForce(text) ? asComposerControl(e.target) : null)
    if (!btn) return
    if (checking || sending) return holdRepeat(e)
    e.preventDefault()
    e.stopImmediatePropagation()
    checkpoint(text, { kind: 'button', el, btn })
  }

  // Backstop: a form that submits without a click we recognised.
  function onSubmit(e) {
    if (passThrough || !shouldIntercept()) return
    const el = findComposer()
    const text = readText(el)
    if (!text.trim() || isApproved(text)) return
    if (checking || sending) return holdRepeat(e)
    e.preventDefault()
    e.stopImmediatePropagation()
    checkpoint(text, { kind: 'submit', el })
  }

  // Capture phase on window: these run before the AI site's own handlers, which
  // is what makes the checkpoint blocking rather than advisory.
  const onKeyDownGuarded = guard('keydown', onKeyDown)
  const onClickGuarded = guard('click', onClick)
  const onSubmitGuarded = guard('submit', onSubmit)
  const onInputGuarded = guard('input', onInput)
  const onFocusInGuarded = guard('focusin', onFocusIn)

  window.addEventListener('keydown', onKeyDownGuarded, true)
  window.addEventListener('click', onClickGuarded, true)
  window.addEventListener('submit', onSubmitGuarded, true)
  document.addEventListener('input', onInputGuarded, true)
  document.addEventListener('focusin', onFocusInGuarded, true)
  document.addEventListener('visibilitychange', onVisibility)
  try {
    chrome.storage.onChanged.addListener(onStorageChanged)
  } catch (err) {
    CFG.logError('init', 'could not subscribe to protection state', err)
  }
  armed = true

  // The popup asks whether interception is actually live on this tab, so it can
  // report real protection state instead of "the extension is installed". It
  // answers with `armed`, not with a constant: after a teardown this script is
  // still loaded but is no longer protecting anything, and saying otherwise is
  // how the popup came to disagree with the page.
  function onPing(msg, sender, sendResponse) {
    if (msg?.type !== 'AIP_PING') return false
    sendResponse({
      ready: armed,
      tool: tool.name,
      composer: Boolean(findComposer()),
      status: protection.status,
      active: protection.active,
    })
    return false
  }
  chrome.runtime.onMessage.addListener(onPing)

  function teardown(reason) {
    if (!armed) return
    armed = false
    alive = false
    CFG.log('teardown', reason)
    clearTimeout(debounceTimer)
    clearTimeout(watchdog)
    checking = false
    sending = false
    pending = null
    window.removeEventListener('keydown', onKeyDownGuarded, true)
    window.removeEventListener('click', onClickGuarded, true)
    window.removeEventListener('submit', onSubmitGuarded, true)
    document.removeEventListener('input', onInputGuarded, true)
    document.removeEventListener('focusin', onFocusInGuarded, true)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    try {
      chrome.storage.onChanged.removeListener(onStorageChanged)
      chrome.runtime.onMessage.removeListener(onPing)
    } catch {
      /* orphaned context — the listeners died with it */
    }
    panel?.host.remove()
    panel = null
    panelKind = null
    globalThis.__aipCheckpoint = null
  }

  globalThis.__aipCheckpoint = { version: 2, teardown }

  // pagehide fires for a real unload *and* for a bfcache suspend. Tearing down on
  // the second would leave a page that looks protected when the employee comes
  // back to it, so the checkpoint is only dismantled when the page is really
  // going away; a restored page just re-checks its state.
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)

  initState().catch(err => CFG.logError('init', err))

  // ---- arriving on a tool ----------------------------------------------------
  //
  // Reaching an unapproved tool is reported and answered here, and the answer is
  // deliberately not a wall.
  //
  // Blocking the site outright is the one option the proposal rules out: it
  // pushes the usage somewhere nothing can see it, which costs the audit log the
  // very events it exists to hold, and a browser extension cannot enforce it
  // anyway — a second profile defeats it in ten seconds. So the site opens, and
  // what changes is what it is allowed to *receive*: the gateway policy has
  // already tightened to Block for sensitive prompts, and this banner is the
  // advance warning of that, not a gate in front of it.
  //
  // A suspended tool is the one case that earns a firmer panel. An organisation
  // that has withdrawn a tool after a vendor incident is not asking anybody to
  // be careful; it is asking them to stop.
  const arrivalModel = noteModel(currentModel())
  ask({ type: 'AIP_TOOL_USE', tool: tool.name, model: arrivalModel }).catch(() => {})

  // The standing banner for a destination that will refuse. Called on arrival
  // and again whenever the employee changes model, because a picker they moved
  // is exactly when they need to know — before they have typed a prompt they
  // cannot send.
  function reviewDestination(model) {
    ask({ type: 'AIP_TOOL', tool: tool.name, model: model || '' }).then(res => {
      if (!res || res.__error) return
      // Never over an open checkpoint: that panel is holding a prompt. Never
      // over the signed-out notice either — with nobody signed in there is no
      // employee for a tool to be approved *for*, so telling them about this
      // page's standing would be answering a question that has no subject yet.
      // applyState calls back here the moment they sign in.
      if (panelKind === 'checkpoint' || panelKind === 'signedout') return

      // A ban is stated up front rather than saved for the send. Nothing will go
      // from here whatever they type, so letting them write a prompt first would
      // be a wasted minute and a worse surprise.
      if (res.banned) {
        // Recorded at the send attempt, not here: arriving is already reported
        // by AIP_TOOL_USE, and a banner is not an attempt to send anything.
        const modelName = res.model?.name || model
        const bannedTool = res.reason === 'tool-banned'
        const models = res.approvedModels || []
        return showPanel(
          'notice',
          `${header('block')}
           <p class="aip-lead">${bannedTool
            ? `${esc(tool.name)} is banned by your organisation`
            : `${esc(modelName || 'This model')} is banned by your organisation`}</p>
           <p class="aip-body">${bannedTool
            ? `Nothing is sent to ${esc(tool.name)} from AI Passport, whether or not a prompt contains company data. Please move this work to an approved tool.`
            : `${esc(tool.name)} itself is approved. ${esc(modelName || 'The selected model')} was withdrawn after a security concern, so nothing is sent to it at all.${models.length ? ` Switch to ${esc(models.join(' or '))} and carry on as normal.` : ''}`}</p>
           ${bannedTool ? alternativesHtml(res) : ''}
           <div class="aip-actions">
             <button class="aip-btn aip-ghost" data-close>Dismiss</button>
             <a class="aip-btn aip-gold" href="${CFG.dashboardBase}/tools" target="_blank" rel="noopener">View my AI tools</a>
           </div>`,
          {},
          bannedTool ? 'roomy' : ''
        )
      }

      if (res.approved !== false) {
        // The destination is fine now — clear a banner left by the previous one.
        if (panelKind === 'notice') hidePanel()
        return
      }

      const suspended = res.access === 'suspended'
      const switchTo = alternativesHtml(res)

      // The headline is the organisation's own sentence and the body is the
      // detail behind it — never both. `res.explain` opens with that same
      // sentence for an unreviewed tool, so quoting it whole under the headline
      // printed "…is not approved by your organisation" twice, three lines apart.
      showPanel(
        'notice',
        `${header(suspended ? 'block' : 'warn')}
         <p class="aip-lead">${suspended
          ? `${esc(tool.name)} has been suspended`
          : 'This AI tool is not approved by your organisation'}</p>
         <p class="aip-body">${suspended
          ? `${esc(tool.name)} was withdrawn organisation-wide after a security concern. Please move this work to an approved tool.`
          : `${esc(tool.name)} has not been through security and compliance review, so there are no agreed terms for what it does with company data. Ordinary questions are unaffected — only company and customer data is held back.`}</p>
         ${switchTo}
         <div class="aip-actions">
           <button class="aip-btn aip-ghost" data-close>Dismiss</button>
           <a class="aip-btn aip-gold" href="${CFG.dashboardBase}/tools" target="_blank" rel="noopener">Request access</a>
         </div>`,
        {},
        switchTo ? 'roomy' : ''
      )
    })
  }

  reviewDestination(arrivalModel)
})()
