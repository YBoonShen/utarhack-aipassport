import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import EmployeeHeader from './components/EmployeeHeader.jsx'
import AdminLayout from './components/AdminLayout.jsx'
import { NotificationsProvider } from './components/notificationsStore.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { useEffect } from 'react'
import { currentUser, restoreSession } from './lib/api.js'
import Auth from './pages/Auth.jsx'
import Home from './pages/Home.jsx'
import License from './pages/License.jsx'
import Gateway from './pages/Gateway.jsx'
import Training from './pages/Training.jsx'
import TrainingModules from './pages/TrainingModules.jsx'
import TrainingQuiz from './pages/TrainingQuiz.jsx'
import TrainingResults from './pages/TrainingResults.jsx'
import Visas from './pages/Visas.jsx'
import Notifications from './pages/Notifications.jsx'
import Activity from './pages/Activity.jsx'
import Transparency from './pages/Transparency.jsx'
import Extension from './pages/Extension.jsx'
import AdminOverview from './pages/AdminOverview.jsx'
import AdminTraining from './pages/admin/AdminTraining.jsx'
import AssignTraining from './pages/admin/AssignTraining.jsx'
import EditQuestions from './pages/admin/EditQuestions.jsx'
import RiskAlerts from './pages/admin/RiskAlerts.jsx'
import AuditLog from './pages/admin/AuditLog.jsx'
import AuditReport from './pages/admin/AuditReport.jsx'
import ToolApprovals from './pages/admin/ToolApprovals.jsx'
import Employees from './pages/admin/Employees.jsx'
import Settings from './pages/admin/Settings.jsx'

function RequireRole({ role, children }) {
  const user = currentUser()
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/license'} replace />
  return children
}

function HomeRedirect() {
  const user = currentUser()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'admin' ? '/admin' : '/home'} replace />
}

// `role` defaults to employee. Pass role={null} for pages the admin may also
// open directly (e.g. AI Tools, to see how a decision looks to the employee).
function EmployeePage({ children, role = 'employee' }) {
  return (
    <RequireRole role={role}>
      <div className="min-h-screen bg-cream">
        <EmployeeHeader />
        {children}
      </div>
    </RequireRole>
  )
}

export default function App() {
  // Keeps the shared server-side session in step with this tab, so the Chrome
  // extension follows the same employee the dashboard is signed in as.
  useEffect(() => { restoreSession() }, [])

  return (
    <ToastProvider>
    <NotificationsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<Auth />} />

          {/* Employee side */}
          <Route path="/home" element={<EmployeePage><Home /></EmployeePage>} />
          <Route path="/license" element={<EmployeePage><License /></EmployeePage>} />
          <Route path="/gateway" element={<EmployeePage><Gateway /></EmployeePage>} />
          <Route path="/training" element={<EmployeePage><Training /></EmployeePage>} />
          <Route path="/training/modules" element={<EmployeePage><TrainingModules /></EmployeePage>} />
          <Route path="/training/quiz/:moduleId" element={<EmployeePage><TrainingQuiz /></EmployeePage>} />
          <Route path="/training/results/:moduleId" element={<EmployeePage><TrainingResults /></EmployeePage>} />
          {/* AI Tools — the page formerly called "My Visas". /visas stays as a
              redirect: notifications written before the rename are persisted on
              disk with that link, and so are any bookmarks. */}
          <Route path="/tools" element={<EmployeePage role={null}><Visas /></EmployeePage>} />
          <Route path="/visas" element={<Navigate to="/tools" replace />} />
          <Route path="/notifications" element={<EmployeePage><Notifications /></EmployeePage>} />
          <Route path="/activity" element={<EmployeePage><Activity /></EmployeePage>} />

          {/* Public — no login required */}
          <Route path="/transparency" element={<Transparency />} />
          <Route path="/extension" element={<Extension />} />

          {/* Admin console — separate full-screen layout */}
          <Route path="/admin" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
            <Route index element={<AdminOverview />} />
            <Route path="training" element={<AdminTraining />} />
            <Route path="training/assign" element={<AssignTraining />} />
            {/* Training module → question list → edit a question → confirm */}
            <Route path="training/:moduleId/questions" element={<EditQuestions />} />
            <Route path="risk-alerts" element={<RiskAlerts />} />
            <Route path="audit-log" element={<AuditLog />} />
            <Route path="audit-report" element={<AuditReport />} />
            <Route path="tool-approvals" element={<ToolApprovals />} />
            <Route path="employees" element={<Employees />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
    </NotificationsProvider>
    </ToastProvider>
  )
}
