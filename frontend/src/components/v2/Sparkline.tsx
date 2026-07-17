import React from 'react'

interface Props {
  values: number[]
  color: string
  width?: number
  height?: number
  strokeWidth?: number
  fill?: boolean
}

export default function Sparkline({
  values, color, width = 70, height = 30, strokeWidth = 1.4, fill = false,
}: Props) {
  if (values.length < 2) {
    return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} />
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i * width) / (values.length - 1)
    const y = height - ((v - min) / range) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const areaPts = `${pts} ${width.toFixed(1)},${height.toFixed(1)} 0,${height.toFixed(1)}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {fill && (
        <polygon points={areaPts} fill={color} opacity={0.15} />
      )}
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
