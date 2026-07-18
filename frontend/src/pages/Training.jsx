// 04 Employee · Training Dashboard — matches Figma frame "04 Employee • Training Dashboard"
// Live: miles = safety points (/api/profile); quiz results recorded server-side; leaderboard (A7).
import { useEffect, useState } from 'react'
import { apiGet } from '../api.js'
import TrainingQuiz, { QUESTIONS } from '../components/TrainingQuiz.jsx'
import Leaderboard from '../components/Leaderboard.jsx'

const upcoming = [
  { title: 'Safe AI Tool Selection', desc: 'Choose approved tools and match each task to the right data class.', meta: '3 questions · 4 miles' },
  { title: 'Human Review in AI-Assisted Decisions', desc: 'Know when a person must review, explain and contest an AI-generated outcome.', meta: '10 mins · 4 miles' },
]

export default function Training() {
  const [quizOpen, setQuizOpen] = useState(false)
  const [profile, setProfile] = useState(null)
  const [quiz, setQuiz] = useState(null)

  function refresh() {
    apiGet('/profile').then(setProfile).catch(() => {})
    apiGet('/quiz').then(setQuiz).catch(() => {})
  }
  useEffect(refresh, [])

  const points = profile?.points ?? 1240
  const target = profile?.target ?? 2000
  const done = quiz && quiz.attempted >= QUESTIONS.length
  const score = done ? `${quiz.correct}/${QUESTIONS.length} · ${Math.round((quiz.correct / QUESTIONS.length) * 100)}%` : null

  return (
    <div className="max-w-[1360px] mx-auto px-10 py-8">
      <h1 className="text-3xl font-bold text-navy">Training</h1>
      <p className="text-gray-500 text-sm mt-1 mb-6">Build your AI safety habits with short, role-relevant modules.</p>

      <div className="flex gap-4 flex-wrap">
        <div className="px-5 py-3 rounded-xl border-2 text-sm font-bold bg-gold border-gold-dark text-navy">
          {done ? 'Lesson complete' : '1 in progress'}
        </div>
        <div className="px-5 py-3 rounded-xl border-2 text-sm font-bold bg-card border-[#d8cfae] text-navy">3 stamps earned</div>
        <div className="px-5 py-3 rounded-xl border-2 text-sm font-bold bg-card border-[#d8cfae] text-navy">{points.toLocaleString()} miles</div>
        <div className="px-5 py-3 rounded-xl border-2 text-sm font-bold bg-card border-[#d8cfae] text-navy">
          {Math.max(0, target - points).toLocaleString()} miles to go
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mt-8 items-start">
        <div>
          <h2 className="text-xl font-bold text-navy mb-3">Current training</h2>
          <div className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6 flex gap-6 items-stretch">
            <div className="flex-1">
              <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full ${done ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {done ? 'COMPLETED' : 'IN PROGRESS'}
              </span>
              <p className="text-navy font-bold text-lg mt-3">Spotting Personal Data in Prompts</p>
              <p className="text-gray-500 text-sm mt-1">
                {done
                  ? `First-attempt score: ${score} — wrong answers are marked in your results.`
                  : 'Learn to identify, classify and protect personal details before they reach an AI tool.'}
              </p>
              <div className="mt-4 h-2 rounded-full bg-[#e9e2cf] max-w-xs">
                <div className="h-2 rounded-full bg-emerald-600 transition-all" style={{ width: `${((quiz?.attempted ?? 0) / QUESTIONS.length) * 100}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1.5">{quiz?.attempted ?? 0} of {QUESTIONS.length} answered · 5-minute lesson</p>
            </div>
            <div className="bg-navy rounded-xl p-6 w-64 shrink-0 flex flex-col justify-between text-white">
              <div>
                <p className="text-3xl font-bold">{done ? score : '67%'}</p>
                <p className="text-gold text-xs mt-1">{done ? 'first-attempt score' : 'Level 2 training path complete'}</p>
                <p className="text-slate-300 text-xs mt-3">
                  {done ? `+${quiz.pointsEarned} points earned` : '3 minutes completed · 2 mins left'}
                </p>
              </div>
              <button
                onClick={() => !done && setQuizOpen(true)}
                className="mt-4 bg-gold hover:bg-gold-dark text-navy font-bold px-5 py-2.5 rounded-full text-sm disabled:opacity-60"
                disabled={done}
              >
                {done ? '✓ Completed' : 'Resume Lesson →'}
              </button>
            </div>
          </div>

          <h2 className="text-xl font-bold text-navy mt-8 mb-3">Upcoming training</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {upcoming.map(u => (
              <div key={u.title} className="bg-card border-2 border-[#d8cfae] rounded-2xl p-6">
                <span className="inline-block bg-slate-200 text-slate-600 text-[10px] font-bold px-2.5 py-1 rounded-full">UNLOCKS AT LVL 3</span>
                <p className="text-navy font-bold mt-3">{u.title}</p>
                <p className="text-gray-500 text-sm mt-1">{u.desc}</p>
                <div className="flex justify-between items-center mt-4">
                  <p className="text-xs text-gray-400">{u.meta}</p>
                  <span className="text-[10px] font-bold text-gray-400 tracking-wide">UPCOMING</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* A7 — department leaderboard */}
        <Leaderboard />
      </div>

      {quizOpen && (
        <TrainingQuiz
          onClose={() => { setQuizOpen(false); refresh() }}
          onComplete={() => { setQuizOpen(false); refresh() }}
        />
      )}
    </div>
  )
}
