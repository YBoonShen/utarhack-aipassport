// Notification panel + detail modal — matches Figma "Notification Panel" states and "Notification detail" frames (05 series)
import { useState } from 'react'
import { useNotifications } from './notificationsStore.jsx'

function NotificationCard({ n, onOpen }) {
  if (n.deleted) {
    return (
      <div className="border border-dashed border-sand rounded-[12px] px-4 py-3.5 flex items-center justify-between bg-chip">
        <p className="text-slate2 text-xs">Notification deleted.</p>
        <button onClick={() => onOpen('restore', n.id)} className="text-[#2e5ccc] text-[11px] font-semibold cursor-pointer">Undo</button>
      </div>
    )
  }
  const unread = !n.read
  return (
    <button
      onClick={() => onOpen('detail', n.id)}
      className={`w-full text-left rounded-[12px] p-4 pt-2.5 cursor-pointer border ${unread ? 'bg-[#edf2ff] border-[#2e5ccc]' : 'bg-card border-sand'}`}
    >
      <div className="flex items-center gap-2">
        {unread && <span className="w-2 h-2 rounded-full bg-[#2e5ccc] shrink-0" />}
        <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${unread ? 'bg-white text-[#2e5ccc]' : 'bg-chip text-slate2'}`}>{n.category}</span>
        <span className="ml-auto text-[11px] font-medium text-slate2">{n.time}</span>
      </div>
      <p className="text-navy font-semibold text-[15px] mt-2">{n.title}</p>
      <p className="text-slate2 text-xs mt-1.5 leading-relaxed">{n.body}</p>
      <p className={`text-[11px] font-semibold mt-2 ${unread ? 'text-[#2e5ccc]' : 'text-slate2'}`}>View full details →</p>
    </button>
  )
}

function DetailModal({ n, onClose, onDelete }) {
  return (
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div
        className="bg-card border border-navy rounded-[20px] w-full max-w-[700px] p-7 relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <span className="text-[10px] font-semibold px-3 py-1.5 rounded-full bg-[#edf2ff] text-[#2e5ccc]">{n.category}</span>
          <button onClick={onClose} className="w-10 h-10 rounded-full border border-sand text-navy text-2xl leading-none cursor-pointer hover:bg-chip" aria-label="Close">×</button>
        </div>
        <h2 className="text-navy font-bold text-[27px] mt-3">{n.title}</h2>
        <p className="text-slate2 text-[13px] font-medium mt-1">{n.received}</p>
        <div className="h-px bg-sand my-4" />
        <p className="text-gold text-[11px] font-semibold tracking-wide">WHAT HAPPENED</p>
        <p className="text-ink text-[15px] mt-2 leading-relaxed">{n.what}</p>
        <div className="bg-[#edf2ff] rounded-[14px] p-4.5 mt-5">
          <p className="text-navy font-semibold text-base mb-1 px-0.5">Details</p>
          {n.facts.map(([k, v], i) => (
            <div key={k} className={`flex justify-between py-2 px-0.5 ${i > 0 ? 'border-t border-sand' : ''}`}>
              <span className="text-slate2 text-[13px] font-medium">{k}</span>
              <span className="text-navy text-[13px] font-semibold text-right">{v}</span>
            </div>
          ))}
        </div>
        <div className="border border-sand rounded-[10px] px-3.5 py-3.5 mt-4">
          <p className="text-slate2 text-xs">Only approved, masked information is shown in notifications.</p>
        </div>
        <div className="flex justify-end mt-5">
          <button
            onClick={() => onDelete(n.id)}
            className="border border-red-alert text-red-alert text-sm font-semibold px-8 h-12 rounded-full cursor-pointer hover:bg-red-50"
          >
            Delete notification
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NotificationCenter({ onClose }) {
  const { items, markRead, remove, restore } = useNotifications()
  const [detailId, setDetailId] = useState(null)
  const unread = items.filter(n => !n.read && !n.deleted).length
  const detail = items.find(n => n.id === detailId)

  function handleOpen(action, id) {
    if (action === 'restore') return restore(id)
    markRead(id)
    setDetailId(id)
  }

  return (
    <>
      <div className="fixed top-20 right-0 bottom-0 w-[504px] max-w-full bg-card border-l border-sand z-40 overflow-y-auto">
        <div className="p-6 pb-4 flex items-start justify-between">
          <div>
            <h2 className="text-navy font-bold text-[26px]">Notifications</h2>
            <p className="text-slate2 text-sm mt-1">{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full border border-sand text-navy text-2xl leading-none cursor-pointer hover:bg-chip" aria-label="Close panel">×</button>
        </div>
        <div className="px-6">
          <p className="text-gold text-[11px] font-semibold tracking-wide mb-3">LATEST</p>
          <div className="flex flex-col gap-3">
            {items.map(n => <NotificationCard key={n.id} n={n} onOpen={handleOpen} />)}
          </div>
          <div className="bg-[#edf2ff] rounded-[10px] px-3.5 py-4 my-5">
            <p className="text-slate2 text-xs">Notifications are retained for 30 days unless you delete them.</p>
          </div>
        </div>
      </div>
      {detail && !detail.deleted && (
        <DetailModal
          n={detail}
          onClose={() => setDetailId(null)}
          onDelete={id => { remove(id); setDetailId(null) }}
        />
      )}
    </>
  )
}
