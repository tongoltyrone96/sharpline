export function fmtEdge(v: number | null): string {
  if (v === null || v === undefined) return '–'
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}

export function fmtPrice(v: number): string {
  return v.toFixed(2)
}

export function fmtPoint(v: number | null): string {
  if (v === null || v === undefined) return '–'
  return (v > 0 ? '+' : '') + v.toFixed(1)
}

export function fmtTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch {
    return '–'
  }
}

export function timeAgo(iso: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return diff + 's ago'
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago'
    return Math.floor(diff / 86400) + 'd ago'
  } catch {
    return '–'
  }
}
