import React from 'react'

type Pattern = 'hoop' | 'stripe' | 'vstripe' | 'chevron' | 'sash' | 'half'

interface TeamJerseyProps {
  c1: string
  c2: string
  pattern?: Pattern
  size?: number
  className?: string
}

export default function TeamJersey({ c1, c2, pattern = 'stripe', size = 48, className }: TeamJerseyProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48">
      <path
        d="M15 8 L19 5.5 Q24 10 29 5.5 L33 8 L40 14 L35.5 19.5 L32.5 17 L32.5 41 L15.5 41 L15.5 17 L12.5 19.5 L8 14 Z"
        fill={c1} stroke="rgba(0,0,0,.35)" strokeWidth={0.8}
      />
      {pattern === 'hoop'    && <rect x="15.5" y="24" width="17" height="5.5" fill={c2} />}
      {pattern === 'stripe'  && <rect x="21" y="9" width="6" height="32" fill={c2} />}
      {pattern === 'vstripe' && <>
        <rect x="17" y="9" width="3.5" height="32" fill={c2} />
        <rect x="24.2" y="9" width="3.5" height="32" fill={c2} />
      </>}
      {pattern === 'chevron' && <path d="M15.5 17 L24 27 L32.5 17 L32.5 22 L24 32 L15.5 22 Z" fill={c2} />}
      {pattern === 'sash'    && <path d="M15.5 17 L32.5 34 L32.5 41 L28 41 L15.5 28 Z" fill={c2} />}
      {pattern === 'half'    && <path d="M24 8.5 L24 41 L32.5 41 L32.5 17 L35.5 19.5 L40 14 L33 8 L29 5.5 Q26.5 8 24 8.5 Z" fill={c2} />}
      <path d="M19 5.5 Q24 10.5 29 5.5 L26.5 9.5 Q24 11.5 21.5 9.5 Z" fill={c2} />
    </svg>
  )
}
