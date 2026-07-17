// Shared notification state — powers the header badge and the notification panel (Figma 05 series)
import { createContext, useContext, useState } from 'react'

const initialNotifications = [
  {
    id: 'training',
    category: 'TRAINING',
    time: 'Today · 09:30',
    received: 'Received 17 Jul 2026 · 09:30',
    title: 'New training is ready',
    body: 'Safe AI Tool Selection is available from 18 Jul. Earn 120 safety miles.',
    what: 'Safe AI Tool Selection has been assigned to your Level 2 learning path. It focuses on choosing approved tools and matching each task to an appropriate data scope.',
    facts: [
      ['Module', 'Safe AI Tool Selection'],
      ['Available', '18 Jul 2026'],
      ['Learning time', '8 minutes'],
      ['Assessment', '4 questions'],
      ['Reward', '+120 safety miles'],
    ],
  },
  {
    id: 'visa',
    category: 'VISA UPDATE',
    time: 'Today · 08:15',
    received: 'Received 17 Jul 2026 · 08:15',
    title: 'SummarizerX moved to compliance review',
    body: 'Request A-0492 passed security review. Compliance checks are now in progress.',
    what: 'Your visa application for SummarizerX cleared the security review stage. The compliance team is now checking vendor terms and data handling before a final decision.',
    facts: [
      ['Request', 'A-0492'],
      ['Tool', 'SummarizerX'],
      ['Stage', 'Compliance review'],
      ['Submitted', '15 Jul 2026'],
      ['Expected decision', 'Within 2 working days'],
    ],
  },
  {
    id: 'milestone',
    category: 'MILESTONE',
    time: 'Yesterday · 17:45',
    received: 'Received 16 Jul 2026 · 17:45',
    title: '21-day safe prompt streak',
    body: 'No unsafe prompts were sent for 21 consecutive days. Your license remains in good standing.',
    what: 'Every prompt you sent in the last 21 days passed the Smart Gateway with no unsafe content. Streaks like this keep your AI License in good standing.',
    facts: [
      ['Streak', '21 days'],
      ['Unsafe prompts', '0'],
      ['License standing', 'Good'],
      ['Started', '26 Jun 2026'],
      ['Reward', '+50 safety miles'],
    ],
  },
  {
    id: 'gateway',
    category: 'SMART GATEWAY',
    time: '16 Jul 2026 · 15:42',
    received: 'Received 16 Jul 2026 · 15:42',
    title: '2 sensitive items were masked',
    body: 'A name and IC number were removed before your prompt was sent to Gemini.',
    what: 'The Smart Gateway detected a personal name and an IC number in your prompt. Both were replaced with masked tokens before the prompt left your browser.',
    facts: [
      ['Items masked', 'Name, IC number'],
      ['AI tool', 'Gemini'],
      ['Stored version', 'Masked only'],
      ['Action needed', 'None'],
      ['Reward', '+10 safety miles'],
    ],
  },
]

const NotificationsContext = createContext(null)

export function NotificationsProvider({ children }) {
  const [items, setItems] = useState(initialNotifications.map(n => ({ ...n, read: false, deleted: false })))

  const markRead = id => setItems(list => list.map(n => (n.id === id ? { ...n, read: true } : n)))
  const remove = id => setItems(list => list.map(n => (n.id === id ? { ...n, deleted: true } : n)))
  const restore = id => setItems(list => list.map(n => (n.id === id ? { ...n, deleted: false } : n)))
  const unreadCount = items.filter(n => !n.read && !n.deleted).length

  return (
    <NotificationsContext.Provider value={{ items, markRead, remove, restore, unreadCount }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationsContext)
}
