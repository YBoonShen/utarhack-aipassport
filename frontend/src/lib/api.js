// Thin fetch helpers for the AI Passport backend (proxied through /api).

async function request(path, options) {
  const res = await fetch(`/api${path}`, options)
  if (!res.ok) throw new Error(`API ${path} failed (${res.status})`)
  return res.json()
}

export const api = {
  get: path => request(path),
  post: (path, body) =>
    request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
  put: (path, body) =>
    request(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
}

// ---- demo auth (localStorage session; Firebase Auth later) ----

const KEY = 'aip-user'

export function currentUser() {
  try {
    return JSON.parse(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

export async function login(role) {
  const user = await api.post('/auth/login', { role })
  localStorage.setItem(KEY, JSON.stringify(user))
  return user
}

export function logout() {
  localStorage.removeItem(KEY)
}
