// C:\Users\ADMIN\scraper\src\App.jsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ChecklistTab from './pages/checklist/ChecklistTab'

export default function App() {
  const [session, setSession] = useState(() => {
    try {
      const stored = localStorage.getItem('scraper_session')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  function handleLogin(user) {
    setSession(user)
  }

  function handleLogout() {
    setSession(null)
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={!session ? <Login onLogin={handleLogin} /> : <Navigate to="/dashboard" replace />}
      />
      <Route
        path="/dashboard"
        element={session ? <Dashboard session={session} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/checklist"
        element={<ChecklistTab />}
      />
      <Route
        path="*"
        element={<Navigate to={session ? '/dashboard' : '/login'} replace />}
      />
    </Routes>
  )
}