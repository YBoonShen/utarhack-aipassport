// A7 — Department safety-points leaderboard (promised in the proposal;
// not in the Figma frames, placed on Training + License by team decision).
import { useEffect, useState } from 'react'
import { apiGet } from '../api.js'

export default function Leaderboard({ compact = false }) {
  const [rows, setRows] = useState([])

  useEffect(() => {
    apiGet('/leaderboard').then(setRows).catch(() => {})
  }, [])

  const shown = rows.slice(0, 5)
  const you = rows.find(r => r.you)
  const youOutsideTop5 = you && you.rank > 5

  return (
    <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[#8a7f60] text-xs font-bold tracking-[0.18em]">ENGINEERING LEADERBOARD</p>
        <span className="text-[10px] text-gray-400">safety points</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {shown.map(r => (
          <div
            key={r.name}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${r.you ? 'bg-gold/25 border border-gold-dark font-bold text-navy' : 'text-gray-700'}`}
          >
            <span className={`w-6 text-center font-bold ${r.rank <= 3 ? 'text-gold-dark' : 'text-gray-400'}`}>
              {r.rank}
            </span>
            <span className="flex-1 truncate">{r.name}{r.you && ' (you)'}</span>
            <span className="font-mono text-xs">{r.points.toLocaleString()}</span>
          </div>
        ))}
        {youOutsideTop5 && (
          <>
            <p className="text-center text-gray-400 text-xs">···</p>
            <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm bg-gold/25 border border-gold-dark font-bold text-navy">
              <span className="w-6 text-center">{you.rank}</span>
              <span className="flex-1 truncate">{you.name} (you)</span>
              <span className="font-mono text-xs">{you.points.toLocaleString()}</span>
            </div>
          </>
        )}
      </div>
      {!compact && (
        <p className="text-[11px] text-gray-500 mt-3">
          Earn points with clean prompts and training stamps — not by volume.
        </p>
      )}
    </div>
  )
}
