import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import EmployeeHeader from './components/EmployeeHeader.jsx'
import License from './pages/License.jsx'
import Gateway from './pages/Gateway.jsx'
import AdminOverview from './pages/AdminOverview.jsx'

// Placeholder for screens not yet built — replace one by one from the Figma design
function ComingSoon({ name }) {
  return (
    <div className="max-w-xl mx-auto text-center py-24">
      <h1 className="text-2xl font-bold text-navy">{name}</h1>
      <p className="text-gray-500 mt-2">This screen is next — build it from the Figma design (Soda file).</p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-cream">
        <EmployeeHeader />
        <Routes>
          <Route path="/" element={<Navigate to="/license" replace />} />
          <Route path="/license" element={<License />} />
          <Route path="/gateway" element={<Gateway />} />
          <Route path="/admin" element={<AdminOverview />} />
          <Route path="/training" element={<ComingSoon name="Training Dashboard" />} />
          <Route path="/visas" element={<ComingSoon name="My Visas" />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
