// Global toast — used for feedback and for decorative buttons that are out of
// scope for the prototype (so nothing on screen is dead when a judge clicks it).
import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(() => {})

export const DEMO_NOTE = 'Included in the full release — not part of this prototype'

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const show = useCallback(msg => {
    const id = ++idRef.current
    setToasts(t => [...t, { id, msg }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="bg-navy text-white text-sm px-5 py-3 rounded-xl shadow-lg border border-gold/40 max-w-md text-center">
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
