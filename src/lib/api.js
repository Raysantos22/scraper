// src/lib/api.js — replaces supabase.js
const API = import.meta.env.VITE_API_URL || 'http://180.181.237.7:3001'

const req = (path, opts = {}) =>
  fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  }).then(r => r.json())

export const api = {
  get:    (path)        => req(path),
  post:   (path, body)  => req(path, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (path, body)  => req(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (path)        => req(path, { method: 'DELETE' }),
}