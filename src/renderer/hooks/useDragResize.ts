import { useState, useRef, useCallback, useEffect } from 'react'

export function useDragResize(defaultWidth: number, minWidth: number, maxWidth: number) {
  const [width, setWidth] = useState(defaultWidth)
  const dragStartX = useRef<number | null>(null)
  const dragStartWidth = useRef<number>(defaultWidth)
  const listeners = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null)

  useEffect(() => {
    return () => {
      if (listeners.current) {
        window.removeEventListener('mousemove', listeners.current.move)
        window.removeEventListener('mouseup', listeners.current.up)
        listeners.current = null
      }
    }
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragStartX.current = e.clientX
    dragStartWidth.current = width

    const onMouseMove = (ev: MouseEvent) => {
      if (dragStartX.current === null) return
      const delta = dragStartX.current - ev.clientX
      const next = Math.max(minWidth, Math.min(maxWidth, dragStartWidth.current + delta))
      setWidth(next)
    }
    const onMouseUp = () => {
      dragStartX.current = null
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      listeners.current = null
    }
    listeners.current = { move: onMouseMove, up: onMouseUp }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [width, minWidth, maxWidth])

  return { width, onMouseDown }
}
