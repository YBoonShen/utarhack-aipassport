import { Outlet } from 'react-router-dom'
import AdminSidebar from './AdminSidebar.jsx'

export default function AdminLayout() {
  return (
    <div className="flex min-h-[calc(100vh-80px)]">
      <AdminSidebar />
      <main className="flex-1 p-8 min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
