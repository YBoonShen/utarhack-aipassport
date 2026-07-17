import { useState } from 'react'

// AI Passport — starter shell (Team Soda)
// Colors follow the Figma design system: navy/gold/cream passport theme.
function App() {
  const [status, setStatus] = useState(null)

  async function checkBackend() {
    try {
      const res = await fetch('/api/health')
      const data = await res.json()
      setStatus(data.status === 'ok' ? 'Backend connected ✓' : 'Unexpected reply')
    } catch {
      setStatus('Backend not running — start it with: cd backend && npm run dev')
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="bg-navy px-8 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-gold flex items-center justify-center text-gold font-bold">✈</div>
        <div>
          <p className="text-white font-bold tracking-widest">AI PASSPORT</p>
          <p className="text-gold text-xs tracking-wider">SAFE AI FOR EVERY EMPLOYEE</p>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-3xl font-bold text-navy">Project setup complete 🎉</h1>
        <p className="text-gray-600 max-w-md text-center">
          This is the starter shell for Team Soda's AI Passport. Build the real screens
          from the Figma design: License, Training, Smart Gateway, Dashboard, Visas.
        </p>
        <button
          onClick={checkBackend}
          className="bg-gold hover:bg-gold-dark text-navy font-bold px-6 py-3 rounded-full"
        >
          Test backend connection
        </button>
        {status && <p className="text-navy font-medium">{status}</p>}
      </main>
    </div>
  )
}

export default App
