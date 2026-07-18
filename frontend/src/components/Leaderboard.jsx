// A7 — Department safety-points leaderboard (promised in proposal §5.1;
// not in the Figma frames, placed on Training + License by team decision).
// Written by Jia Yin; restyled to the Figma-exact design tokens.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

export default function Leaderboard({ compact = false }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    let alive = true
    const load = () => api.get('/leaderboard').then(r => alive && setRows(r)).catch(() => {})
    load()
    const t = setInterval(load, 5000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const shown = rows.slice(0, 5)
  const you = rows.find(r => r.you)
  const youOutsideTop5 = you && you.rank > 5

  return (
    <div className="bg-card border border-sand rounded-[16px] p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-gold font-semibold text-[11px] tracking-[1.1px]">ENGINEERING LEADERBOARD</p>
        <span className="text-slate2 text-[10px]">safety points</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {shown.map(r => (
          <div
            key={r.name}
            className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm ${r.you ? 'bg-[#fbf3d7] border border-gold font-semibold text-navy' : 'text-ink'}`}
          >
            <span className={`w-6 text-center font-bold ${r.rank <= 3 ? 'text-gold-dark' : 'text-slate2'}`}>{r.rank}</span>
            <span className="flex-1 truncate">{r.name}{r.you && ' (you)'}</span>
            <span className="font-mono text-xs">{r.points.toLocaleString()}</span>
          </div>
        ))}
        {youOutsideTop5 && (
          <>
            <p className="text-center text-slate2 text-xs">···</p>
            <div className="flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm bg-[#fbf3d7] border border-gold font-semibold text-navy">
              <span className="w-6 text-center">{you.rank}</span>
              <span className="flex-1 truncate">{you.name} (you)</span>
              <span className="font-mono text-xs">{you.points.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>
      {!compact && (
        <p className="text-[11px] text-slate2 mt-3">Earn points with clean prompts and training stamps — not by volume.</p>
      )}
    </div>
  )
}
