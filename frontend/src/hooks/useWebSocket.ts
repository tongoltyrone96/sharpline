import { useEffect, useRef, useCallback } from 'react'

export type WsMessage = { type: string; event_id?: string; [key: string]: unknown }

interface UseWebSocketOptions {
  onMessage: (msg: WsMessage) => void
  onStateChange?: (state: 'connecting' | 'connected' | 'disconnected') => void
}

export function useWebSocket({ onMessage, onStateChange }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const backoffRef = useRef(1000)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const onMessageRef = useRef(onMessage)
  const onStateRef = useRef(onStateChange)

  onMessageRef.current = onMessage
  onStateRef.current = onStateChange

  const connect = useCallback(() => {
    if (!mountedRef.current) return
    const url = (import.meta.env.VITE_WS_URL as string | undefined) || (() => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${proto}//${location.host}/ws`
    })()

    onStateRef.current?.('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return }
      backoffRef.current = 1000
      onStateRef.current?.('connected')
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsMessage
        onMessageRef.current(msg)
      } catch {
        // ignore unparseable messages
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      onStateRef.current?.('disconnected')
      const delay = backoffRef.current
      backoffRef.current = Math.min(backoffRef.current * 2, 30_000)
      timerRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [connect])
}
