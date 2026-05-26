// C:\Users\ADMIN\scraper\src\pages\Login.jsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Simple hardcoded check — change these values as needed
    const VALID_EMAIL    = 'admin@emega.com.au'
    const VALID_PASSWORD = 'emega2026'

    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
      // Store session in localStorage so page refresh keeps you logged in
      localStorage.setItem('scraper_session', JSON.stringify({ email, loggedIn: true }))
      onLogin({ email })
      navigate('/dashboard')
    } else {
      setError('Invalid email or password.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-red-50 font-sans">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-sm border border-red-100 px-8 py-10">

        <h1 className="text-2xl font-bold text-gray-900 text-center mb-1">Sign In</h1>
        <p className="text-sm text-gray-400 text-center mb-8">Enter your credentials to continue</p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} required
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition"
          />

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'} placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)} required
              className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition pr-10"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition text-sm">
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold py-2.5 rounded-lg text-sm transition disabled:opacity-60 disabled:cursor-not-allowed mt-1">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

      </div>
    </div>
  )
}