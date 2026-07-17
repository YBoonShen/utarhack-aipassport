// Notification panel + detail + delete confirmation — matches Figma "Employee
// Notification Workspace", "Notification detail" and "Overlay • Delete notification".
import { useState } from 'react'
import { useNotifications } from './notificationsStore.jsx'

function NotificationCard({ n, onOpen }) {
  const unread = !n.read
  return (
    <button
      onClick={() => onOpen(n.id)}
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

function DeleteConfirm({ n, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-[60]" onClick={onCancel}>
      <div
        className="bg-white border-[1.5px] border-navy-header rounded-[18px] shadow-[0px_12px_16px_rgba(5,15,38,0.22)] w-full max-w-[480px] p-7"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-full bg-[#fff0f0] border-2 border-[#d92d20] flex items-center justify-center">
            <span className="text-[#d92d20] font-bold text-[22px]">!</span>
          </div>
          <button onClick={onCancel} className="w-10 h-10 rounded-full border border-sand text-navy-header text-xl leading-none cursor-pointer hover:bg-chip" aria-label="Close">×</button>
        </div>
        <p className="text-navy-header font-bold text-[22px] mt-4">Delete this notification?</p>
        <p className="text-[#667085] text-sm mt-2.5">
          This removes “{n.title}” from your notification inbox. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onCancel} className="border border-sand text-navy-header font-semibold text-sm w-28 h-12 rounded-full cursor-pointer hover:bg-chip">
            Cancel
          </button>
          <button onClick={onConfirm} className="bg-[#d92d20] hover:bg-[#b8241a] text-white font-semibold text-sm w-32 h-12 rounded-full cursor-pointer">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailModal({ n, onClose, onDeleteRequest }) {
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
            onClick={onDeleteRequest}
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
  const { items, markRead, remove } = useNotifications()
  const [detailId, setDetailId] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const visible = items.filter(n => !n.deleted)
  const unread = visible.filter(n => !n.read).length
  const detail = visible.find(n => n.id === detailId)
  const deleting = visible.find(n => n.id === deleteId)

  function openDetail(id) {
    markRead(id)
    setDetailId(id)
  }

  function confirmDelete() {
    remove(deleteId)
    setDeleteId(null)
    setDetailId(null)
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
            {visible.length === 0 && <p className="text-slate2 text-sm py-6 text-center">No notifications.</p>}
            {visible.map(n => <NotificationCard key={n.id} n={n} onOpen={openDetail} />)}
          </div>
          <div className="bg-[#edf2ff] rounded-[10px] px-3.5 py-4 my-5">
            <p className="text-slate2 text-xs">Notifications are retained for 30 days unless you delete them.</p>
          </div>
        </div>
      </div>
      {detail && !deleting && (
        <DetailModal
          n={detail}
          onClose={() => setDetailId(null)}
          onDeleteRequest={() => setDeleteId(detail.id)}
        />
      )}
      {deleting && (
        <DeleteConfirm n={deleting} onCancel={() => setDeleteId(null)} onConfirm={confirmDelete} />
      )}
    </>
  )
}
