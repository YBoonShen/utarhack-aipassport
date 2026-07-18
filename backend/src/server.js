// AI Passport backend — Express API (Team Soda)
// Detection:
//   GET  /api/health          -> service check
//   POST /api/detect          -> { prompt } => { masked, detections }   (preview only)
//   POST /api/send            -> { prompt, override? } => actually "send"; applies points rules
// Demo world (in-memory, resets via /api/reset — Firebase is the planned store):
//   GET  /api/profile         -> employee E-217 license/points/streak
//   GET  /api/stats           -> admin KPIs (one source of truth for all screens)
//   GET  /api/alerts          -> open risk alerts     POST /api/alerts/:id/resolve
//   GET  /api/approvals       -> pending tool visas   POST /api/approvals/:id/decide
//   GET  /api/events          -> live audit log
//   GET  /api/quiz            -> quiz results         POST /api/quiz/answer
//   GET  /api/leaderboard     -> department safety-points ranking
//   POST /api/review-request  -> public transparency portal -> creates admin alert
//   POST /api/reset           -> reset demo data (optional profile overrides in body)

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { maskPrompt } from './detector.js'
import { logDetection } from './firebase.js'
import * as demo from './state.js'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'aipassport-backend', time: new Date().toISOString() })
})

app.post('/api/detect', async (req, res) => {
  const { prompt } = req.body || {}
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return res.status(400).json({ error: 'Body must be { "prompt": "..." }' })
  }
  const result = maskPrompt(prompt)
  const audit = await logDetection({ detections: result.detections, masked: result.masked })
  res.json({ ...result, audit })
})

app.post('/api/send', (req, res) => {
  const { prompt, override } = req.body || {}
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return res.status(400).json({ error: 'Body must be { "prompt": "...", "override": boolean }' })
  }
  res.json(demo.recordSend(prompt, Boolean(override)))
})

app.get('/api/profile', (req, res) => res.json(demo.getState().profile))
app.get('/api/stats', (req, res) => res.json(demo.summaryStats()))
app.get('/api/events', (req, res) => res.json(demo.getState().events))
app.get('/api/leaderboard', (req, res) => res.json(demo.leaderboard()))

app.get('/api/alerts', (req, res) => res.json(demo.openAlerts()))
app.post('/api/alerts/:id/resolve', (req, res) => res.json(demo.resolveAlert(req.params.id)))

app.get('/api/approvals', (req, res) => res.json(demo.getState().approvals))
app.post('/api/approvals/:id/decide', (req, res) => res.json(demo.decideApproval(req.params.id)))

app.get('/api/quiz', (req, res) => res.json(demo.quizResults()))
app.post('/api/quiz/answer', (req, res) => {
  const { question, picked, correct } = req.body || {}
  res.json(demo.answerQuiz(question, picked, Boolean(correct)))
})

app.post('/api/review-request', (req, res) => {
  const { ref } = req.body || {}
  res.json({ ok: true, alerts: demo.addReviewRequest(ref || 'UNKNOWN') })
})

app.post('/api/reset', (req, res) => {
  const overrides = req.body && typeof req.body === 'object' ? req.body : {}
  res.json(demo.reset(overrides).profile)
})

const PORT = process.env.PORT || 5001
app.listen(PORT, () => {
  console.log(`AI Passport backend running on http://localhost:${PORT}`)
})
