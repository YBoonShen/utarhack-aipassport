// AI Passport backend — Express API (Team Soda)
// Endpoints:
//   GET  /api/health        -> service check
//   POST /api/detect        -> { prompt } => { masked, detections }
// Firebase (Auth + Firestore) will be connected here once the team creates
// the Firebase project — see README "Firebase setup".

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { maskPrompt } from './detector.js'
import { logDetection } from './firebase.js'

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

const PORT = process.env.PORT || 5001
app.listen(PORT, () => {
  console.log(`AI Passport backend running on http://localhost:${PORT}`)
})
