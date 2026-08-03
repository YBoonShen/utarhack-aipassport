// AI Passport — content script for approved AI tools.
//
// Watches the composer, asks the backend (via the service worker) whether the
// prompt carries personal data, and offers protection before the prompt is sent.
//
// Deliberately cheap: one capturing "input" listener on the document instead of
// MutationObservers or polling. That survives the AI site's SPA navigation, and
// it means the extension does nothing at all until the employee actually types.

(function () {
  const CFG = globalThis.AIP_CONFIG
  const tool = CFG.matchTool(location.hostname)
  if (!tool) return // not an AI tool this extension knows about

  const EDITABLE_TAGS = new Set(['TEXTAREA', 'INPUT'])

  let activeEl = null
  let debounceTimer = null
  let lastChecked = '' // last text sent to the backend — never re-sent unchanged
  let ourOwnText = '' // text this extension wrote; must not re-trigger detection
  let panel = null
  let toolState = null // { approved, reason } resolved once per page

  // ---- talking to the service worker ---------------------------------------

  async function ask(message) {
    try {
      const res = await chrome.runtime.sendMessage(message)
      return res?.ok ? res.data : { __error: res?.error || 'No response' }
    } catch (err) {
      // Extension reloaded/disabled mid-session, or the worker is gone.
      return { __error: String(err.message || err) }
    }
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

    // contenteditable (ChatGPT's ProseMirror composer): replacing the selection
    // through execCommand produces real beforeinput/input events, which the
    // editor processes as a normal edit.
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

  // ---- protection panel (shadow DOM so page CSS can't reach it) ------------

  function ensurePanel() {
    if (panel) return panel

    const host = document.createElement('div')
    host.id = 'ai-passport-host'
    // Only the host is styled inline; everything inside lives in the shadow root.
    host.style.cssText = 'position:fixed;z-index:2147483647;right:20px;bottom:20px;'
    const shadow = host.attachShadow({ mode: 'open' })

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = chrome.runtime.getURL('styles.css')
    shadow.appendChild(link)

    const card = document.createElement('div')
    card.className = 'aip-card'
    shadow.appendChild(card)

    document.documentElement.appendChild(host)
    panel = { host, shadow, card }
    return panel
  }

  function hidePanel() {
    if (panel) panel.host.style.display = 'none'
  }

  function showPanel(html, actions) {
    const p = ensurePanel()
    p.host.style.display = 'block'
    p.card.innerHTML = html
    for (const [selector, handler] of Object.entries(actions || {})) {
      p.card.querySelector(selector)?.addEventListener('click', handler)
    }
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

  // ---- the detection flow ---------------------------------------------------

  function scheduleCheck() {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(runCheck, CFG.debounceMs)
  }

  async function runCheck() {
    const el = findComposer()
    if (!el) return hidePanel()
    activeEl = el

    const text = readText(el)
    // Safe prompt, our own masked text, or nothing worth checking: stay invisible.
    if (!text || text.trim().length < CFG.minPromptLength) return hidePanel()
    if (text === ourOwnText) return hidePanel()
    if (text === lastChecked) return // unchanged since the last call — no request

    lastChecked = text

    const res = await ask({ type: 'AIP_DETECT', prompt: text, tool: tool.name })
    if (res.__error) return showUnavailable(res.__error)
    // The employee kept typing while we waited — that keystroke already queued
    // another check, so this stale result is dropped.
    if (readText(findComposer()) !== text) return
    if (!res.detections || res.detections.length === 0) return hidePanel()

    render(text, res)
  }

  function render(original, res) {
    const total = res.detections.reduce((n, d) => n + d.count, 0)
    const plural = total === 1 ? '' : 's'

    if (res.mode === 'Block') {
      // Company policy blocks the prompt outright — mirrors /gateway's Block mode.
      showPanel(
        `${header('block')}
         <p class="aip-lead">Sensitive information detected</p>
         <div class="aip-chips">${chipsHtml(res.detections)}</div>
         <p class="aip-body">Company policy blocks prompts containing personal data. Edit the prompt and remove the ${total} item${plural} above before sending.</p>
         <div class="aip-actions"><button class="aip-btn aip-ghost" data-edit>Edit prompt</button></div>`,
        { '[data-edit]': dismissToEdit, '[data-close]': dismiss }
      )
      return
    }

    if (res.mode === 'Warn only') {
      // Warn only never rewrites the prompt for the employee — they stay in control.
      showPanel(
        `${header('warn')}
         <p class="aip-lead">Sensitive information detected</p>
         <div class="aip-chips">${chipsHtml(res.detections)}</div>
         <p class="aip-body">Your organisation's policy is <strong>Warn only</strong>, so nothing has been changed. You can protect the prompt or send it as it is.</p>
         <div class="aip-actions">
           <button class="aip-btn aip-gold" data-protect>Protect prompt</button>
           <button class="aip-btn aip-ghost" data-keep>Keep original</button>
         </div>`,
        { '[data-protect]': () => protect(original), '[data-keep]': dismiss, '[data-close]': dismiss }
      )
      return
    }

    // Mask and continue
    showPanel(
      `${header('ok')}
       <p class="aip-lead">Sensitive information detected</p>
       <div class="aip-chips">${chipsHtml(res.detections)}</div>
       <p class="aip-body">Your prompt will be protected before being sent. ${total} item${plural} will be replaced with a masked token.</p>
       <div class="aip-actions">
         <button class="aip-btn aip-gold" data-protect>Protect &amp; continue</button>
         <button class="aip-btn aip-ghost" data-edit>Edit prompt</button>
       </div>`,
      { '[data-protect]': () => protect(original), '[data-edit]': dismissToEdit, '[data-close]': dismiss }
    )
  }

  async function protect(original) {
    const el = findComposer()
    if (!el) return dismiss()

    showPanel(`${header('ok')}<p class="aip-lead">Protecting…</p><p class="aip-body">Masking personal data before it leaves this browser.</p>`, {})

    // The committed call is what the audit log records — one event per prompt
    // actually sent, exactly like the web Gateway.
    const res = await ask({ type: 'AIP_COMMIT', prompt: original, tool: tool.name })
    if (res.__error) return showUnavailable(res.__error)

    ourOwnText = res.masked
    lastChecked = res.masked
    writeText(el, res.masked)

    const total = (res.detections || []).reduce((n, d) => n + d.count, 0)
    showPanel(
      `${header('ok')}
       <p class="aip-lead">Prompt protected</p>
       <p class="aip-body">${total} sensitive item${total === 1 ? '' : 's'} masked. The protected prompt is in the message box — press send when you're ready.</p>
       <div class="aip-actions"><button class="aip-btn aip-ghost" data-close>Close</button></div>`,
      { '[data-close]': dismiss }
    )
    setTimeout(() => { if (panel?.card.querySelector('[data-close]')) hidePanel() }, 4000)
  }

  // Backend unreachable: say so and get out of the way. Never block the AI site.
  function showUnavailable(message) {
    showPanel(
      `${header('off')}
       <p class="aip-lead">Protection unavailable</p>
       <p class="aip-body">AI Passport could not reach the Smart Gateway, so this prompt was not checked. Your prompt has not been changed.</p>
       <p class="aip-note">${esc(message)}</p>
       <div class="aip-actions"><button class="aip-btn aip-ghost" data-close>Dismiss</button></div>`,
      { '[data-close]': dismiss }
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

  function onInput(e) {
    const el = asEditable(e.target)
    if (!el) return
    activeEl = el
    // The employee edited the prompt after we masked it — resume checking.
    if (readText(el) !== ourOwnText) ourOwnText = ''
    scheduleCheck()
  }

  function onFocusIn(e) {
    const el = asEditable(e.target)
    if (el) activeEl = el
  }

  document.addEventListener('input', onInput, true)
  document.addEventListener('focusin', onFocusIn, true)

  function teardown() {
    clearTimeout(debounceTimer)
    document.removeEventListener('input', onInput, true)
    document.removeEventListener('focusin', onFocusIn, true)
    panel?.host.remove()
    panel = null
  }
  window.addEventListener('pagehide', teardown, { once: true })

  // Resolve approval once. An unapproved tool gets a standing warning instead of
  // silent protection, matching the visa model in the dashboard.
  ask({ type: 'AIP_TOOL', tool: tool.name }).then(res => {
    toolState = res
    if (res && res.approved === false && !res.__error) {
      showPanel(
        `${header('warn')}
         <p class="aip-lead">${esc(tool.name)} is not approved</p>
         <p class="aip-body">Your AI Passport visa for this tool is not active. Avoid entering company or customer data here, and request a visa from My Visas.</p>
         <div class="aip-actions"><button class="aip-btn aip-ghost" data-close>Dismiss</button></div>`,
        { '[data-close]': dismiss }
      )
    }
  })
})()
