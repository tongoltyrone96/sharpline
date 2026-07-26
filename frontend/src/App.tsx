import React from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import GamePage from './pages/GamePage'
import Admin from './pages/Admin'
import Mockup from './pages/Mockup'

// Root and /mockup both render the same production dashboard.
// /mockup kept as an alias so the client's existing bookmarks keep working.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Mockup />} />
        <Route path="/mockup" element={<Mockup />} />
        <Route path="/game/:eventId" element={<GamePage />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Mockup />} />
      </Routes>
    </HashRouter>
  )
}
