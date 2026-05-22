import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { useShallow } from 'zustand/react/shallow'

function formatRelative(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 10)   return 'just now'
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export function useLastUpdated(): string | null {
  const { section, selectedNamespace, sectionLoadedAt } = useAppStore(
    useShallow(s => ({ section: s.section, selectedNamespace: s.selectedNamespace, sectionLoadedAt: s.sectionLoadedAt }))
  )
  const [, tick] = useState(0)
  const ns = selectedNamespace === '_all' ? '_all' : (selectedNamespace ?? '_all')
  const cacheKey = `${section}:${ns}`
  const ts = sectionLoadedAt[cacheKey]

  useEffect(() => {
    if (!ts) return
    const id = setInterval(() => tick(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [ts])

  return ts ? formatRelative(ts) : null
}

export function useLastDashboardUpdated(): string | null {
  const { lastDashboardLoadedAt } = useAppStore(
    useShallow(s => ({ lastDashboardLoadedAt: s.lastDashboardLoadedAt }))
  )
  const [, tick] = useState(0)

  useEffect(() => {
    if (!lastDashboardLoadedAt) return
    const id = setInterval(() => tick(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [lastDashboardLoadedAt])

  return lastDashboardLoadedAt ? formatRelative(lastDashboardLoadedAt) : null
}
