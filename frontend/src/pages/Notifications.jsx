// 05 Employee · Notifications — matches Figma frame "05 Employee • Notifications"
// Full-page master–detail layout: Inbox list on the left, detail panel on the
// right, red delete-confirmation overlay (permanent delete).
import { useEffect, useState } from 'react'
import { useNotifications } from '../components/notificationsStore.jsx'

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

export default function Notifications() {
  const { items, markRead, remove } = useNotifications()
  const [selectedId, setSelectedId] = useState(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const visible = items.filter(n => !n.deleted)
  const unread = visible.filter(n => !n.read).length
  const selected = visible.find(n => n.id === selectedId) || visible[0]

  // Opening the page (or switching selection) marks the shown notification read
  useEffect(() => {
    if (selected && !selected.read) markRead(selected.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  function confirmDelete() {
    const idx = visible.findIndex(n => n.id === selected.id)
    remove(selected.id)
    setDeleteOpen(false)
    const next = visible[idx + 1] || visible[idx - 1]
    setSelectedId(next?.id ?? null)
  }

  return (
    <div className="max-w-[1440px] mx-auto px-10 py-8">
      <h1 className="text-[30px] font-bold text-navy-header">Notifications</h1>
      <p className="text-[#667085] text-sm mt-1.5 mb-6">Review updates about your training, visas, safety progress and Smart Gateway activity.</p>

      <div className="grid grid-cols-[340px_1fr] gap-6 items-start">
        {/* Inbox */}
        <div className="bg-card border border-sand rounded-[16px] p-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-navy font-bold text-lg">Inbox</p>
              <p className="text-slate2 text-xs mt-0.5">{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
            </div>
            <span className="bg-chip text-slate2 font-semibold text-[10px] tracking-wide rounded-full px-3.5 py-1.5">LATEST</span>
          </div>

          <div className="flex flex-col gap-3 mt-4">
            {visible.length === 0 && <p className="text-slate2 text-sm py-8 text-center">No notifications.</p>}
            {visible.map(n => {
              const active = selected?.id === n.id
              return (
                <button
                  key={n.id}
                  onClick={() => setSelectedId(n.id)}
                  className={`text-left rounded-[12px] p-3.5 pt-2.5 cursor-pointer border bg-[#edf2ff] ${active ? 'border-navy-header ring-1 ring-navy-header' : 'border-[#c7d4f5]'}`}
                >
                  <div className="flex items-center gap-2">
                    {!n.read && <span className="w-2 h-2 rounded-full bg-[#2e5ccc] shrink-0" />}
                    <span className="bg-white text-[#2e5ccc] text-[10px] font-semibold px-2.5 py-1 rounded-full">{n.category}</span>
                    <span className="ml-auto text-[10px] font-medium text-slate2">{n.time}</span>
                  </div>
                  <p className="text-navy font-semibold text-sm mt-2">{n.title}</p>
                  <p className="text-slate2 text-[11px] mt-1 leading-relaxed line-clamp-2">{n.body}</p>
                </button>
              )
            })}
          </div>

          <div className="bg-[#edf2ff] rounded-[10px] px-3.5 py-3 mt-4">
            <p className="text-slate2 text-[11px]">Notifications are retained for 30 days unless you delete them.</p>
          </div>
        </div>

        {/* Detail panel */}
        {selected ? (
          <div className="bg-card border border-sand rounded-[16px] p-7">
            <span className="text-[10px] font-semibold px-3 py-1.5 rounded-full bg-[#edf2ff] text-[#2e5ccc]">{selected.category}</span>
            <h2 className="text-navy font-bold text-[27px] mt-3">{selected.title}</h2>
            <p className="text-slate2 text-[13px] font-medium mt-1">{selected.received}</p>
            <div className="h-px bg-sand my-4" />
            <p className="text-gold text-[11px] font-semibold tracking-wide">WHAT HAPPENED</p>
            <p className="text-ink text-[15px] mt-2 leading-relaxed">{selected.what}</p>

            <div className="bg-[#edf2ff] rounded-[14px] p-4.5 mt-6">
              <p className="text-navy font-semibold text-base mb-1 px-0.5">Details</p>
              {selected.facts.map(([k, v], i) => (
                <div key={k} className={`flex justify-between py-2.5 px-0.5 ${i > 0 ? 'border-t border-sand' : ''}`}>
                  <span className="text-slate2 text-[13px] font-medium">{k}</span>
                  <span className="text-navy text-[13px] font-semibold text-right">{v}</span>
                </div>
              ))}
            </div>

            <div className="border border-sand rounded-[10px] px-3.5 py-3.5 mt-5 flex items-center gap-2.5">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[#078b6c] shrink-0" />
              <p className="text-slate2 text-xs">Only approved, masked information appears in notifications.</p>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setDeleteOpen(true)}
                className="border border-red-alert text-red-alert text-sm font-semibold px-8 h-12 rounded-full cursor-pointer hover:bg-red-50"
              >
                Delete notification
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-sand rounded-[16px] p-16 text-center">
            <p className="text-slate2 text-sm">Select a notification to view its details.</p>
          </div>
        )}
      </div>

      {deleteOpen && selected && (
        <DeleteConfirm n={selected} onCancel={() => setDeleteOpen(false)} onConfirm={confirmDelete} />
      )}
    </div>
  )
}
