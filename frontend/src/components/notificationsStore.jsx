// Shared notification state — backed by the REST API so gateway events,
// training completions and admin decisions show up as real notifications.
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api.js'
import { useAuth, AUTH } from '../lib/auth.jsx'

const NotificationsContext = createContext(null)

export function NotificationsProvider({ children }) {
  const [items, setItems] = useState([])
  // The inbox follows the verified session rather than the cached one: a poll
  // running every four seconds on a session that has ended is both a wasted
  // request and the sort of thing that keeps a signed-out screen looking alive.
  const { status, user } = useAuth()
  const isEmployee = status === AUTH.AUTHENTICATED && user?.role === 'employee'

  const refresh = useCallback(async () => {
    if (!isEmployee) return
    try {
      setItems(await api.get('/notifications'))
    } catch {
      // backend offline, or the session just ended — keep whatever we have.
      // A 401 is handled centrally (lib/api.js) and signs the app out.
    }
  }, [isEmployee])

  useEffect(() => {
    // Somebody else's inbox must not survive a sign-out or a change of user.
    if (!isEmployee) {
      setItems([])
      return
    }
    refresh()
    const t = setInterval(refresh, 4000)
    return () => clearInterval(t)
  }, [refresh, isEmployee, user?.id])

  const markRead = async id => {
    setItems(list => list.map(n => (n.id === id ? { ...n, read: true } : n)))
    try { await api.post(`/notifications/${id}/read`) } catch { /* offline */ }
  }
  const remove = async id => {
    setItems(list => list.map(n => (n.id === id ? { ...n, deleted: true } : n)))
    try { await api.post(`/notifications/${id}/delete`) } catch { /* offline */ }
  }
  const restore = async id => {
    setItems(list => list.map(n => (n.id === id ? { ...n, deleted: false } : n)))
    try { await api.post(`/notifications/${id}/restore`) } catch { /* offline */ }
  }

  const unreadCount = items.filter(n => !n.read && !n.deleted).length

  return (
    <NotificationsContext.Provider value={{ items, markRead, remove, restore, unreadCount, refresh }}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationsContext)
}
