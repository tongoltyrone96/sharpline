import React from 'react'

interface WeatherData {
  temp_c: number
  wind_kmh: number
  rain_prob: number
  humidity: number
  condition: string
  is_indoor: boolean
}

interface WeatherPanelProps {
  weather: WeatherData | null
}

export default function WeatherPanel({ weather }: WeatherPanelProps) {
  if (!weather) return null

  if (weather.is_indoor) {
    return (
      <div style={{
        background: 'var(--panel-2)', border: '1px solid var(--line)',
        borderRadius: 8, padding: '10px 12px', fontSize: 11.5,
        color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none">
          <path d="M3 12l9-8 9 8M6 10v10h12V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Indoor venue — weather not modelled
      </div>
    )
  }

  const rainPct = Math.round(weather.rain_prob * 100)

  return (
    <div style={{
      background: 'var(--panel-2)', border: '1px solid var(--line)',
      borderRadius: 8, padding: '10px 12px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Weather</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" style={{ color: 'var(--amber)' }}>
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{weather.temp_c}°C</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" style={{ color: 'var(--blue-2)' }}>
            <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{weather.wind_kmh} km/h</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" style={{ color: 'var(--blue)' }}>
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{rainPct}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Humidity</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{weather.humidity}%</span>
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 5 }}>{weather.condition}</div>
    </div>
  )
}
