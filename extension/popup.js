// AI Passport popup — a compact read-only status view.
//
// All values come from the existing backend through the service worker
// (/api/profile, /api/settings, /api/visas). No profile or policy logic is
// duplicated here.

const CFG = globalThis.AIP_CONFIG
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

async function render() {
  $('dashboard').href = `${CFG.dashboardBase}/license`

  // Which AI tool is the active tab on, and is it approved?
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let host = ''
  try {
    host = new URL(tab?.url || '').hostname
  } catch {
    host = ''
  }
  const tool = CFG.matchTool(host)

  const status = await ask({ type: 'AIP_STATUS', force: true })

  if (!status || !status.profile) {
    $('dot').classList.add('off')
    set('state', 'Gateway unreachable')
    set('stateNote', 'Start the AI Passport backend to resume protection')
    set('site', tool ? tool.name : 'Not an AI tool')
    return
  }

  const { profile, settings, online } = status

  $('dot').classList.toggle('off', !online)
  set('state', online ? 'Protected' : 'Last known status')
  set('stateNote', online
    ? 'Prompts are checked before they leave your browser'
    : 'Gateway offline — showing the last synced values')

  set('protected', profile.promptsProtected ?? '—')
  set('masked', profile.itemsMasked ?? '—')
  set('literacy', profile.levelName ? `Level ${profile.level} · ${profile.levelName}` : '—')
  set('mode', settings?.mode || '—')

  if (!tool) {
    set('site', 'Not an approved AI tool')
    return
  }
  const resolved = await ask({ type: 'AIP_TOOL', tool: tool.name })
  set('site', resolved?.approved === false ? `${tool.name} · no active visa` : `${tool.name} · protected`)
}

render()
