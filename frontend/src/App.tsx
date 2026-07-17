import React from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import GamePage from './pages/GamePage'
import Admin from './pages/Admin'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/game/:eventId" element={<GamePage />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </HashRouter>
  )
}
