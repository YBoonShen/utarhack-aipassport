// Shared notification state — backed by the REST API so gateway events,
// training completions and admin decisions show up as real notifications.
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, currentUser } from '../lib/api.js'

const NotificationsContext = createContext(null)

export function NotificationsProvider({ children }) {
  const [items, setItems] = useState([])

  const refresh = useCallback(async () => {
    if (currentUser()?.role !== 'employee') return
    try {
      setItems(await api.get('/notifications'))
    } catch {
      // backend offline — keep whatever we have
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 4000)
    return () => clearInterval(t)
  }, [refresh])

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
