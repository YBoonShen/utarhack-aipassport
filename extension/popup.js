// AI Passport popup — the Smart Gateway status panel.
//
// Answers four questions in one glance: am I signed in, am I protected, what
// happened recently, what can I do next.
//
// Every value comes from the existing backend through the service worker
// (/api/profile, /api/settings, /api/visas, /api/notifications). No profile,
// policy or detection logic is duplicated here — the popup only renders.
//
// "Am I protected?" in particular is *not* worked out here. It is read from the
// one record background.js publishes (state.js) and described by that module's
// summary(). The popup deciding for itself — from online + tool + a ping — is
// exactly how it came to promise protection the page could not deliver.

const CFG = globalThis.AIP_CONFIG
const STATE = globalThis.AIP_STATE
const $ = id => document.getElementById(id)

function set(id, value) {
  $(id).textContent = value
}

async function ask(message) {
  try {
    const res = await chrome.runtime.sendMessage(message)
    return res?.ok ? res.data : null
  } catch {
    return null
  }
}

// Is the checkpoint actually live on this tab? Installed is not the same as
// protecting: a tab opened before the extension loaded (or before it was
// reloaded after an update) has no checkpoint in it. The popup must never claim
// protection it cannot prove — so it asks, and only the content script answers.
async function pingTab(tabId) {
  if (!tabId) return null
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'AIP_PING' })
  } catch {
    return null // no receiver — the content script is not running here
  }
}

// No answer means the tab predates the current build, or its checkpoint was torn
// down. Rather than telling the employee to reload, inject a fresh checkpoint and
// ask again — content.js replaces any previous instance, so this repairs a tab
// left holding an orphaned copy instead of stacking a second one on top of it.
async function ensureCheckpoint(tabId) {
  const first = await pingTab(tabId)
  if (first?.ready) return first
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['config.js', 'rules.js', 'state.js', 'content.js'],
    })
  } catch {
    return null // page not injectable (or the host permission was declined)
  }
  return pingTab(tabId)
}

// ---- protection card -------------------------------------------------------

// tone: 'ok' (protected) | 'warn' (not protected right now) | 'err' (no status)
// A null `mode` hides the policy badge; `retry` shows the retry button.
function paintShield({ tone, icon, kicker, title, note, mode, retry }) {
  $('shield').className = `shield ${tone}`
  set('shieldIcon', icon)
  set('shieldKicker', kicker)
  set('shieldTitle', title)
  set('shieldNote', note)
  $('mode').hidden = !mode
  if (mode) set('modeText', mode)
  $('retry').hidden = !retry
}

function paintSite(tone, text) {
  $('site').className = `site ${tone}`
  set('siteText', text)
}

// ---- identity --------------------------------------------------------------

// The employee card has three shapes: signed out, signed in as someone who is
// not an employee (an admin), and a signed-in employee. Profile figures are only
// ever painted in the last case — no session, no personal data.
function paintIdentity(state) {
  const { user, profile, signedIn } = state
  const signin = $('signin')
  const pill = $('authPill')

  if (!signedIn) {
    const isAdmin = user?.role && user.role !== 'employee'
    $('initials').className = 'avatar out'
    set('initials', isAdmin ? (user.initials || 'AD') : '?')
    set('empName', isAdmin ? `Signed in as ${user.name || 'admin'}` : 'Not signed in')
    set('empLevel', isAdmin
      ? 'Sign in as an employee to see your AI License'
      : 'Sign in on the AI Passport dashboard')
    // The grey avatar and "Not signed in" already say it; the pill would only
    // crowd the row, so the sign-in action takes its place.
    pill.className = 'pill off'
    set('authText', isAdmin ? 'Not an employee' : 'Signed out')
    pill.hidden = true
    set('employeeId', '')
    signin.hidden = false
    return
  }

  pill.hidden = false
  $('initials').className = 'avatar'
  set('initials', profile?.initials || user.initials || '··')
  set('empName', profile?.name || user.name || '—')
  set('empLevel', profile?.levelName ? `Level ${profile.level} · ${profile.levelName}` : '—')
  pill.className = state.online ? 'pill' : 'pill off'
  set('authText', state.online ? 'Signed in' : 'Last synced')
  set('employeeId', profile?.id ? `Employee ${profile.id}` : '')
  signin.hidden = true
}

// ---- recent activity -------------------------------------------------------

function paintActivity(items, pending = 0) {
  const box = $('activity')
  box.replaceChildren()

  if (items === 'signedOut') {
    box.innerHTML = '<div class="empty">Sign in to see your protection activity.</div>'
    return
  }
  if (items === null) {
    // Offline. "Unavailable" alone reads as "nothing was protected"; if records
    // are being held it is the opposite, and the employee should be able to see
    // that their protection kept working while the Gateway did not.
    if (pending > 0) {
      const el = document.createElement('div')
      el.className = 'empty'
      el.textContent =
        `The Gateway is offline. ${pending} masked record${pending === 1 ? '' : 's'} held on this device — ` +
        'added to your audit log as soon as it is back.'
      box.appendChild(el)
      return
    }
    box.innerHTML = '<div class="empty">Recent activity is unavailable while the Gateway is offline.</div>'
    return
  }
  if (items.length === 0) {
    box.innerHTML = '<div class="empty">No recent protection activity</div>'
    return
  }

  for (const item of items) {
    const el = document.createElement('div')
    el.className = 'act'
    // Built from nodes, never innerHTML — the text is backend-supplied.
    el.appendChild(Object.assign(document.createElement('span'), { className: 'tick', textContent: '✓' }))
    const body = document.createElement('div')
    body.appendChild(Object.assign(document.createElement('p'), { textContent: item.title }))
    body.appendChild(Object.assign(document.createElement('span'), { textContent: item.body }))
    if (item.time) body.appendChild(Object.assign(document.createElement('time'), { textContent: item.time }))
    el.appendChild(body)
    box.appendChild(el)
  }
}

// ---- render ----------------------------------------------------------------

async function render() {
  paintShield(STATE.summary(null))

  // Which AI tool is the active tab on? Resolved from the same tool table the
  // content script uses, so the popup and the on-page panel always agree.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let host = ''
  try {
    host = new URL(tab?.url || '').hostname
  } catch {
    host = ''
  }
  const tool = CFG.matchTool(host)

  // The protection record — the same one the content script is reading. Forced,
  // so opening the popup right after signing in shows the new state rather than
  // a cached one. A null reply is the one failure the record cannot describe for
  // itself: the service worker could not be reached at all.
  const state = (await ask({ type: 'AIP_STATE', force: true }))
    || { ...STATE.UNKNOWN, status: 'offline' }
  // Proof, not assumption: the checkpoint answers only if it is really running
  // on this tab. This is the one thing the popup knows that the record does not.
  const live = tool ? await ensureCheckpoint(tab?.id) : null

  paintIdentity(state)

  // --- protection status. The words come from state.js, so the popup cannot
  // describe the employee's protection differently from the on-page panel. All
  // the popup adds is whether this particular tab is one the checkpoint runs in.
  if (state.active && !tool) {
    paintShield({
      tone: 'warn', icon: '◦', kicker: 'STANDING BY',
      title: 'Not needed on this page',
      note: 'AI Passport checks prompts on your organisation\'s approved AI tools. This tab is not one of them, so there is nothing to protect here.',
      mode: state.mode,
    })
  } else if (state.active && !live?.ready) {
    paintShield({
      tone: 'warn', icon: '!', kicker: 'PROTECTION NOT ACTIVE',
      title: `Reload ${tool.name} to activate`,
      note: 'Your protection is on, but this tab has no checkpoint running in it — AI Passport could not inject one. Reload the page and prompts will be checked again.',
      retry: true,
    })
  } else {
    paintShield({ ...STATE.summary(state, tool?.name), mode: state.active ? state.mode : null })
  }

  // --- statistics and activity are personal, so they follow the session
  const profile = state.profile
  if (!state.signedIn || !profile) {
    set('protected', '—')
    set('masked', '—')
    paintActivity(state.signedIn ? null : 'signedOut')
  } else {
    // Backend counters — blank rather than invented when absent.
    set('protected', profile.promptsProtected ?? '—')
    set('masked', profile.itemsMasked ?? '—')
    if (state.online) {
      paintActivity((await ask({ type: 'AIP_ACTIVITY' })) ?? null)
    } else {
      const held = await ask({ type: 'AIP_PENDING' })
      paintActivity(null, held?.pending ?? 0)
    }
  }

  // --- this tab
  if (!tool) {
    paintSite('idle', 'This tab is not an approved AI tool')
    return
  }
  const resolved = await ask({ type: 'AIP_TOOL', tool: tool.name })
  if (resolved?.approved === false) return paintSite('warn', `${tool.name} · no active visa`)
  if (!state.active) return paintSite('idle', `${tool.name} · prompts are not being checked`)
  if (!live?.ready) return paintSite('warn', `${tool.name} · checkpoint not running on this tab`)
  if (!state.online) return paintSite('warn', `${tool.name} · checking on this device only`)
  paintSite('ok', `${tool.name} · checkpoint running${live.composer ? '' : ' · waiting for the message box'}`)
}

// ---- wiring ----------------------------------------------------------------

// Existing employee routes — no new pages are introduced by the popup.
// /home is the employee dashboard landing (App.jsx HomeRedirect). Linking to a
// role-gated page instead would bounce an admin session to /admin, which is not
// what "Open employee dashboard" should ever do.
$('dashboard').href = `${CFG.dashboardBase}/home`
$('transparency').href = `${CFG.dashboardBase}/transparency`
$('signin').href = `${CFG.dashboardBase}/login`
set('version', `AI Passport Extension · v${chrome.runtime.getManifest().version}`)

$('close').addEventListener('click', () => window.close())
$('retry').addEventListener('click', render)

// The status cache lives in the service worker, so re-rendering on demand is
// enough to pick up a policy or profile change made elsewhere.
render()
