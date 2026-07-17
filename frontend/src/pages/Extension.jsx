// Public · Browser Extension Sample view — matches Figma "Public • Browser
// Extension Sample view" + "Overlay • AI Passport Extension • Signed in".
// Shows how the Chrome extension sits inside a real AI tool page; the side
// panel reads live protection stats and the active gateway mode.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'

export default function Extension() {
  const [panelOpen, setPanelOpen] = useState(false)
  const [profile, setProfile] = useState({ promptsProtected: 47, itemsMasked: 12, level: 2, levelName: 'Navigator', name: 'Tan Jia Yin' })
  const [mode, setMode] = useState('Mask and continue')

  useEffect(() => {
    api.get('/profile').then(setProfile).catch(() => {})
    api.get('/settings').then(s => setMode(s.mode)).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-[#f3f5f9]">
      {/* Browser chrome */}
      <div className="bg-white border-b border-[#d5dae3] h-[72px] flex items-center px-4 gap-3">
        <div className="flex gap-2 shrink-0">
          <span className="w-3 h-3 rounded-full bg-[#f26d60]" />
          <span className="w-3 h-3 rounded-full bg-[#f5bd4f]" />
          <span className="w-3 h-3 rounded-full bg-[#61c554]" />
        </div>
        <div className="bg-[#f7f9fc] rounded-[12px] h-[52px] w-[224px] flex items-center px-4 gap-2.5 shrink-0">
          <span className="text-[#e0b31e] font-bold text-[10px] border border-[#e0b31e] rounded-full w-6 h-6 flex items-center justify-center shrink-0">AI</span>
          <p className="text-[#111d35] font-medium text-[13px] flex-1">AI Workspace</p>
          <span className="text-[#5c6a82] text-base">×</span>
        </div>
        <div className="flex gap-2 text-[#5c6a82] text-xl shrink-0 px-1">
          <span>‹</span><span>›</span><span className="text-lg">↻</span>
        </div>
        <div className="bg-[#f7f9fc] rounded-full h-10 flex-1 max-w-[520px] flex items-center px-4 gap-2.5">
          <span className="text-[#05946e] font-bold text-[10px]">✓</span>
          <p className="text-[#5c6a82] text-[13px] flex-1">ai-workspace.example.com/chat</p>
          <span className="text-[#5c6a82] text-lg">☆</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setPanelOpen(o => !o)}
          className="bg-[#fbf7e9] border border-[#d1bf7a] rounded-full h-10 px-2 flex items-center gap-2 cursor-pointer shadow-[0px_3px_4px_rgba(5,18,46,0.1)] shrink-0"
        >
          <span className="w-7 h-7 rounded-full border-2 border-[#e0b31e] text-[#e0b31e] font-bold text-xs flex items-center justify-center">A</span>
          <span className="text-[#0c2556] font-semibold text-sm">AI Passport</span>
          <span className="w-2.5 h-2.5 rounded-full bg-[#05946e]" />
          <span className="text-[#05946e] font-medium text-xs pr-1">Active</span>
        </button>
      </div>

      <div className="flex relative" style={{ height: 'calc(100vh - 72px)' }}>
        {/* AI Workspace sidebar */}
        <aside className="bg-[#f2f4f8] w-[248px] shrink-0 px-5 py-7 hidden md:flex flex-col">
          <p className="text-[#0c2556] font-semibold text-lg px-2">AI Workspace</p>
          <button className="bg-white border border-[#d5dae3] rounded-[10px] h-11 mt-4 px-3.5 text-left text-[#111d35] text-sm font-medium cursor-pointer">
            +&nbsp;&nbsp;New conversation
          </button>
          <p className="text-[#5c6a82] font-semibold text-[11px] px-2 mt-6">RECENT</p>
          <div className="flex flex-col gap-2 mt-2">
            <div className="bg-[#eaf0ff] rounded-[8px] h-11 flex items-center px-3 text-[#0c2556] text-[13px] font-medium">Customer follow-up</div>
            <div className="rounded-[8px] h-11 flex items-center px-3 text-[#5c6a82] text-[13px]">Project summary</div>
            <div className="rounded-[8px] h-11 flex items-center px-3 text-[#5c6a82] text-[13px]">Meeting notes</div>
            <div className="rounded-[8px] h-11 flex items-center px-3 text-[#5c6a82] text-[13px]">Policy outline</div>
          </div>
          <div className="flex-1" />
          <div className="bg-white border border-[#d5dae3] rounded-[12px] p-3 flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-[#eaf0ff] text-[#0c2556] font-bold text-[11px] flex items-center justify-center">JY</span>
            <div>
              <p className="text-[#111d35] font-semibold text-[13px]">Tan Jia Yin</p>
              <p className="text-[#5c6a82] text-[11px]">Engineering</p>
            </div>
          </div>
        </aside>

        {/* AI Workspace main */}
        <div className="flex-1 bg-white flex flex-col min-w-0">
          <div className="border-b border-[#d5dae3] h-16 flex items-center justify-between px-8 shrink-0">
            <p className="text-[#111d35] font-semibold text-[17px]">Customer follow-up</p>
            <div className="bg-[#f7f9fc] rounded-full h-9 px-5 flex items-center gap-2.5">
              <p className="text-[#0c2556] font-medium text-xs">Approved AI</p>
              <span className="w-2 h-2 rounded-full bg-[#05946e]" />
            </div>
          </div>

          <div className="flex-1 bg-[#fdfdfe] overflow-y-auto px-10 lg:px-24 py-7 relative">
            {/* Extension helper callout */}
            <div className="absolute right-8 top-5 bg-[#fbf7e9] border border-[#d1bf7a] rounded-[12px] px-4 py-2.5 max-w-[334px] hidden xl:block">
              <p className="text-[#0c2556] font-medium text-xs">Click AI Passport above to view protection status and shortcuts.</p>
            </div>

            <div className="bg-[#f7f9fc] rounded-[16px] p-5 max-w-[760px] flex gap-4 mt-8">
              <span className="w-8 h-8 rounded-full border-2 border-[#e0b31e] text-[#e0b31e] font-bold text-[10px] flex items-center justify-center shrink-0">AI</span>
              <div>
                <p className="text-[#111d35] font-medium text-[15px]">How can I help with your customer follow-up today?</p>
                <p className="text-[#5c6a82] text-[13px] mt-1.5">I can draft a concise reminder, summary, or next-step plan.</p>
              </div>
            </div>

            <div className="bg-[#eaf0ff] border border-[#94adff] rounded-[16px] p-5 max-w-[604px] ml-auto mt-6">
              <p className="text-[#111d35] text-[15px]">
                Draft a polite payment reminder for <span className="bg-[#e6faf2] border border-[#05946e] text-[#047857] font-semibold text-[13px] rounded-[6px] px-1.5">[MASKED-NAME]</span> about the RM 4,500 invoice due last month.
              </p>
              <div className="inline-flex items-center gap-2 bg-[#e6faf2] rounded-full px-3.5 py-1.5 mt-4">
                <span className="w-2 h-2 rounded-full bg-[#05946e]" />
                <p className="text-[#05946e] font-semibold text-[11px]">2 sensitive items masked</p>
              </div>
            </div>

            <div className="bg-[#f7f9fc] rounded-[16px] p-5 max-w-[760px] flex gap-4 mt-6">
              <span className="w-8 h-8 rounded-full border-2 border-[#e0b31e] text-[#e0b31e] font-bold text-[10px] flex items-center justify-center shrink-0">AI</span>
              <div>
                <p className="text-[#111d35] font-semibold text-sm">Draft ready</p>
                <p className="text-[#5c6a82] text-sm mt-2.5">Subject: Friendly reminder — outstanding invoice</p>
                <p className="text-[#5c6a82] text-sm mt-2.5">
                  Hello, I hope you’re well. This is a friendly reminder that the RM 4,500 invoice was due last month…
                </p>
              </div>
            </div>
          </div>

          <div className="px-10 lg:px-24 pb-4 shrink-0">
            <div className="bg-white border border-[#d5dae3] rounded-[18px] h-16 flex items-center pl-6 pr-2.5">
              <p className="text-[#5c6a82] text-sm flex-1">Ask the approved AI workspace…</p>
              <button className="bg-[#0c2556] text-white font-bold text-lg rounded-[12px] w-[52px] h-11 cursor-pointer">↑</button>
            </div>
            <p className="text-[#5c6a82] text-[11px] mt-2">AI Passport checks prompts before they leave this browser.</p>
          </div>
        </div>

        {/* Extension side panel */}
        {panelOpen && (
          <div className="absolute right-0 top-0 bottom-0 w-[420px] max-w-full bg-white border-l border-[#d1d6e0] shadow-[-16px_8px_32px_rgba(5,18,46,0.18)] overflow-y-auto z-40">
            <div className="border-b border-[#d5dae3] h-[72px] flex items-center px-5 gap-3">
              <span className="w-9 h-9 rounded-full border-2 border-[#e0b31e] text-[#e0b31e] font-bold text-[13px] flex items-center justify-center shrink-0">A</span>
              <div className="flex-1">
                <p className="text-[#0c2556] font-bold text-[17px] leading-tight">AI Passport</p>
                <p className="text-[#e0b31e] font-semibold text-[10px]">SMART GATEWAY</p>
              </div>
              <button onClick={() => setPanelOpen(false)} className="bg-[#f7f9fc] rounded-[12px] w-11 h-11 text-[#0c2556] text-[19px] cursor-pointer" aria-label="Close">×</button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div className="bg-[#f7f9fc] border border-[#d5dae3] rounded-[14px] p-3 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-[#eaf0ff] text-[#0c2556] font-bold text-[11px] flex items-center justify-center shrink-0">JY</span>
                <div className="flex-1">
                  <p className="text-[#111d35] font-semibold text-sm">{profile.name}</p>
                  <p className="text-[#5c6a82] text-[11px]">Level {profile.level} · {profile.levelName}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 bg-[#e6faf2] rounded-full px-3 py-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#05946e]" />
                  <span className="text-[#05946e] font-semibold text-[11px]">Signed in</span>
                </span>
              </div>

              <div className="bg-[#0c2556] rounded-[16px] p-5">
                <div className="flex gap-4">
                  <span className="w-10 h-10 rounded-full bg-[#13306e] text-[#05946e] font-bold text-base flex items-center justify-center shrink-0">✓</span>
                  <div>
                    <p className="text-[#e0b31e] font-semibold text-[10px]">PROTECTION ACTIVE</p>
                    <p className="text-white font-semibold text-[17px] mt-1">Your prompts are protected</p>
                  </div>
                </div>
                <p className="text-[#ccd6eb] text-xs mt-3">Sensitive data is checked before a prompt leaves this browser.</p>
                <div className="flex justify-end mt-3">
                  <span className="inline-flex items-center gap-1.5 bg-[#13306e] rounded-full px-2.5 py-1">
                    <span className="w-2 h-2 rounded-full bg-[#05946e]" />
                    <span className="text-white font-semibold text-[10px]">{mode}</span>
                  </span>
                </div>
              </div>

              <div className="bg-white border border-[#d5dae3] rounded-[14px] p-4 grid grid-cols-2">
                <div>
                  <p className="text-[#0c2556] font-bold text-2xl">{profile.promptsProtected}</p>
                  <p className="text-[#5c6a82] text-[10px] mt-1">protected this month</p>
                </div>
                <div className="border-l border-[#d5dae3] pl-6">
                  <p className="text-[#0c2556] font-bold text-2xl">{profile.itemsMasked}</p>
                  <p className="text-[#5c6a82] text-[10px] mt-1">items masked</p>
                </div>
              </div>

              <p className="text-[#5c6a82] font-semibold text-[10px]">QUICK ACTIONS</p>
              <Link to="/license" className="bg-[#fbf7e9] border border-[#d1bf7a] rounded-[14px] p-4 flex items-center gap-4">
                <span className="w-10 h-10 rounded-full bg-white border border-[#d1bf7a] text-[#e0b31e] font-bold text-[15px] flex items-center justify-center shrink-0">↗</span>
                <div className="flex-1">
                  <p className="text-[#0c2556] font-semibold text-sm">Open employee dashboard</p>
                  <p className="text-[#5c6a82] text-[11px] mt-0.5">View your license, training and visas.</p>
                </div>
                <span className="text-[#0c2556] text-[22px]">›</span>
              </Link>
              <Link to="/transparency" className="bg-[#eaf0ff] border border-[#94adff] rounded-[14px] p-4 flex gap-4">
                <span className="w-10 h-10 rounded-full bg-white border border-[#94adff] text-[#2f5af6] font-bold text-base flex items-center justify-center shrink-0">?</span>
                <div>
                  <p className="text-[#0c2556] font-semibold text-sm">Check decision transparency</p>
                  <p className="text-[#5c6a82] text-[11px] mt-1">Received an AI-assisted decision? Use the reference from your letter or email to see what happened.</p>
                  <p className="text-[#2f5af6] font-semibold text-[11px] mt-2">Open transparency checker&nbsp;&nbsp;→</p>
                </div>
              </Link>

              <p className="text-[#5c6a82] font-semibold text-[10px]">RECENT ACTIVITY</p>
              <div className="bg-[#f7f9fc] border border-[#d5dae3] rounded-[14px] p-4 flex gap-3">
                <span className="w-8 h-8 rounded-full bg-[#e6faf2] text-[#05946e] font-bold text-xs flex items-center justify-center shrink-0">✓</span>
                <div>
                  <p className="text-[#111d35] font-semibold text-[13px]">2 items masked</p>
                  <p className="text-[#5c6a82] text-[11px] mt-1">A name and IC number were protected before your prompt was sent.</p>
                  <p className="text-[#05946e] font-medium text-[10px] mt-1.5">Raw data are not exposed to anyone.</p>
                </div>
              </div>

              <div className="bg-[#e6faf2] rounded-[14px] p-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-white text-[#05946e] font-bold text-xs flex items-center justify-center shrink-0">✓</span>
                <div>
                  <p className="text-[#111d35] font-semibold text-xs">Privacy by design</p>
                  <p className="text-[#5c6a82] text-[10px] mt-0.5">Only masked prompts are logged.</p>
                </div>
              </div>

              <div className="flex justify-between">
                <p className="text-[#5c6a82] text-[10px]">AI Passport Extension · v1.0</p>
                <p className="text-[#5c6a82] text-[10px]">Managed by ABCD Sdn. Bhd.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
