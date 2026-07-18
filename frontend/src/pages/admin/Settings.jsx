// 17 Admin · Settings — matches Figma frames "17 / 17A-D Admin • Settings"
// B7: hidden demo tools at the bottom reset the in-memory backend state
// (or jump points near the Level-3 threshold for the demo climax).
import { useState } from 'react'
import { apiPost } from '../../api.js'
import { useToast } from '../../components/Toast.jsx'

const initialToggles = [
  { key: 'maskNames', label: 'Mask personal names in prompts', desc: 'Replace full names with [MASKED-NAME] before a prompt leaves the device.', on: true },
  { key: 'maskIc', label: 'Mask IC / passport numbers', desc: 'Replace IC and passport numbers with [MASKED-IC].', on: true },
  { key: 'maskPhone', label: 'Mask phone numbers', desc: 'Replace phone numbers with [MASKED-PHONE].', on: true },
  { key: 'blockUnapproved', label: 'Block unapproved AI tools', desc: 'Redirect employees to an approved alternative instead of sending the prompt.', on: false },
  { key: 'requireReview', label: 'Require human review on AI-assisted decisions', desc: 'Decisions that affect a person must be confirmed by a human before acting.', on: true },
]

export default function Settings() {
  const [toggles, setToggles] = useState(initialToggles)
  const [dirty, setDirty] = useState(false)
  const [modal, setModal] = useState(null) // 'save' | 'saved' | 'discard' | 'discarded'
  const toast = useToast()

  function flip(key) {
    setToggles(t => t.map(x => x.key === key ? { ...x, on: !x.on } : x))
    setDirty(true)
  }

  async function resetDemo(overrides, msg) {
    try {
      await apiPost('/reset', overrides)
      localStorage.removeItem('aipassport-chat')
      toast(msg)
    } catch {
      toast('Backend not running — start it with: cd backend && npm run dev')
    }
  }

  return (
    <>
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-navy">Settings</h1>
          <p className="text-gray-500 text-sm">Company-wide Smart Gateway policy and governance rules.</p>
        </div>
        {dirty && (
          <div className="flex gap-3">
            <button onClick={() => setModal('discard')} className="border-2 border-navy text-navy px-5 py-2.5 rounded-full text-sm">
              Discard changes
            </button>
            <button onClick={() => setModal('save')} className="bg-gold hover:bg-gold-dark text-navy font-bold px-6 py-2.5 rounded-full text-sm">
              Save changes
            </button>
          </div>
        )}
      </div>

      <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6 mt-6">
        <p className="font-bold text-navy text-sm mb-4">Gateway masking policy</p>
        <div className="flex flex-col divide-y divide-[#eee5cf]">
          {toggles.map(t => (
            <div key={t.key} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-bold text-navy">{t.label}</p>
                <p className="text-xs text-gray-500 mt-0.5 max-w-lg">{t.desc}</p>
              </div>
              <button
                onClick={() => flip(t.key)}
                className={`w-12 h-7 rounded-full shrink-0 relative transition-colors ${t.on ? 'bg-gold' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${t.on ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* B7 — demo prep tools (kept subtle; for presenters, not the audience) */}
      <div className="mt-8 flex items-center gap-4 text-xs text-gray-400">
        <span>Demo tools:</span>
        <button
          onClick={() => resetDemo({}, 'Demo data reset — fresh state for the next run.')}
          className="underline underline-offset-2 hover:text-navy"
        >
          Reset demo data
        </button>
        <button
          onClick={() => resetDemo({ points: 1950 }, 'Points set to 1,950 — one clean prompt + quiz tips Level 3.')}
          className="underline underline-offset-2 hover:text-navy"
        >
          Jump to 1,950 pts (near level-up)
        </button>
      </div>

      {/* 17A — confirm save */}
      {modal === 'save' && (
        <ConfirmModal
          title="Save Gateway Policy Changes?"
          body="These rules apply to every employee company-wide the moment you save. Changes are also recorded in the audit log."
          confirmLabel="Save changes"
          onCancel={() => setModal(null)}
          onConfirm={() => { setDirty(false); setModal('saved') }}
        />
      )}
      {/* 17B — saved confirmation */}
      {modal === 'saved' && (
        <InfoModal title="Policy Changes Saved" body="Your changes are live for all employees now." onClose={() => setModal(null)} />
      )}
      {/* 17C — confirm discard */}
      {modal === 'discard' && (
        <ConfirmModal
          title="Discard Unsaved Changes?"
          body="Your toggles will revert to the last saved policy. This cannot be undone."
          confirmLabel="Discard"
          danger
          onCancel={() => setModal(null)}
          onConfirm={() => { setToggles(initialToggles); setDirty(false); setModal('discarded') }}
        />
      )}
      {/* 17D — discarded confirmation */}
      {modal === 'discarded' && (
        <InfoModal title="Changes Discarded" body="The Gateway policy is back to its last saved state." onClose={() => setModal(null)} />
      )}
    </>
  )
}

function ConfirmModal({ title, body, confirmLabel, danger, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-navy-dark/60 flex items-center justify-center p-6 z-50">
      <div className="bg-cream border-[3px] border-navy rounded-2xl max-w-md w-full overflow-hidden">
        <div className="bg-navy px-7 py-5">
          <p className="text-white font-bold text-lg">{title}</p>
        </div>
        <div className="p-7">
          <p className="text-sm text-gray-700">{body}</p>
          <div className="mt-6 flex gap-3">
            <button onClick={onCancel} className="border-2 border-navy text-navy px-6 py-2.5 rounded-full text-sm flex-1">Cancel</button>
            <button
              onClick={onConfirm}
              className={`px-6 py-2.5 rounded-full text-sm font-bold flex-1 ${danger ? 'bg-red-700 hover:bg-red-800 text-white' : 'bg-gold hover:bg-gold-dark text-navy'}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoModal({ title, body, onClose }) {
  return (
    <div className="fixed inset-0 bg-navy-dark/60 flex items-center justify-center p-6 z-50">
      <div className="bg-cream border-[3px] border-navy rounded-2xl max-w-sm w-full overflow-hidden text-center">
        <div className="p-8">
          <div className="w-14 h-14 mx-auto rounded-full bg-gold flex items-center justify-center text-navy text-2xl font-bold">✓</div>
          <p className="text-navy font-bold text-lg mt-4">{title}</p>
          <p className="text-sm text-gray-600 mt-2">{body}</p>
          <button onClick={onClose} className="mt-6 bg-gold hover:bg-gold-dark text-navy font-bold px-6 py-2.5 rounded-full text-sm w-full">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
