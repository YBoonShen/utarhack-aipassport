// 17 Admin · Settings — matches Figma frames "17 / 17A–17D Admin • Settings"
// and the "Admin Settings Workspace" sub-pages (Gateway policy, Data &
// retention, Approved tools, Notifications, Roles & access, Integrations).
// Gateway policy is live (saving updates the Smart Gateway); the other
// sections are demo-local interactive state.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'

const categories = [
  { key: 'gateway', title: 'Gateway policy', sub: 'Protection mode and data types' },
  { key: 'data', title: 'Data & retention', sub: 'Storage and deletion' },
  { key: 'tools', title: 'Approved tools', sub: 'Tool and visa defaults' },
  { key: 'notifications', title: 'Notifications', sub: 'Alerts and escalation' },
  { key: 'roles', title: 'Roles & access', sub: 'Admin permissions' },
  { key: 'integrations', title: 'Integrations', sub: 'Directory and reporting' },
]

const sectionMeta = {
  gateway: { title: 'Gateway policy', subtitle: 'Choose how AI Passport responds when sensitive content is detected.', badge: 'ACTIVE' },
  data: { title: 'Data & retention', subtitle: 'Control what is stored, for how long, and how records are deleted.', badge: 'ENFORCED' },
  tools: { title: 'Approved tools', subtitle: 'Set default visa rules and the data each approved AI tool may receive.', badge: 'CONFIGURED' },
  notifications: { title: 'Notifications', subtitle: 'Decide how critical events are delivered and escalated.', badge: 'ACTIVE' },
  roles: { title: 'Roles & access', subtitle: 'Control who can change policy and how access is protected.', badge: 'ENFORCED' },
  integrations: { title: 'Integrations', subtitle: 'Connect trusted enterprise systems while keeping sync health and ownership visible.', badge: 'HEALTHY' },
}

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
      className={`w-12 h-7 rounded-full relative shrink-0 cursor-pointer transition-colors ${on ? 'bg-navy-header' : 'bg-[#d8d0b4]'}`}
    >
      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  )
}

// Cream sub-card used across every settings section.
function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-[#fffcef] border border-[#d8d0b4] rounded-[14px] p-5 ${className}`}>
      {title && <p className="text-[#17213a] font-bold text-base">{title}</p>}
      {children}
    </div>
  )
}

function ToggleRow({ title, sub, on, onToggle, i }) {
  return (
    <div className={`flex items-center justify-between py-3 ${i > 0 ? 'border-t border-[#e6dcbf]' : 'mt-2'}`}>
      <div>
        <p className="text-[#17213a] font-semibold text-[13px]">{title}</p>
        {sub && <p className="text-[#667085] text-[11px] mt-0.5">{sub}</p>}
      </div>
      <Toggle on={on} onClick={onToggle} />
    </div>
  )
}

function InfoRow({ title, sub, right, i }) {
  return (
    <div className={`flex items-center justify-between py-3 ${i > 0 ? 'border-t border-[#e6dcbf]' : 'mt-2'}`}>
      <div>
        <p className="text-[#17213a] font-semibold text-[13px]">{title}</p>
        {sub && <p className="text-[#667085] text-[11px] mt-0.5">{sub}</p>}
      </div>
      {right && <span className="text-[#365fd9] font-semibold text-[13px] shrink-0">{right}</span>}
    </div>
  )
}

function Pills({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-3 mt-3">
      {options.map(o => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`h-11 px-6 rounded-full text-[13px] font-semibold cursor-pointer ${value === o ? 'bg-[#eef2ff] border-2 border-[#365fd9] text-[#365fd9]' : 'bg-white border border-[#d8d0b4] text-[#17213a]'}`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function NavyNote({ kicker, title, body }) {
  return (
    <div className="bg-navy-header rounded-[12px] p-5 mt-5">
      <p className="text-gold-brand font-semibold text-[10px]">{kicker}</p>
      <p className="text-white font-bold text-base mt-2">{title}</p>
      <p className="text-[#cbd5e1] text-[12px] mt-2">{body}</p>
    </div>
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
  const [section, setSection] = useState('gateway')
  const [draft, setDraft] = useState(defaultSettings)
  const [saved, setSaved] = useState(defaultSettings)
  const [modal, setModal] = useState(null) // 'confirmSave' | 'saved' | 'confirmDiscard' | 'discarded'
  const [busy, setBusy] = useState(false)

  // Demo-local state for the non-gateway sections
  const [retention, setRetention] = useState('90 days')
  const [auditFields, setAuditFields] = useState({ maskedPrompt: true, toolAction: true, deptContext: true })
  const [encExports, setEncExports] = useState(true)
  const [approvalPolicy, setApprovalPolicy] = useState('Visa required')
  const [safeguards, setSafeguards] = useState({ vendorReview: true, dataUse: true, inactiveReview: true })
  const [channels, setChannels] = useState({ 'Admin Console': true, Email: true, Teams: true })
  const [alertEvents, setAlertEvents] = useState({ highRisk: true, unapproved: true, overdue: true, milestone: true })
  const [access, setAccess] = useState({ mfa: true, quarterly: true })
  const [integrations, setIntegrations] = useState({ audit: true, siem: true, learning: true, identity: true })

  useEffect(() => {
    api.get('/settings').then(s => { setDraft(s); setSaved(s) }).catch(() => {})
  }, [])

  const { mode, controls, experience: exp, escalate } = draft
  const setMode = m => setDraft(d => ({ ...d, mode: m }))
  const toggleControl = k => setDraft(d => ({ ...d, controls: { ...d.controls, [k]: !d.controls[k] } }))
  const toggleExp = k => setDraft(d => ({ ...d, experience: { ...d.experience, [k]: !d.experience[k] } }))

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

  const meta = sectionMeta[section]

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
            {categories.map(c => {
              const active = section === c.key
              return (
                <button
                  key={c.key}
                  onClick={() => setSection(c.key)}
                  className={`text-left rounded-[10px] px-4 py-2.5 relative cursor-pointer ${active ? 'bg-[#eef2ff]' : 'hover:bg-chip'}`}
                >
                  {active && <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-[2px] bg-[#365fd9]" />}
                  <p className={`font-semibold text-[13px] ${active ? 'text-[#365fd9]' : 'text-[#17213a]'}`}>{c.title}</p>
                  <p className="text-[#667085] text-[10px] mt-0.5">{c.sub}</p>
                </button>
              )
            })}
          </div>
          <div className="bg-navy-header rounded-[10px] p-3.5 mt-3.5">
            <p className="text-gold-brand font-semibold text-[10px]">CHANGE CONTROL</p>
            <p className="text-white text-[11px] mt-2 leading-relaxed">Every policy update records the editor, reason and effective time in the audit log.</p>
          </div>
          <p className="text-[#667085] font-medium text-[10px] text-center mt-5 mb-2">Last policy review · 02 Jul 2026</p>
        </div>

        {/* Section panel */}
        <div className="bg-white border border-[#d8d0b4] rounded-[14px] p-6 pt-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[#17213a] font-bold text-xl">{meta.title}</p>
              <p className="text-[#667085] text-xs mt-1">{meta.subtitle}</p>
            </div>
            <span className="bg-[#e9f8f2] text-[#078b6c] font-semibold text-[11px] rounded-full px-6 py-1.5">{meta.badge}</span>
          </div>
          <div className="h-px bg-[#d8d0b4] my-4" />

          {section === 'gateway' && (
            <>
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
                <Card title="Sensitive data controls">
                  <p className="text-[#667085] text-[11px] mt-1">Apply before a prompt leaves the browser.</p>
                  {dataControls.map((c, i) => (
                    <ToggleRow key={c.key} i={i} title={c.title} sub={c.sub} on={controls[c.key]} onToggle={() => toggleControl(c.key)} />
                  ))}
                </Card>
                <Card title="Employee experience" className="flex flex-col">
                  {experienceItems.map((e, i) => (
                    <ToggleRow key={e.key} i={i} title={e.title} on={exp[e.key]} onToggle={() => toggleExp(e.key)} />
                  ))}
                  <div className="bg-[#eef2ff] rounded-[8px] px-3 py-3 mt-auto">
                    <p className="text-[#365fd9] font-medium text-[10px] text-center">Use guidance before restriction.</p>
                  </div>
                </Card>
              </div>

              <div className="bg-navy-header rounded-[10px] p-4 mt-5 flex justify-between items-start">
                <div>
                  <p className="text-gold-brand font-semibold text-[10px]">DATA MINIMISATION</p>
                  <p className="text-white font-bold text-base mt-1.5">Store masked prompts only</p>
                  <p className="text-[#d8d0b4] text-[11px] mt-1.5 max-w-[550px]">Raw sensitive values stay in the browser. Masked audit text is retained for 90 days.</p>
                </div>
                <span className="bg-[#eef2ff] text-[#365fd9] font-semibold text-[11px] rounded-full px-6 py-1.5 mt-4">90 days</span>
              </div>
            </>
          )}

          {section === 'data' && (
            <>
              <Card title="Masked prompt retention">
                <p className="text-[#667085] text-[11px] mt-1">Choose the minimum period required for audit and investigation.</p>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <Pills options={['30 days', '90 days', '180 days']} value={retention} onChange={setRetention} />
                  <p className="text-[#667085] text-[11px] max-w-[280px]">Current policy deletes eligible records automatically after {retention.replace(' days', '')} days.</p>
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-5 mt-5">
                <Card title="Stored audit fields">
                  <ToggleRow i={0} title="Masked prompt" sub="Never store raw sensitive values" on={auditFields.maskedPrompt} onToggle={() => setAuditFields(a => ({ ...a, maskedPrompt: !a.maskedPrompt }))} />
                  <ToggleRow i={1} title="Tool and action" sub="Provider, redirect and outcome" on={auditFields.toolAction} onToggle={() => setAuditFields(a => ({ ...a, toolAction: !a.toolAction }))} />
                  <ToggleRow i={2} title="Department context" sub="Team-level reporting only" on={auditFields.deptContext} onToggle={() => setAuditFields(a => ({ ...a, deptContext: !a.deptContext }))} />
                </Card>
                <Card title="Deletion operations">
                  <p className="text-gold-brand font-semibold text-[10px] mt-3">AUTOMATED PURGE</p>
                  <p className="text-[#17213a] font-bold text-lg mt-1">Daily · 02:00 MYT</p>
                  <p className="text-[#667085] text-[11px] mt-2">Failed jobs alert Compliance and retry safely.</p>
                  <div className="h-px bg-[#e6dcbf] my-3.5" />
                  <ToggleRow i={0} title="Encrypted admin exports" sub="Downloads expire after 24 hours." on={encExports} onToggle={() => setEncExports(v => !v)} />
                </Card>
              </div>

              <NavyNote kicker="PRIVACY BY DESIGN" title="Deletion is automatic and auditable" body="Every purge records the scope, completion time and administrator without restoring deleted content." />
            </>
          )}

          {section === 'tools' && (
            <>
              <Card title="Default approval policy">
                <p className="text-[#667085] text-[11px] mt-1">Unlisted tools require a visa before organisation data can be used.</p>
                <Pills options={['Visa required', 'Block unlisted', 'Allow review']} value={approvalPolicy} onChange={setApprovalPolicy} />
              </Card>

              <div className="grid grid-cols-2 gap-5 mt-5">
                <Card title="License-level access">
                  <InfoRow i={0} title="Level 1 · Explorer" sub="Public data only" />
                  <InfoRow i={1} title="Level 2 · Navigator" sub="Internal non-personal data" />
                  <InfoRow i={2} title="Level 3 · Ambassador" sub="Approved code and repositories" />
                </Card>
                <Card title="Review safeguards">
                  <ToggleRow i={0} title="Vendor security review" sub="Required before approval" on={safeguards.vendorReview} onToggle={() => setSafeguards(s => ({ ...s, vendorReview: !s.vendorReview }))} />
                  <ToggleRow i={1} title="Data-use declaration" sub="Categories shown on each visa" on={safeguards.dataUse} onToggle={() => setSafeguards(s => ({ ...s, dataUse: !s.dataUse }))} />
                  <ToggleRow i={2} title="Inactive tool review" sub="Reassess after 90 days" on={safeguards.inactiveReview} onToggle={() => setSafeguards(s => ({ ...s, inactiveReview: !s.inactiveReview }))} />
                  <p className="text-[#d97706] font-semibold text-[11px] mt-3">2 tool requests awaiting decision</p>
                </Card>
              </div>

              <NavyNote kicker="LEAST PRIVILEGE" title="Every visa states permitted data" body="Employees see the approved purpose and data categories before opening a tool." />
            </>
          )}

          {section === 'notifications' && (
            <>
              <Card title="Alert channels">
                <p className="text-[#667085] text-[11px] mt-1">Critical events use at least two verified delivery paths.</p>
                <div className="flex flex-wrap gap-3 mt-3">
                  {Object.keys(channels).map(ch => {
                    const on = channels[ch]
                    return (
                      <button
                        key={ch}
                        onClick={() => setChannels(c => ({ ...c, [ch]: !c[ch] }))}
                        className={`h-11 px-6 rounded-full text-[13px] font-semibold cursor-pointer ${on ? 'bg-[#eef2ff] border-2 border-[#365fd9] text-[#365fd9]' : 'bg-white border border-[#d8d0b4] text-[#667085]'}`}
                      >
                        {on ? '✓ ' : ''}{ch}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[#667085] text-[11px] mt-3">Fallback: notify the department owner if Compliance does not acknowledge.</p>
              </Card>

              <div className="grid grid-cols-2 gap-5 mt-5">
                <Card title="Alert events">
                  <ToggleRow i={0} title="High-risk prompt" sub="Immediate escalation" on={alertEvents.highRisk} onToggle={() => setAlertEvents(a => ({ ...a, highRisk: !a.highRisk }))} />
                  <ToggleRow i={1} title="Unapproved tool" sub="Create review request" on={alertEvents.unapproved} onToggle={() => setAlertEvents(a => ({ ...a, unapproved: !a.unapproved }))} />
                  <ToggleRow i={2} title="Training overdue" sub="Weekly reminder" on={alertEvents.overdue} onToggle={() => setAlertEvents(a => ({ ...a, overdue: !a.overdue }))} />
                  <ToggleRow i={3} title="Safe-use milestone" sub="Employee celebration" on={alertEvents.milestone} onToggle={() => setAlertEvents(a => ({ ...a, milestone: !a.milestone }))} />
                </Card>
                <Card title="Escalation service level">
                  <p className="text-gold-brand font-semibold text-[10px] mt-3">HIGH-RISK ACKNOWLEDGEMENT</p>
                  <p className="text-[#17213a] font-bold text-lg mt-1">Within 15 minutes</p>
                  <p className="text-[#667085] text-[11px] mt-2">Escalate to the Compliance lead after two missed attempts.</p>
                  <div className="h-px bg-[#e6dcbf] my-3.5" />
                  <p className="text-[#17213a] text-[12px]">22:00–07:00 · critical alerts bypass</p>
                  <p className="text-[#17213a] text-[12px] mt-1.5">Weekly summary · Monday 09:00</p>
                </Card>
              </div>

              <NavyNote kicker="ACTIONABLE ALERTS" title="Every message explains why it matters" body="Notifications include the affected policy, owner, deadline and recommended next action." />
            </>
          )}

          {section === 'roles' && (
            <>
              <Card title="Administrative roles">
                <p className="text-[#667085] text-[11px] mt-1">Permissions are granted by responsibility, not seniority.</p>
                <InfoRow i={0} title="Compliance admin" sub="Policies, alerts and approvals" right="4 members" />
                <InfoRow i={1} title="Department owner" sub="Team training and risk follow-up" right="12 members" />
                <InfoRow i={2} title="Independent auditor" sub="Read-only logs and reports" right="2 members" />
                <InfoRow i={3} title="HR reviewer" sub="Human review cases only" right="3 members" />
              </Card>

              <div className="grid grid-cols-2 gap-5 mt-5">
                <Card title="Access safeguards">
                  <ToggleRow i={0} title="Multi-factor authentication" sub="Required for every admin" on={access.mfa} onToggle={() => setAccess(a => ({ ...a, mfa: !a.mfa }))} />
                  <ToggleRow i={1} title="Quarterly access review" sub="Owner confirmation required" on={access.quarterly} onToggle={() => setAccess(a => ({ ...a, quarterly: !a.quarterly }))} />
                </Card>
                <Card title="Session controls">
                  <InfoRow i={0} title="Idle timeout" right="15 min" />
                  <p className="text-[#667085] text-[11px] mt-3">Re-authentication required for policy changes and exports.</p>
                </Card>
              </div>

              <NavyNote kicker="SEPARATION OF DUTIES" title="Sensitive actions require accountable ownership" body="Approval and audit responsibilities remain visible and can be independently reviewed." />
            </>
          )}

          {section === 'integrations' && (
            <>
              <Card>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[#17213a] font-bold text-base">Organisation directory</p>
                    <p className="text-[#667085] text-[11px] mt-1">Microsoft Entra ID · employees, departments and access groups</p>
                  </div>
                  <span className="bg-[#d7f0e4] text-[#088c66] font-semibold text-[11px] rounded-full px-4 py-1.5 shrink-0">● Sync healthy</span>
                </div>
                <div className="flex items-center justify-between mt-5">
                  <p className="text-[#667085] text-[11px]">Last sync · 17 Jul 2026, 10:31 · 1,248 records</p>
                  <button className="border-[1.5px] border-navy-header text-navy-header font-semibold text-[12px] h-10 px-6 rounded-full cursor-pointer hover:bg-chip">Sync now</button>
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-5 mt-5">
                {[
                  ['audit', 'Audit export', 'Encrypted S3 archive', 'Daily · 02:15 MYT'],
                  ['siem', 'SIEM webhook', 'Security event forwarding', 'Delivery 99.98%'],
                  ['learning', 'Learning system', 'Training completion sync', 'Every 30 minutes'],
                  ['identity', 'Identity alerts', 'Joiner, mover, leaver events', 'Near real-time'],
                ].map(([key, title, sub, meta2]) => (
                  <div key={key} className="bg-[#fffcef] border border-[#d8d0b4] rounded-[14px] p-4">
                    <p className="text-[#088c66] font-bold text-[10px]">CONNECTED</p>
                    <p className="text-[#17213a] font-bold text-[15px] mt-2">{title}</p>
                    <p className="text-[#667085] text-[11px] mt-1">{sub}</p>
                    <div className="h-px bg-[#e6dcbf] my-3" />
                    <div className="flex items-center justify-between">
                      <p className="text-[#17213a] font-semibold text-[13px]">{meta2}</p>
                      <Toggle on={integrations[key]} onClick={() => setIntegrations(s => ({ ...s, [key]: !s[key] }))} />
                    </div>
                  </div>
                ))}
              </div>

              <NavyNote kicker="OPERATIONAL RESILIENCE" title="Failures are visible and recoverable" body="Integration errors keep local protection active, alert the owner and retry without exposing sensitive content." />
            </>
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
