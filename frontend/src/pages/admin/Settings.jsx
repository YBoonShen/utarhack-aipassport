// 17 Admin · Settings — matches Figma frames "17 / 17A–17D Admin • Settings"
// Live data: saving really updates the Gateway policy — the employee's Smart
// Gateway immediately masks/warns/blocks according to what is set here.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'

const categories = [
  { title: 'Gateway policy', sub: 'Protection mode and data types', active: true },
  { title: 'Data & retention', sub: 'Storage and deletion' },
  { title: 'Approved tools', sub: 'Tool and visa defaults' },
  { title: 'Notifications', sub: 'Alerts and escalation' },
  { title: 'Roles & access', sub: 'Admin permissions' },
  { title: 'Integrations', sub: 'Directory and reporting' },
]

const modes = [
  ['Mask and continue', 'Recommended · keeps work moving'],
  ['Warn only', 'Employee decides'],
  ['Block', 'Stops the prompt'],
]

const dataControls = [
  { key: 'personalIdentifiers', title: 'Personal identifiers', sub: 'Names, IC, phone and email' },
  { key: 'customerRecords', title: 'Customer records', sub: 'Accounts, cases and transactions' },
  { key: 'financialFigures', title: 'Financial figures', sub: 'Invoices, forecasts and pricing' },
  { key: 'sourceCode', title: 'Source code', sub: 'Internal repositories and secrets' },
]

const experienceItems = [
  { key: 'explainMask', title: 'Explain each mask' },
  { key: 'showSafeVersion', title: 'Show safe version' },
  { key: 'awardPoints', title: 'Award safety points' },
]

const defaultSettings = {
  mode: 'Mask and continue',
  controls: { personalIdentifiers: true, customerRecords: true, financialFigures: true, sourceCode: false },
  experience: { explainMask: true, showSafeVersion: true, awardPoints: true },
  escalate: true,
  policyVersion: 11,
}

function countChanges(a, b) {
  let n = 0
  if (a.mode !== b.mode) n++
  for (const k of Object.keys(a.controls)) if (a.controls[k] !== b.controls[k]) n++
  for (const k of Object.keys(a.experience)) if (a.experience[k] !== b.experience[k]) n++
  if (a.escalate !== b.escalate) n++
  return n
}

function Toggle({ on, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`w-12 h-7 rounded-full relative shrink-0 cursor-pointer transition-colors ${on ? 'bg-[#365fd9]' : 'bg-[#d8d0b4]'}`}
    >
      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  )
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="bg-card border border-navy rounded-[20px] w-full max-w-[560px] p-7 pt-6" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export default function Settings() {
  const [draft, setDraft] = useState(defaultSettings)
  const [saved, setSaved] = useState(defaultSettings)
  const [modal, setModal] = useState(null) // 'confirmSave' | 'saved' | 'confirmDiscard' | 'discarded'
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/settings').then(s => { setDraft(s); setSaved(s) }).catch(() => {})
  }, [])

  const { mode, controls, experience: exp, escalate } = draft
  const setMode = m => setDraft(d => ({ ...d, mode: m }))
  const toggleControl = k => setDraft(d => ({ ...d, controls: { ...d.controls, [k]: !d.controls[k] } }))
  const toggleExp = k => setDraft(d => ({ ...d, experience: { ...d.experience, [k]: !d.experience[k] } }))
  const toggleEscalate = () => setDraft(d => ({ ...d, escalate: !d.escalate }))

  const changes = countChanges(draft, saved)
  const enabledCount = Object.values(controls).filter(Boolean).length + Object.values(exp).filter(Boolean).length + (escalate ? 1 : 0)

  async function confirmSave() {
    setBusy(true)
    try {
      const next = await api.put('/settings', { mode, controls, experience: exp, escalate })
      setSaved(next)
      setDraft(next)
      setModal('saved')
    } catch {
      setModal(null)
    } finally {
      setBusy(false)
    }
  }

  function confirmDiscard() {
    setDraft(saved)
    setModal('discarded')
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[#17213a]">Settings</h1>
          <p className="text-[#667085] text-sm mt-1.5">Configure protection, access and audit behaviour with safe organisational defaults.</p>
        </div>
        <div className="flex gap-3.5">
          <button onClick={() => setModal('confirmDiscard')} className="border-[1.5px] border-navy-header text-navy-header font-semibold text-xs w-[150px] h-11 rounded-full cursor-pointer hover:bg-chip">
            Discard changes
          </button>
          <button onClick={() => setModal('confirmSave')} className="bg-gold-brand hover:bg-gold text-navy-header font-semibold text-xs w-40 h-11 rounded-full cursor-pointer">
            Save changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[260px_1fr] gap-5 mt-6 items-start">
        {/* Settings categories */}
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-3 pt-4 flex flex-col">
          <p className="text-[#667085] font-semibold text-[11px] px-2">ADMIN SETTINGS</p>
          <div className="flex flex-col gap-3 mt-3">
            {categories.map(c => (
              <button key={c.title} className={`text-left rounded-[10px] px-4 py-2.5 relative cursor-pointer ${c.active ? 'bg-[#eef2ff]' : 'hover:bg-chip'}`}>
                {c.active && <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-[2px] bg-[#365fd9]" />}
                <p className={`font-semibold text-[13px] ${c.active ? 'text-[#365fd9]' : 'text-[#17213a]'}`}>{c.title}</p>
                <p className="text-[#667085] text-[10px] mt-0.5">{c.sub}</p>
              </button>
            ))}
          </div>
          <div className="bg-navy-header rounded-[10px] p-3.5 mt-3.5">
            <p className="text-gold-brand font-semibold text-[10px]">CHANGE CONTROL</p>
            <p className="text-white text-[11px] mt-2 leading-relaxed">Every policy update records the editor, reason and effective time in the audit log.</p>
          </div>
          <p className="text-[#667085] font-medium text-[10px] text-center mt-5 mb-2">Last policy review · 02 Jul 2026</p>
        </div>

        {/* Gateway policy settings */}
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-6 pt-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[#17213a] font-bold text-xl">Gateway policy</p>
              <p className="text-[#667085] text-xs mt-1">Choose how AI Passport responds when sensitive content is detected.</p>
            </div>
            <span className="bg-[#e9f8f2] text-[#078b6c] font-semibold text-[11px] rounded-full px-8 py-1.5">ACTIVE</span>
          </div>
          <div className="h-px bg-[#d8d0b4] my-4" />

          <p className="text-[#667085] font-semibold text-[10px]">PROTECTION MODE</p>
          <div className="grid grid-cols-3 gap-4 mt-2.5 max-w-[776px]">
            {modes.map(([title, sub]) => {
              const selected = mode === title
              return (
                <button
                  key={title}
                  onClick={() => setMode(title)}
                  className={`text-left rounded-[12px] px-3 py-3.5 flex gap-2.5 cursor-pointer ${selected ? 'bg-[#edf2ff] border-2 border-navy' : 'bg-[#fefbf0] border border-[#d1c79e]'}`}
                >
                  <span className={`w-[18px] h-[18px] rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${selected ? 'border-navy' : 'border-[#98a2b3]'}`}>
                    {selected && <span className="w-1.5 h-1.5 rounded-full bg-navy" />}
                  </span>
                  <span>
                    <p className="text-[#17213a] font-semibold text-[13px]">{title}</p>
                    <p className="text-[#667085] text-[10px] mt-1">{sub}</p>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-[1fr_268px] gap-5 mt-5">
            {/* Sensitive data controls */}
            <div className="bg-[#fffcef] border border-[#d8d0b4] rounded-[10px] p-4">
              <p className="text-[#17213a] font-bold text-base">Sensitive data controls</p>
              <p className="text-[#667085] text-[11px] mt-1">Apply before a prompt leaves the browser.</p>
              {dataControls.map((c, i) => (
                <div key={c.key} className={`flex items-center justify-between py-2.5 ${i > 0 ? 'border-t border-[#d8d0b4]' : 'mt-2'}`}>
                  <div>
                    <p className="text-[#17213a] font-semibold text-xs">{c.title}</p>
                    <p className="text-[#667085] text-[10px] mt-0.5">{c.sub}</p>
                  </div>
                  <Toggle on={controls[c.key]} onClick={() => toggleControl(c.key)} />
                </div>
              ))}
            </div>

            {/* Employee experience */}
            <div className="bg-[#fffcef] border border-[#d8d0b4] rounded-[10px] p-4 flex flex-col">
              <p className="text-[#17213a] font-bold text-base">Employee experience</p>
              {experienceItems.map((e, i) => (
                <div key={e.key} className={`flex items-center justify-between py-3 ${i > 0 ? 'border-t border-[#d8d0b4]' : 'mt-1'}`}>
                  <p className="text-[#17213a] font-semibold text-[11px]">{e.title}</p>
                  <Toggle on={exp[e.key]} onClick={() => toggleExp(e.key)} />
                </div>
              ))}
              <div className="bg-[#eef2ff] rounded-[8px] px-3 py-3 mt-auto">
                <p className="text-[#365fd9] font-medium text-[10px] text-center">Use guidance before restriction.</p>
              </div>
            </div>
          </div>

          {/* Data minimisation */}
          <div className="bg-navy-header rounded-[10px] p-4 mt-5 flex justify-between items-start">
            <div>
              <p className="text-gold-brand font-semibold text-[10px]">DATA MINIMISATION</p>
              <p className="text-white font-bold text-base mt-1.5">Store masked prompts only</p>
              <p className="text-[#d8d0b4] text-[11px] mt-1.5 max-w-[550px]">
                Raw sensitive content stays in the browser. Audit records retain masked text for 90 days.
              </p>
            </div>
            <span className="bg-[#eef2ff] text-[#365fd9] font-semibold text-[11px] rounded-full px-6 py-1.5 mt-4">90 days</span>
          </div>

          {/* Critical notifications */}
          <div className="bg-[#fffcef] border border-[#d8d0b4] rounded-[10px] p-4 mt-4 flex justify-between items-center">
            <div>
              <p className="text-[#17213a] font-semibold text-[13px]">Escalate high-risk alerts</p>
              <p className="text-[#667085] text-[11px] mt-1">Notify Compliance and the department owner within 15 minutes.</p>
            </div>
            <Toggle on={escalate} onClick={toggleEscalate} />
          </div>

          {/* Unsaved changes */}
          {changes > 0 ? (
            <div className="bg-[#fff5de] rounded-[10px] px-3.5 py-3.5 mt-4 flex justify-between items-center">
              <p className="text-[#d97706] font-medium text-[11px]">● {changes} unsaved change{changes === 1 ? '' : 's'} · save to apply the new policy to every employee</p>
              <button onClick={() => setModal('confirmSave')} className="text-[#365fd9] font-semibold text-[11px] cursor-pointer">Review changes ›</button>
            </div>
          ) : (
            <div className="bg-[#e9f8f2] rounded-[10px] px-3.5 py-3.5 mt-4">
              <p className="text-[#078b6c] font-medium text-[11px]">✓ Policy v{saved.policyVersion} active · all changes saved</p>
            </div>
          )}
        </div>
      </div>

      {/* 17A — Confirm save */}
      {modal === 'confirmSave' && (
        <Modal onClose={() => setModal(null)}>
          <p className="text-gold font-semibold text-[13px]">CONFIRM CHANGES</p>
          <p className="text-navy font-bold text-[27px] mt-1.5">Save Gateway Policy Changes?</p>
          <p className="text-ink text-base mt-2.5">
            These settings affect every employee using the Smart Gateway. The updated policy will apply after you confirm.
          </p>
          <div className="bg-[#edf2ff] rounded-[12px] px-4 py-3 mt-4">
            <p className="text-navy font-semibold text-sm">Policy summary</p>
            <p className="text-slate2 text-sm mt-1.5">{mode} · {enabledCount} protections enabled</p>
            <p className="text-slate2 text-sm">Critical alerts notify AI Governance and Security</p>
          </div>
          <div className="flex gap-4 mt-6">
            <button onClick={() => setModal(null)} className="border border-navy text-navy font-semibold text-[15px] w-[180px] h-12 rounded-full cursor-pointer hover:bg-chip">
              Keep editing
            </button>
            <button onClick={confirmSave} disabled={busy} className="bg-gold hover:bg-gold-dark text-navy font-semibold text-[15px] flex-1 h-12 rounded-full cursor-pointer disabled:opacity-60">
              {busy ? 'Saving…' : 'Yes, save changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* 17B — Saved */}
      {modal === 'saved' && (
        <Modal onClose={() => setModal(null)}>
          <span className="inline-block bg-green-soft text-green font-semibold text-xs rounded-full px-3 py-2">✓ CHANGES SAVED</span>
          <p className="text-navy font-bold text-[27px] mt-4">Changes are now Saved</p>
          <p className="text-ink text-base mt-2">
            Gateway policy v{saved.policyVersion} is active. A policy-change event was written to the audit log for traceability.
          </p>
          <div className="bg-[#edf2ff] rounded-[10px] px-3.5 py-3.5 mt-4">
            <p className="text-navy font-medium text-sm">New prompts now use the updated protection settings.</p>
          </div>
          <button onClick={() => setModal(null)} className="bg-gold hover:bg-gold-dark text-navy font-semibold text-[15px] w-full h-12 rounded-full mt-6 cursor-pointer">
            Done
          </button>
        </Modal>
      )}

      {/* 17C — Confirm discard */}
      {modal === 'confirmDiscard' && (
        <Modal onClose={() => setModal(null)}>
          <p className="text-gold font-semibold text-[13px]">DISCARD CHANGES</p>
          <p className="text-navy font-bold text-[27px] mt-1.5">Discard Unsaved Changes?</p>
          <p className="text-ink text-base mt-2.5">
            Your edits to the Gateway policy will be lost. The current active policy stays in force.
          </p>
          <div className="bg-[#edf2ff] rounded-[10px] px-3.5 py-3.5 mt-4">
            <p className="text-slate2 text-sm">{changes} unsaved change{changes === 1 ? '' : 's'} will be reverted to policy v{saved.policyVersion}</p>
          </div>
          <div className="flex gap-4 mt-6">
            <button onClick={() => setModal(null)} className="border border-navy text-navy font-semibold text-[15px] w-[180px] h-12 rounded-full cursor-pointer hover:bg-chip">
              Keep editing
            </button>
            <button onClick={confirmDiscard} className="bg-gold hover:bg-gold-dark text-navy font-semibold text-[15px] flex-1 h-12 rounded-full cursor-pointer">
              Confirm discard
            </button>
          </div>
        </Modal>
      )}

      {/* 17D — Discarded */}
      {modal === 'discarded' && (
        <Modal onClose={() => setModal(null)}>
          <span className="inline-block bg-green-soft text-green font-semibold text-xs rounded-full px-3 py-2">✓ CHANGES DISCARDED</span>
          <p className="text-navy font-bold text-[27px] mt-4">Changes Discarded</p>
          <p className="text-ink text-base mt-2">Your unsaved edits were removed. Gateway policy v{saved.policyVersion} remains active.</p>
          <button onClick={() => setModal(null)} className="bg-gold hover:bg-gold-dark text-navy font-semibold text-[15px] w-full h-12 rounded-full mt-6 cursor-pointer">
            Done
          </button>
        </Modal>
      )}
    </div>
  )
}
