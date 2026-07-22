// Organisational AI Risk Score — the board-level "one number" for the demo.
// Live from /api/risk: a semicircular gauge (0–100, lower is better), the
// 7-day trend, ROI tiles (exposure value prevented, items intercepted), and a
// breakdown of what is driving the score. Resolving an alert or an employee
// override visibly moves it, which makes it a strong live-demo centrepiece.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'

// Band → colour. Lower score = safer = greener.
const bandColor = { Low: '#058f6b', Moderate: '#d5a71f', Elevated: '#e0771b', High: '#db2629' }
const toneColor = { low: '#058f6b', med: '#d5a71f', high: '#db2629' }

// A top semicircle drawn from the left (0) to the right (100); stroke-dasharray
// fills the fraction so we never have to fight SVG arc-flag maths.
function Gauge({ score, band }) {
  const r = 92, cx = 110, cy = 110
  const len = Math.PI * r
  const frac = Math.min(1, Math.max(0, score / 100))
  const color = bandColor[band] || '#d5a71f'
  const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`
  return (
    <svg viewBox="0 0 220 128" className="w-[230px] h-[134px]">
      <path d={path} fill="none" stroke="#e7e0c8" strokeWidth="16" strokeLinecap="round" />
      <path d={path} fill="none" stroke={color} strokeWidth="16" strokeLinecap="round"
        strokeDasharray={`${frac * len} ${len}`} style={{ transition: 'stroke-dasharray 700ms ease, stroke 400ms' }} />
      <text x={cx} y={96} textAnchor="middle" fontSize="46" fontWeight="800" fill="#0a204f">{score}</text>
      <text x={cx} y={118} textAnchor="middle" fontSize="12" fontWeight="700" fill={color} letterSpacing="1.5">{band.toUpperCase()}</text>
      <text x={cx - r} y={124} textAnchor="middle" fontSize="10" fill="#98a2b3">0</text>
      <text x={cx + r} y={124} textAnchor="middle" fontSize="10" fill="#98a2b3">100</text>
    </svg>
  )
}

// Minimal trend sparkline — the 6 points from the backend (5 history + today).
function Sparkline({ points, color }) {
  const w = 168, h = 44, pad = 4
  const min = Math.min(...points), max = Math.max(...points)
  const span = max - min || 1
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2)
    const y = pad + (1 - (p - min) / span) * (h - pad * 2)
    return [x, y]
  })
  const d = coords.map((c, i) => `${i ? 'L' : 'M'} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(' ')
  const [lx, ly] = coords[coords.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11">
      <path d={`${d} L ${w - pad} ${h} L ${pad} ${h} Z`} fill={color} opacity="0.08" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3.5" fill={color} />
    </svg>
  )
}

const rm = n => 'RM ' + (n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : n)

export default function RiskPanel() {
  const [risk, setRisk] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () => api.get('/risk').then(r => alive && setRisk(r)).catch(() => {})
    load()
    const t = setInterval(load, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (!risk) return null
  const color = bandColor[risk.band] || '#d5a71f'
  const improving = risk.delta <= 0
  const tiles = [
    ['Exposure value protected', rm(risk.metrics.valueProtected), 'estimated · today'],
    ['Sensitive items intercepted', risk.metrics.itemsIntercepted, 'before leaving the browser'],
    ['Incidents prevented', risk.metrics.incidentsPrevented, `${risk.metrics.confirmedLeaks} confirmed leaks`],
    ['Gateway overrides', risk.metrics.overrides, 'employee choice · logged'],
  ]

  return (
    <div className="bg-white border border-[#d8d0b4] rounded-[16px] p-5 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-navy-header font-semibold text-[15px]">Organisational AI Risk Score</p>
          <p className="text-[#667085] text-[11px] mt-0.5">One board-level number · computed live from alerts, overrides and coverage</p>
        </div>
        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ color, background: color + '18' }}>
          {risk.band.toUpperCase()} RISK
        </span>
      </div>

      <div className="grid grid-cols-[248px_1fr] gap-6 mt-4">
        {/* Gauge + trend */}
        <div className="flex flex-col items-center border-r border-[#eee6cf] pr-5">
          <Gauge score={risk.score} band={risk.band} />
          <p className="text-[11px] font-medium mt-1" style={{ color: improving ? '#058f6b' : '#db2629' }}>
            {improving ? '▼' : '▲'} {Math.abs(risk.delta)} vs yesterday · {improving ? 'improving' : 'rising'}
          </p>
          <div className="w-full mt-2">
            <p className="text-[#8a7d56] font-semibold text-[9px] tracking-[0.6px]">6-DAY TREND</p>
            <Sparkline points={risk.trend} color={color} />
          </div>
        </div>

        {/* ROI tiles + factor breakdown */}
        <div>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map(([label, value, sub]) => (
              <div key={label} className="bg-[#fcfaf3] border border-[#eee6cf] rounded-[11px] px-4 py-3">
                <p className="text-[#8a7d56] font-semibold text-[9px] tracking-[0.6px]">{label.toUpperCase()}</p>
                <p className="text-navy-header font-bold text-[22px] mt-1 leading-none">{value}</p>
                <p className="text-[#667085] text-[10px] mt-1">{sub}</p>
              </div>
            ))}
          </div>

          <p className="text-[#8a7d56] font-semibold text-[9px] tracking-[0.6px] mt-4">WHAT'S DRIVING THE SCORE</p>
          <div className="flex flex-col gap-1.5 mt-2">
            {risk.factors.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: toneColor[f.tone] }} />
                <p className="text-[#344054] text-[11px] font-medium w-[150px] shrink-0">{f.label}</p>
                <div className="flex-1 h-1.5 bg-[#f0ece0] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, f.points * 4)}%`, background: toneColor[f.tone] }} />
                </div>
                <p className="text-[#667085] text-[10px] w-[128px] shrink-0 text-right">{f.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
