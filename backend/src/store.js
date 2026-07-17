// Shared in-memory data store — the single source of truth both the employee
// and admin UIs read/write through the REST API. Restarting the server resets
// to the seed state (handy for demos). Swap these functions for Firestore
// queries once the Firebase project is connected (see firebase.js).

function seed() {
  return {
    profile: {
      id: 'E-217',
      initials: 'JY',
      name: 'Tan Jia Yin',
      dept: 'Engineering',
      licenseNo: 'AIP-2026-004173',
      issued: '02 Jan 2026',
      level: 2,
      levelName: 'Navigator',
      points: 1240,
      target: 2000,
      streakDays: 21,
      promptsProtected: 47,
      itemsMasked: 12,
      trainingCompleted: false,
      stamps: [
        { title: 'AI BASICS', score: 'PASSED · 92%', date: '04 JAN 2026', shape: 'circle', color: '#078b6c' },
        { title: 'DATA PRIVACY', score: 'PASSED · 100%', date: '11 JAN 2026', shape: 'square', color: '#d92d20' },
        { title: 'SAFE PROMPTS', score: 'PASSED · 87%', date: '25 JAN 2026', shape: 'circle', color: '#365fd9' },
      ],
    },

    counters: { promptsToday: 312, maskedToday: 58, nextEventNo: 8218, nextRequestNo: 493 },

    auditEvents: [
      { id: 'EV-8217', time: '14:02', user: 'E-217', dept: 'Eng', tool: 'ChatGPT', action: 'MASKED', control: 'NIST PR.DS', record: 'Fix bug for client [MASKED-NAME] in module…' },
      { id: 'EV-8216', time: '13:58', user: 'F-102', dept: 'Fin', tool: 'Gemini', action: 'ALERT', control: 'PDPA P7', record: 'Summarise payment for [MASKED-ID] invoice…' },
      { id: 'EV-8215', time: '13:51', user: 'S-044', dept: 'Sales', tool: 'SummarizerX', action: 'REDIRECTED', control: 'AIGE 4.2', record: 'Switched to approved tool · ChatGPT' },
      { id: 'EV-8214', time: '13:47', user: 'E-198', dept: 'Eng', tool: 'ChatGPT', action: 'CLEAN', control: 'NIST GV.4', record: 'Explain the difference between SQL joins…' },
      { id: 'EV-8213', time: '13:40', user: 'H-011', dept: 'HR', tool: 'Gemini', action: 'MASKED', control: 'EU AI Act 4', record: 'Draft letter to [MASKED-NAME], [MASKED-PHONE]…' },
    ],

    visaRequests: [
      {
        id: 'A-0492', tool: 'SummarizerX', status: 'SECURITY REVIEW', dept: 'Sales',
        requester: 'S-044', owner: 'M. Wong', submitted: '14 Jul 2026',
        purpose: 'Summarise customer meeting notes and produce follow-up actions.',
        scopes: ['Internal', 'No personal data', 'Text only'],
      },
      {
        id: 'A-0491', tool: 'MeetingMind', status: 'COMPLIANCE', dept: 'Operations',
        requester: 'O-031', owner: 'R. Tan', submitted: '15 Jul 2026',
        purpose: 'Transcribe internal meetings and generate action items for the team.',
        scopes: ['Internal', 'Voice + text', 'No customer data'],
      },
      {
        id: 'A-0488', tool: 'CodePilot Pro', status: 'APPROVED', dept: 'Engineering',
        requester: 'E-217', owner: 'A. Rahman', submitted: '10 Jul 2026', decided: '12 Jul 2026',
        purpose: 'Assist with code review and refactoring on internal repositories.',
        scopes: ['Source code', 'Internal repos', 'Level 3 only'],
      },
      {
        id: 'A-0486', tool: 'TranslateAI', status: 'REDIRECTED', dept: 'Marketing',
        requester: 'M-083', owner: 'N. Lee', submitted: '08 Jul 2026', decided: '09 Jul 2026',
        purpose: 'Translate campaign copy for regional markets.',
        scopes: ['Marketing copy', 'No personal data', 'Text only'],
      },
    ],

    notifications: [
      {
        id: 'n-training', category: 'TRAINING', time: 'Today · 09:30', received: 'Received 17 Jul 2026 · 09:30',
        title: 'New training is ready',
        body: 'Safe AI Tool Selection is available from 18 Jul. Earn 120 safety miles.',
        what: 'Safe AI Tool Selection has been assigned to your Level 2 learning path. It focuses on choosing approved tools and matching each task to an appropriate data scope.',
        facts: [['Module', 'Safe AI Tool Selection'], ['Available', '18 Jul 2026'], ['Learning time', '8 minutes'], ['Assessment', '4 questions'], ['Reward', '+120 safety miles']],
        read: false, deleted: false,
      },
      {
        id: 'n-visa', category: 'VISA UPDATE', time: 'Today · 08:15', received: 'Received 17 Jul 2026 · 08:15',
        title: 'SummarizerX moved to compliance review',
        body: 'Request A-0492 passed security review. Compliance checks are now in progress.',
        what: 'Your visa application for SummarizerX cleared the security review stage. The compliance team is now checking vendor terms and data handling before a final decision.',
        facts: [['Request', 'A-0492'], ['Tool', 'SummarizerX'], ['Stage', 'Compliance review'], ['Submitted', '15 Jul 2026'], ['Expected decision', 'Within 2 working days']],
        read: false, deleted: false,
      },
      {
        id: 'n-milestone', category: 'MILESTONE', time: 'Yesterday · 17:45', received: 'Received 16 Jul 2026 · 17:45',
        title: '21-day safe prompt streak',
        body: 'No unsafe prompts were sent for 21 consecutive days. Your license remains in good standing.',
        what: 'Every prompt you sent in the last 21 days passed the Smart Gateway with no unsafe content. Streaks like this keep your AI License in good standing.',
        facts: [['Streak', '21 days'], ['Unsafe prompts', '0'], ['License standing', 'Good'], ['Started', '26 Jun 2026'], ['Reward', '+50 safety miles']],
        read: false, deleted: false,
      },
      {
        id: 'n-gateway', category: 'SMART GATEWAY', time: '16 Jul 2026 · 15:42', received: 'Received 16 Jul 2026 · 15:42',
        title: '2 sensitive items were masked',
        body: 'A name and IC number were removed before your prompt was sent to Gemini.',
        what: 'The Smart Gateway detected a personal name and an IC number in your prompt. Both were replaced with masked tokens before the prompt left your browser.',
        facts: [['Items masked', 'Name, IC number'], ['AI tool', 'Gemini'], ['Stored version', 'Masked only'], ['Action needed', 'None'], ['Reward', '+10 safety miles']],
        read: false, deleted: false,
      },
    ],

    settings: {
      mode: 'Mask and continue', // 'Mask and continue' | 'Warn only' | 'Block'
      controls: {
        personalIdentifiers: true, // IC, passport, phone, email
        customerRecords: true,     // card numbers
        financialFigures: true,    // RM/USD amounts
        sourceCode: false,         // credentials/secrets
      },
      experience: { explainMask: true, showSafeVersion: true, awardPoints: true },
      escalate: true,
      policyVersion: 11,
    },
  }
}

export let db = seed()

export function resetStore() {
  db = seed()
}

// ---- helpers used by the API routes ----

const CONTROL_TAGS = {
  IC: 'PDPA P7', PASSPORT: 'PDPA P7', PHONE: 'PDPA P7', EMAIL: 'PDPA P7',
  CARD: 'PDPA P7', FINANCIAL: 'NIST PR.DS', CREDENTIAL: 'NIST PR.DS',
}

function nowTime() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export function recordPromptEvent({ detections, masked, tool = 'AI Assistant' }) {
  const total = detections.reduce((n, d) => n + d.count, 0)
  const event = {
    id: `EV-${db.counters.nextEventNo++}`,
    time: nowTime(),
    user: db.profile.id,
    dept: 'Eng',
    tool,
    action: total > 0 ? 'MASKED' : 'CLEAN',
    control: total > 0 ? CONTROL_TAGS[detections[0].type] || 'NIST PR.DS' : 'NIST GV.4',
    record: masked.length > 60 ? masked.slice(0, 57) + '…' : masked,
  }
  db.auditEvents.unshift(event)
  db.counters.promptsToday += 1
  if (total > 0) {
    db.counters.maskedToday += total
    db.profile.promptsProtected += 1
    db.profile.itemsMasked += total
    if (db.settings.experience.awardPoints) db.profile.points = Math.min(db.profile.points + 10, db.profile.target)
    const types = detections.map(d => `${d.type.toLowerCase()} ×${d.count}`).join(', ')
    addNotification({
      category: 'SMART GATEWAY',
      title: `${total} sensitive item${total === 1 ? '' : 's'} ${total === 1 ? 'was' : 'were'} masked`,
      body: `Detected: ${types}. Only the masked version was stored in the audit log.`,
      what: 'The Smart Gateway detected sensitive content in your prompt and replaced it with masked tokens before it left your browser. The audit log stores only the masked version.',
      facts: [
        ['Items masked', detections.map(d => d.type).join(', ')],
        ['AI tool', tool],
        ['Stored version', 'Masked only'],
        ['Action needed', 'None'],
        ['Reward', db.settings.experience.awardPoints ? '+10 safety miles' : '—'],
      ],
    })
  }
  return event
}

export function addNotification({ category, title, body, what, facts }) {
  const stamp = new Date()
  const n = {
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category,
    time: `Today · ${stamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    received: `Received ${stamp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · ${stamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    title, body, what, facts,
    read: false, deleted: false,
  }
  db.notifications.unshift(n)
  return n
}

export function completeTraining() {
  if (!db.profile.trainingCompleted) {
    db.profile.trainingCompleted = true
    db.profile.points = Math.min(db.profile.points + 150, db.profile.target)
    db.profile.stamps.push({
      title: 'PERSONAL DATA',
      score: 'PASSED · 100%',
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(),
      shape: 'circle',
      color: '#078b6c',
    })
    addNotification({
      category: 'TRAINING',
      title: 'Training stamp earned',
      body: 'Spotting Personal Data in Prompts completed with a perfect score. +150 safety miles.',
      what: 'You passed all three questions in Spotting Personal Data in Prompts. The Personal Data stamp was added to your AI Passport and 150 safety miles were credited.',
      facts: [
        ['Module', 'Spotting Personal Data in Prompts'],
        ['Score', '3/3 · 100%'],
        ['Stamp', 'Personal Data'],
        ['Reward', '+150 safety miles'],
        ['Next module', 'Safe AI Tool Selection · 18 Jul'],
      ],
    })
  }
  return db.profile
}

export function applyForVisa({ tool, purpose, scopes }) {
  const request = {
    id: `A-0${db.counters.nextRequestNo++}`,
    tool: tool || 'SummarizerX',
    status: 'SECURITY REVIEW',
    dept: db.profile.dept,
    requester: db.profile.id,
    owner: 'A. Rahman',
    submitted: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    purpose: purpose || '',
    scopes: scopes && scopes.length ? scopes : ['Internal', 'Text only'],
  }
  db.visaRequests.unshift(request)
  return request
}

export function decideVisa(id, decision, note) {
  const request = db.visaRequests.find(r => r.id === id)
  if (!request) return null
  const statusMap = { approve: 'APPROVED', decline: 'DECLINED', redirect: 'REDIRECTED' }
  request.status = statusMap[decision] || request.status
  request.decided = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  if (note) request.decisionNote = note

  const titles = {
    approve: `${request.tool} visa approved`,
    decline: `${request.tool} visa declined`,
    redirect: `${request.tool} request redirected`,
  }
  const bodies = {
    approve: `Request ${request.id} was approved. The tool has been added to your approved visas.`,
    decline: `Request ${request.id} was declined. An approved alternative remains available.`,
    redirect: `Request ${request.id} was closed with a one-click switch to an approved alternative.`,
  }
  addNotification({
    category: 'VISA UPDATE',
    title: titles[decision] || `${request.tool} request updated`,
    body: bodies[decision] || `Request ${request.id} status: ${request.status}.`,
    what: `IT and Compliance completed the review of your ${request.tool} request. ${bodies[decision] || ''}`,
    facts: [
      ['Request', request.id],
      ['Tool', request.tool],
      ['Decision', request.status],
      ['Decided', request.decided],
      ['Reviewer', 'Admin · Compliance role'],
    ],
  })
  return request
}
