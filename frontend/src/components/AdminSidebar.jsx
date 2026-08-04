// Admin sidebar — matches Figma "Admin sidebar" (brand, navigation with badges, admin identity)
// Badges are live: they track open alerts and pending approvals (Jia Yin's A4/A5).
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import LogoutConfirm from './LogoutConfirm.jsx'
import { api } from '../lib/api.js'

export default function AdminSidebar() {
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [stats, setStats] = useState(null)
  const location = useLocation()

  useEffect(() => {
    let alive = true
    const load = () => api.get('/stats').then(s => alive && setStats(s)).catch(() => {})
    load()
    const t = setInterval(load, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const nav = [
    { to: '/admin', label: 'Overview', end: true },
    { to: '/admin/training', label: 'Training', match: ['/admin/training/assign'] },
    { to: '/admin/risk-alerts', label: 'Risk Alerts', badge: stats?.openAlerts, badgeColor: 'bg-[#d92d20] text-white' },
    { to: '/admin/audit-log', label: 'Audit Log', match: ['/admin/audit-report'] },
    { to: '/admin/tool-approvals', label: 'Tool Approvals', badge: stats?.pendingApprovals, badgeColor: 'bg-gold-brand text-navy-header' },
    { to: '/admin/employees', label: 'Employees' },
    { to: '/admin/settings', label: 'Settings' },
  ]

  return (
    // The sidebar owns its height instead of inheriting the row's.
    //
    // It is a flex child of AdminLayout's `lg:flex-row min-h-screen` row, so it
    // used to stretch to the row's height — and the row is as tall as its
    // tallest child, which is <main>. Every admin page has a different content
    // height, so the sidebar silently grew and shrank from page to page, and the
    // `flex-1` spacer below took the difference: the admin card and Log out
    // landed at a different place on Settings than on Overview.
    //
    // `lg:h-screen` makes the cross size definite (which also opts out of the
    // stretch), `lg:self-start` keeps it there, and `lg:sticky lg:top-0` pins it
    // to the viewport while <main> scrolls past. The bottom of the sidebar is
    // now the bottom of the viewport on every page, at every window size — no
    // fixed offsets, and the element stays in normal flow so the row layout is
    // untouched. Below lg the sidebar is a stacked strip and none of this
    // applies, hence every class is lg-only.
    <aside className="w-full lg:w-60 bg-navy-header shrink-0 flex flex-col p-4 lg:p-5 lg:sticky lg:top-0 lg:h-screen lg:self-start">
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-11 h-11 rounded-full border-2 border-gold-brand flex items-center justify-center text-gold-brand font-bold text-[17px]">A</div>
        <div>
          <p className="text-white font-bold text-sm leading-tight">AI PASSPORT</p>
          <p className="text-gold-brand text-[9px] font-semibold tracking-[0.9px]">ADMIN CONSOLE</p>
        </div>
      </div>

      {/* lg+: the original vertical rail. Below lg: one scrollable row.
          On a short window the rail is the one part that gives: `lg:min-h-0`
          lets it shrink below its content (flex items refuse to by default) and
          `lg:overflow-y-auto` scrolls the remainder, so the nav never pushes the
          admin card off the bottom. */}
      <nav className="mt-4 lg:mt-7 flex flex-row lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-hidden lg:min-h-0 lg:overflow-y-auto">
        {nav.map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `h-11 px-3.5 rounded-[11px] text-[13px] flex justify-between items-center gap-2 shrink-0 lg:shrink whitespace-nowrap lg:whitespace-normal ${
                isActive || n.match?.includes(location.pathname) ? 'bg-gold-brand text-navy-header font-semibold' : 'text-[#d0d5dd] font-medium hover:bg-white/5'
              }`
            }
          >
            {n.label}
            {n.badge > 0 && (
              <span className={`text-[11px] font-bold rounded-full w-6 h-6 flex items-center justify-center ${n.badgeColor}`}>{n.badge}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* The flexible gap. flex-basis is 0, so it only ever consumes space that
          is actually spare — when the window is too short to have any, it
          collapses instead of squeezing the items around it. */}
      <div className="hidden lg:block flex-1" />
      {/* shrink-0 on both: whatever the window height, the identity block keeps
          its size and the nav above does the giving. */}
      <button onClick={() => setLogoutOpen(true)} className="text-[#cbd5e1] text-[11px] px-1.5 mt-3 lg:mt-0 mb-0 lg:mb-3 text-left cursor-pointer hover:text-white shrink-0">← Log out</button>
      {/* Identity card is desktop chrome — hidden on phones to keep the strip short. */}
      <div className="bg-[#173976] rounded-[12px] p-3 hidden lg:flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-full bg-gold-brand flex items-center justify-center text-navy-header font-bold text-[11px]">AD</div>
        <div>
          <p className="text-white font-semibold text-[13px]">Admin</p>
          <p className="text-[#cbd5e1] text-[10px]">Compliance role</p>
        </div>
      </div>
      {logoutOpen && <LogoutConfirm role="admin" onClose={() => setLogoutOpen(false)} />}
    </aside>
  )
}
