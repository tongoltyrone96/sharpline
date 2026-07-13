export default function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'linear-gradient(135deg,#4F7DF3,#8B5CF6)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 17l5-5 4 4 9-10"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
        Sharpline
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Scaffold OK — Phase 1
      </p>
    </div>
  )
}
