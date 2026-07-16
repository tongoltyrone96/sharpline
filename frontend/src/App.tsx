import React, { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'

function useHash() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const handler = () => setHash(window.location.hash)
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()
  if (hash === '#/admin') return <Admin />
  return <Dashboard />
}
