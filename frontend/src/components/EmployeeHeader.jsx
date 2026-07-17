// Global Employee Header — matches Figma "Global Employee Header"
// (brand ring, nav, logout button, notification bell with badge, JY profile)
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import LogoutConfirm from './LogoutConfirm.jsx'
import { useNotifications } from './notificationsStore.jsx'

const linkClass = ({ isActive }) =>
  `px-4 py-3 rounded-[10px] text-sm ${isActive ? 'text-gold font-semibold' : 'text-white font-medium hover:text-gold-brand'}`

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 2.5c-3.1 0-5.4 2.3-5.4 5.2v3.4l-1.4 2.7c-.3.5.1 1.2.7 1.2h12.2c.6 0 1-.7.7-1.2l-1.4-2.7V7.7c0-2.9-2.3-5.2-5.4-5.2Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 17.5a2 2 0 0 0 4 0" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12.5 3H5.8C4.8 3 4 3.8 4 4.8v10.4c0 1 .8 1.8 1.8 1.8h6.7" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 10h8m0 0-2.8-2.8M17 10l-2.8 2.8" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function EmployeeHeader() {
  const [logoutOpen, setLogoutOpen] = useState(false)
  const { unreadCount } = useNotifications()
  const navigate = useNavigate()

  return (
    <>
      <header className="bg-navy-header px-10 h-20 flex items-center justify-between relative z-40">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full border-2 border-gold-brand flex items-center justify-center text-gold-brand font-bold text-lg">A</div>
          <div>
            <p className="text-white font-bold text-[17px] leading-tight">AI PASSPORT</p>
            <p className="text-gold-brand text-[10px] font-semibold tracking-[1.2px]">SAFE AI FOR EVERY EMPLOYEE</p>
          </div>
        </div>
        <nav className="flex items-center">
          <NavLink to="/license" className={linkClass}>My License</NavLink>
          <NavLink to="/training" className={linkClass}>Training</NavLink>
          <NavLink to="/visas" className={linkClass}>My Visas</NavLink>
          <NavLink to="/gateway" className={linkClass}>Smart Gateway</NavLink>
        </nav>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLogoutOpen(true)}
            className="w-11 h-11 rounded-full bg-navy flex items-center justify-center cursor-pointer hover:bg-navy-mid"
            aria-label="Log out"
            title="Log out"
          >
            <LogoutIcon />
          </button>
          <button
            onClick={() => navigate('/notifications')}
            className="relative w-11 h-11 rounded-full bg-navy flex items-center justify-center cursor-pointer hover:bg-navy-mid"
            aria-label="Notifications"
            title="Notifications"
          >
            <BellIcon />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 right-0 w-4 h-4 rounded-full bg-red-alert text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          <div className="w-11 h-11 rounded-full bg-gold-brand flex items-center justify-center text-navy-header font-bold text-sm">JY</div>
        </div>
      </header>
      {logoutOpen && <LogoutConfirm role="employee" onClose={() => setLogoutOpen(false)} />}
    </>
  )
}
