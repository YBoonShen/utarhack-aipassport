// Admin sidebar — matches Figma "Admin sidebar" (brand, navigation with badges, admin identity)
import { NavLink, useNavigate } from 'react-router-dom'
import { logout } from '../lib/api.js'

const nav = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/departments', label: 'Departments' },
  { to: '/admin/risk-alerts', label: 'Risk Alerts', badge: 3, badgeColor: 'bg-[#d92d20] text-white' },
  { to: '/admin/audit-log', label: 'Audit Log' },
  { to: '/admin/tool-approvals', label: 'Tool Approvals', badge: 2, badgeColor: 'bg-gold-brand text-navy-header' },
  { to: '/admin/employees', label: 'Employees' },
  { to: '/admin/settings', label: 'Settings' },
]

export default function AdminSidebar() {
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="w-60 bg-navy-header shrink-0 flex flex-col p-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full border-2 border-gold-brand flex items-center justify-center text-gold-brand font-bold text-[17px]">A</div>
        <div>
          <p className="text-white font-bold text-sm leading-tight">AI PASSPORT</p>
          <p className="text-gold-brand text-[9px] font-semibold tracking-[0.9px]">ADMIN CONSOLE</p>
        </div>
      </div>

      <nav className="mt-7 flex flex-col gap-1.5">
        {nav.map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `h-11 px-3.5 rounded-[11px] text-[13px] flex justify-between items-center ${
                isActive ? 'bg-gold-brand text-navy-header font-semibold' : 'text-[#d0d5dd] font-medium hover:bg-white/5'
              }`
            }
          >
            {n.label}
            {n.badge != null && (
              <span className={`text-[11px] font-bold rounded-full w-6 h-6 flex items-center justify-center ${n.badgeColor}`}>{n.badge}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />
      <button onClick={handleLogout} className="text-[#cbd5e1] text-[11px] px-1.5 mb-3 text-left cursor-pointer hover:text-white">← Log out</button>
      <div className="bg-[#173976] rounded-[12px] p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gold-brand flex items-center justify-center text-navy-header font-bold text-[11px]">AD</div>
        <div>
          <p className="text-white font-semibold text-[13px]">Admin</p>
          <p className="text-[#cbd5e1] text-[10px]">Compliance role</p>
        </div>
      </div>
    </aside>
  )
}
