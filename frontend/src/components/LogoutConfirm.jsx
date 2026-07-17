// Logout confirmation — matches Figma "Overlay • Confirm logout • Employee / Admin"
import { useNavigate } from 'react-router-dom'
import { logout } from '../lib/api.js'

export default function LogoutConfirm({ role, onClose }) {
  const navigate = useNavigate()
  const isAdmin = role === 'admin'

  function confirm() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="fixed inset-0 bg-navy-dark/50 flex items-center justify-center p-6 z-[60]" onClick={onClose}>
      <div
        className="bg-white border-[1.5px] border-[#c7b887] rounded-[20px] shadow-[0px_18px_24px_rgba(3,10,31,0.22)] w-full max-w-[517px] p-7"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-5">
          <div className="w-[52px] h-[52px] rounded-full bg-[#fff5de] border-2 border-[#e3b214] flex items-center justify-center shrink-0">
            <span className="text-[#d97706] font-bold text-2xl">!</span>
          </div>
          <div className="flex-1">
            <p className="text-[#e3b214] font-bold text-xs">{isAdmin ? 'ADMINISTRATOR SESSION' : 'EMPLOYEE SESSION'}</p>
            <p className="text-[#0a1733] font-bold text-2xl mt-1.5">Log out of AI Passport?</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full border border-sand text-navy text-xl leading-none cursor-pointer hover:bg-chip shrink-0" aria-label="Close">×</button>
        </div>

        <p className="text-[#5c6b87] text-sm mt-5">
          {isAdmin
            ? 'You will leave the Admin Console and return to the sign-in screen. Unsaved settings will not be applied.'
            : 'You will return to the sign-in screen. Any unsaved form entries on this page will be cleared.'}
        </p>

        <div className="bg-[#f0f5ff] rounded-[12px] px-4 py-4 mt-4">
          <p className="text-[#0a1733] text-xs text-center">Your saved progress and audit history will remain available.</p>
        </div>

        <div className="flex gap-4 mt-6">
          <button onClick={onClose} className="border-[1.5px] border-[#091e47] text-[#091e47] font-semibold text-sm flex-1 h-[52px] rounded-full cursor-pointer hover:bg-chip">
            Cancel
          </button>
          <button onClick={confirm} className="bg-[#c71f1f] hover:bg-[#a91a1a] text-white font-semibold text-sm flex-1 h-[52px] rounded-full cursor-pointer">
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
