import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { apiGet } from '../api.js'

export default function AdminSidebar() {
  const [stats, setStats] = useState(null)
  const location = useLocation()

  // Refetch on every admin navigation so badges track resolves/approvals live (A4/A5).
  useEffect(() => {
    apiGet('/stats').then(setStats).catch(() => {})
  }, [location])

  const nav = [
    { to: '/admin', label: 'Overview', end: true },
    { to: '/admin/departments', label: 'Departments' },
    { to: '/admin/risk-alerts', label: 'Risk Alerts', badge: stats?.activeAlerts, badgeColor: 'bg-red-600 text-white' },
    { to: '/admin/audit-log', label: 'Audit Log' },
    { to: '/admin/tool-approvals', label: 'Tool Approvals', badge: stats?.pendingApprovals, badgeColor: 'bg-gold text-navy' },
    { to: '/admin/employees', label: 'Employees' },
    { to: '/admin/settings', label: 'Settings' },
  ]

  return (
    <aside className="w-60 bg-navy p-4 shrink-0">
      <p className="text-gold text-[10px] font-bold tracking-[0.15em] px-3 mb-3">ADMIN CONSOLE</p>
      {nav.map(n => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          className={({ isActive }) =>
            `px-4 py-2.5 rounded-lg text-sm mb-1 flex justify-between items-center ${isActive ? 'bg-gold text-navy font-bold' : 'text-slate-300 hover:bg-white/5'}`
          }
        >
          {n.label}
          {n.badge > 0 && (
            <span className={`text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center ${n.badgeColor}`}>{n.badge}</span>
          )}
        </NavLink>
      ))}
    </aside>
  )
}
