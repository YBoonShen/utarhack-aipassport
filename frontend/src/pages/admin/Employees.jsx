// 16 Admin · Employees — matches Figma frame "16 Admin • Employees"
// Live: Tan Jia Yin's row (E-217) reads /api/profile so her points/level match
// what she earns in the Gateway and Training; other rows are demo data.
import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../../api.js'
import { useToast, DEMO_NOTE } from '../../components/Toast.jsx'

const staticEmployees = [
  { id: 'F-102', name: 'Ahmad Rizal', dept: 'Finance', level: 1, points: 420, status: 'Flagged' },
  { id: 'S-044', name: 'Wei Ling', dept: 'Sales', level: 2, points: 980, status: 'Active' },
  { id: 'H-011', name: 'Priya Kumar', dept: 'HR', level: 1, points: 610, status: 'Active' },
  { id: 'M-019', name: 'Daniel Wong', dept: 'Marketing', level: 1, points: 210, status: 'Training overdue' },
]
const statusChip = {
  Active: 'bg-emerald-100 text-emerald-800',
  Flagged: 'bg-red-100 text-red-800',
  'Training overdue': 'bg-amber-100 text-amber-800',
}

export default function Employees() {
  const [profile, setProfile] = useState(null)
  const [search, setSearch] = useState('')
  const toast = useToast()

  useEffect(() => {
    apiGet('/profile').then(setProfile).catch(() => {})
  }, [])

  const employees = useMemo(() => {
    const me = {
      id: 'E-217', name: profile?.name ?? 'Tan Jia Yin', dept: 'Engineering',
      level: profile?.level ?? 2, points: profile?.points ?? 1240,
      status: (profile?.streakDays ?? 21) > 0 ? 'Active' : 'Flagged', live: true,
    }
    const q = search.toLowerCase()
    return [me, ...staticEmployees].filter(e =>
      !q || [e.id, e.name, e.dept].join(' ').toLowerCase().includes(q)
    )
  }, [profile, search])

  return (
    <>
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-navy">Employees</h1>
          <p className="text-gray-500 text-sm">351 employees · 33 flagged this month · 78% licensed at Level 2+</p>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search employees…"
          className="bg-card border-2 border-[#d8cfae] rounded-lg px-4 py-2 text-sm outline-none"
        />
      </div>

      <div className="bg-card border-2 border-[#d8cfae] rounded-2xl overflow-hidden mt-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy text-gold text-[11px] tracking-wider">
              {['EMPLOYEE ID', 'NAME', 'DEPARTMENT', 'LICENSE LEVEL', 'SAFETY POINTS', 'STATUS', ''].map(h => (
                <th key={h} className="text-left px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map(e => (
              <tr key={e.id} className="border-b border-[#eee5cf] last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{e.id}</td>
                <td className="px-4 font-bold text-navy">
                  {e.name}
                  {e.live && <span className="ml-2 text-[10px] text-emerald-700 font-normal">● live</span>}
                </td>
                <td className="px-4">{e.dept}</td>
                <td className="px-4">Level {e.level}</td>
                <td className="px-4">{e.points.toLocaleString()}</td>
                <td className="px-4"><span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${statusChip[e.status]}`}>{e.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => toast(DEMO_NOTE)} className="text-navy text-xs font-medium">View →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
