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
      if (next.status === 'signedOut' || next.status === 'notEmployee') showSignedOut(next)
    } else if (panelKind === 'notice') {
      hidePanel() // protection came back; the "not protected" notice is obsolete
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
    if (!armed || Date.now() - lastNudge < CFG.stateTtlMs) return
    lastNudge = Date.now()
    ask({ type: 'AIP_STATE' }).then(res => {
      if (!res.__error) applyState(res, 'nudge')
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

  // The clicked node, resolved to the site's send button (or null when the
  // click was something else entirely).
  function asSendButton(node) {
    if (!node || node.nodeType !== 1) return null
    // An explicitly configured send control counts whatever element it is built
    // from: DeepSeek and Kimi compose theirs out of plain divs, so requiring a
    // <button> or role="button" would let those clicks past the checkpoint.
    const btn = node.closest?.(sendSelector()) || node.closest?.('button, [role="button"]')
    if (!btn) return null
    // ChatGPT reuses the composer's submit button as "stop generating" while a
    // response streams. Cancelling that click would leave the employee unable to
    // stop the model — an interception with nothing to check.
    if (btn.matches('[data-testid="stop-button"], [aria-label*="stop" i]')) return null
    return btn.matches(sendSelector()) ? btn : null
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

  function showPanel(kind, html, actions, wide) {
    const p = ensurePanel()
    panelKind = kind
    p.host.style.display = 'block'
    p.card.className = wide ? 'aip-card aip-wide' : 'aip-card'
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

  function header(state) {
    return `
      <div class="aip-head">
        <span class="aip-ring">A</span>
        <div class="aip-title">
          <p class="aip-name">AI Passport</p>
          <p class="aip-kicker aip-${state}">SMART GATEWAY</p>
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

    const res = await ask({ type: 'AIP_DETECT', prompt: text, tool: tool.name })
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
    const note = res.offline
      ? `The Smart Gateway is unreachable, so this was checked on your device with Layer 1 rules. You will still be shown a safe version before anything is sent.`
      : res.mode === 'Block'
        ? `Company policy blocks prompts containing personal data. Remove the ${total} item${plural} above before sending.`
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

      CFG.log('checkpoint', 'intercepted', { chars: text.length, via: origin.kind, state: protection.status })

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
        res = await ask({ type: 'AIP_DETECT', prompt: text, tool: tool.name })
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

      if (!res.detections || res.detections.length === 0) {
        hidePanel()
        // Clean prompt: record the event (this is the audit entry for a sent
        // prompt) and send the original untouched. Fire-and-forget so the
        // employee is never made to wait on logging.
        commit(text)
        await approveAndSend(text, origin)
        return
      }

      if (res.mode === 'Block') return showBlocked(res)
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
    ask({ type: 'AIP_COMMIT', prompt: text, tool: tool.name }).then(res => {
      if (res.__error) CFG.logError('commit', 'audit event not recorded', res.__error)
    })
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
      true
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

  // Block mode: the prompt is held in the composer and never sent.
  function showBlocked(res) {
    const total = countOf(res.detections)
    showPanel(
      'blocked',
      `${header('block')}
       <p class="aip-lead">Prompt blocked</p>
       <div class="aip-chips">${chipsHtml(res.detections)}</div>
       <p class="aip-body">Company policy blocks prompts containing personal data, so this prompt was not sent. Remove the ${total} item${total === 1 ? '' : 's'} above and try again.</p>
       <div class="aip-actions"><button class="aip-btn aip-ghost" data-edit>Edit prompt</button></div>`,
      { '[data-edit]': dismissToEdit }
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
  function showSignedOut(state) {
    if (panelKind === 'checkpoint') return
    const admin = state.status === 'notEmployee'
    showPanel(
      'notice',
      `${header('off')}
       <p class="aip-lead">Prompts are not being protected</p>
       <p class="aip-body">${admin
         ? 'You are signed in as an admin. Prompt protection follows an employee session.'
         : 'Nobody is signed in to AI Passport, so prompts on this page are not being checked.'
       } ${esc(tool.name)} works as normal — nothing here is blocked.</p>
       <div class="aip-actions">
         <a class="aip-btn aip-gold" href="${CFG.dashboardBase}/login" target="_blank" rel="noopener">Sign in</a>
         <button class="aip-btn aip-ghost" data-close>Dismiss</button>
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
    const btn = asSendButton(e.target)
    if (!btn) return
    const el = findComposer()
    const text = readText(el)
    if (!text.trim()) return
    if (isApproved(text)) return
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

  // Resolve approval once. An unapproved tool gets a standing warning instead of
  // silent protection, matching the visa model in the dashboard.
  ask({ type: 'AIP_TOOL', tool: tool.name }).then(res => {
    if (res && res.approved === false && !res.__error) {
      showPanel(
        'notice',
        `${header('warn')}
         <p class="aip-lead">${esc(tool.name)} is not approved</p>
         <p class="aip-body">Your AI Passport visa for this tool is not active. Avoid entering company or customer data here, and request a visa from My Visas.</p>
         <div class="aip-actions"><button class="aip-btn aip-ghost" data-close>Dismiss</button></div>`
      )
    }
  })
})()
