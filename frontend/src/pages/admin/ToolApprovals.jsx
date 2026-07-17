// 15 Admin · Tool Approvals — matches Figma frames "15 / 15A / 15B Admin • Tool Approvals"
import { useState } from 'react'

const requests = [
  { id: 1, tool: 'SummarizerX', dept: 'Sales', requester: 'S-044 · Wei Ling', purpose: 'Summarise long customer call transcripts into follow-up notes.', days: '2.4 days avg', vendor: 'Reviewed', dataAccess: 'Reviewed' },
  { id: 2, tool: 'Claude for Sheets', dept: 'Finance', requester: 'F-102 · Ahmad Rizal', purpose: 'Draft formulas and clean up monthly reconciliation sheets.', days: '2.4 days avg', vendor: 'Pending', dataAccess: 'Pending' },
]

export default function ToolApprovals() {
  const [modal, setModal] = useState(null) // { type: 'approve' | 'reject', req }

  return (
    <>
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-navy">Tool Approvals</h1>
          <p className="text-gray-500 text-sm">2 requests waiting · 2.4 days average turnaround</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 mt-6">
        {requests.map(r => (
          <div key={r.id} className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6 flex justify-between items-start gap-6">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-bold text-navy text-lg">{r.tool}</p>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-1 rounded-full">PENDING REVIEW</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{r.dept} · requested by {r.requester}</p>
              <p className="text-sm text-gray-700 mt-3 max-w-lg">{r.purpose}</p>
              <div className="flex gap-6 mt-3 text-xs text-gray-500">
                <span>Vendor security review: <b className="text-navy">{r.vendor}</b></span>
                <span>Data access scope: <b className="text-navy">{r.dataAccess}</b></span>
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button onClick={() => setModal({ type: 'approve', req: r })} className="bg-gold hover:bg-gold-dark text-navy font-bold px-6 py-2.5 rounded-full text-sm">
                Approve
              </button>
              <button onClick={() => setModal({ type: 'reject', req: r })} className="border-2 border-navy text-navy px-6 py-2.5 rounded-full text-sm">
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 15A / 15B — confirmation modals */}
      {modal && (
        <div className="fixed inset-0 bg-navy-dark/60 flex items-center justify-center p-6 z-50">
          <div className="bg-cream border-[3px] border-navy rounded-2xl max-w-md w-full overflow-hidden">
            <div className="bg-navy px-7 py-5">
              <p className="text-white font-bold text-lg">
                {modal.type === 'approve' ? `Approve ${modal.req.tool}?` : `Reject ${modal.req.tool}?`}
              </p>
              <p className="text-gold text-xs mt-1">{modal.req.dept} · {modal.req.requester}</p>
            </div>
            <div className="p-7">
              {modal.type === 'approve' ? (
                <p className="text-sm text-gray-700">
                  This tool will become available to all employees at their current license level in {modal.req.dept}. The requester will be notified immediately.
                </p>
              ) : (
                <p className="text-sm text-gray-700">
                  The requester will be notified their request was declined, with a reason you can add below.
                </p>
              )}
              {modal.type === 'reject' && (
                <textarea placeholder="Reason (optional)" className="w-full mt-4 h-20 resize-none bg-white border border-[#d8cfae] rounded-lg p-3 text-sm outline-none" />
              )}
              <div className="mt-6 flex gap-3">
                <button onClick={() => setModal(null)} className="border-2 border-navy text-navy px-6 py-2.5 rounded-full text-sm flex-1">
                  Cancel
                </button>
                <button
                  onClick={() => setModal(null)}
                  className={`px-6 py-2.5 rounded-full text-sm font-bold flex-1 ${modal.type === 'approve' ? 'bg-gold hover:bg-gold-dark text-navy' : 'bg-red-700 hover:bg-red-800 text-white'}`}
                >
                  {modal.type === 'approve' ? 'Yes, approve' : 'Yes, reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
