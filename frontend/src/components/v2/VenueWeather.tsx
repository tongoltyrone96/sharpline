import React from 'react'

interface Weather {
  temp_c: number
  wind_kmh: number
  rain_prob: number
  humidity: number
  condition: string
  is_indoor: boolean
}

interface Props {
  weather: Weather | null
}

export default function VenueWeather({ weather }: Props) {
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '12px 14px', borderBottom: '1px solid var(--line)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Venue Weather</span>
      </div>
      {weather ? (
        weather.is_indoor ? (
          <div style={{ padding: 14, fontSize: 12, color: 'var(--text-3)' }}>
            Indoor venue — weather does not affect play.
          </div>
        ) : (
          <div style={{
            padding: 14,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 16, rowGap: 12,
            alignItems: 'center',
          }}>
            <div style={{ minWidth: 60 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontWeight: 600, lineHeight: 1 }}>
                {weather.temp_c.toFixed(0)}°
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4 }}>
                {weather.condition}
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '8px 14px',
              fontSize: 11,
              minWidth: 0,
            }}>
              <Info label="Wind" value={`${weather.wind_kmh.toFixed(0)} km/h`} icon={<path d="M3 8h11a3 3 0 1 0-3-3M3 16h15a3 3 0 1 1-3 3M3 12h8" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"/>} />
              <Info label="Rain" value={`${Math.round(weather.rain_prob * 100)}%`} icon={<path d="M7 15a4 4 0 0 1-.5-8A5 5 0 0 1 16 6.5a3.5 3.5 0 0 1 1 6.9" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"/>} />
              <Info label="Humid" value={`${weather.humidity.toFixed(0)}%`} icon={<path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"/>} />
              <Info label="Feels" value={`${weather.temp_c.toFixed(0)}°`} icon={<circle cx={12} cy={12} r={4} stroke="currentColor" strokeWidth={1.7}/>} />
            </div>
          </div>
        )
      ) : (
        <div style={{ padding: 14, fontSize: 12, color: 'var(--text-3)' }}>
          Weather data not yet available.
        </div>
      )}
    </div>
  )
}

function Info({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-3)', flexShrink: 0 }}>{icon}</svg>
      {label}
      <b style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', color: 'var(--text)', fontWeight: 600 }}>{value}</b>
    </div>
  )
}
