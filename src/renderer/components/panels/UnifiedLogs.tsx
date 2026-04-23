import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import { Search, Play, Square, Trash2, Terminal } from 'lucide-react'
import PageHeader from '../core/PageHeader'
import { useAutoScroll, useLogBuffer } from '../../hooks'

/**
 * Exported for unit testing: given a map of active stream IDs, determines
 * whether the streaming state should be reset to false (all pods failed).
 */
export function shouldResetStreaming(streamIds: Record<string, string>): boolean {
  return Object.keys(streamIds).length === 0
}

/**
 * Exported for unit testing: escapes a string for use in a RegExp.
 */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface LogEntry {
  id: string
  podName: string
  containerName: string
  message: string
  timestamp: Date
  color: string
}

const POD_COLORS = [
  'text-blue-400',
  'text-emerald-400',
  'text-rose-400',
  'text-amber-400',
  'text-purple-400',
  'text-cyan-400',
  'text-orange-400',
  'text-pink-400',
]

export default function UnifiedLogs(): JSX.Element {
  const { pods, selectedContext, selectedNamespace, loadSection, unifiedLogsSelectedPods, setUnifiedLogsSelectedPods } = useAppStore(useShallow(s => ({
    pods: s.pods,
    selectedContext: s.selectedContext,
    selectedNamespace: s.selectedNamespace,
    loadSection: s.loadSection,
    unifiedLogsSelectedPods: s.unifiedLogsSelectedPods,
    setUnifiedLogsSelectedPods: s.setUnifiedLogsSelectedPods,
  })))
  const [isStreaming, setIsStreaming] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [podSearchTerm, setPodSearchTerm] = useState('')
  const streamIds = useRef<Record<string, string>>({})
  const { items: logs, append, reset, cancelFlush } = useLogBuffer<LogEntry>({ maxItems: 1000, flushIntervalMs: 100 })
  const { ref: scrollRef, autoScroll, setAutoScroll, handleScroll } = useAutoScroll<HTMLDivElement>({
    bottomThresholdPx: 60,
    ignoreProgrammaticMs: 50,
    scrollTrigger: logs.length,
  })
  const podSearchRef = useRef<HTMLDivElement>(null)
  const [showPodResults, setShowPodResults] = useState(false)

  const availablePods = useMemo(() => pods.filter(p => p.status.phase === 'Running'), [pods])

  const filteredPods = useMemo(() => {
    if (!podSearchTerm.trim()) return []
    const lower = podSearchTerm.toLowerCase()
    return availablePods.filter(p =>
      p.metadata.name.toLowerCase().includes(lower) ||
      (p.metadata.namespace || 'default').toLowerCase().includes(lower)
    )
  }, [availablePods, podSearchTerm])

  // Keep the pods list fresh so the "Add pods" search always has results
  useEffect(() => { loadSection('pods') }, [selectedNamespace])

  useEffect(() => {
    return () => {
      // Inline cleanup to avoid stale closure over stopAllStreams.
      cancelFlush()
      const toStop = Object.values(streamIds.current)
      streamIds.current = {}
      for (const sid of toStop) { window.kubectl.stopLogs(sid).catch(() => {}) }
    }
  }, [cancelFlush])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (podSearchRef.current && !podSearchRef.current.contains(event.target as Node)) {
        setShowPodResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Clear selected pods and stop all streams when context changes
  useEffect(() => {
    const cleanup = async () => {
      for (const sid of Object.values(streamIds.current)) {
        await window.kubectl.stopLogs(sid).catch(() => {/* sidecar may be down during context switch */})
      }
      streamIds.current = {}
      setUnifiedLogsSelectedPods([])
      reset()
      setIsStreaming(false)
    }
    cleanup().catch(err => console.error('[UnifiedLogs] cleanup failed:', err))
  }, [reset, selectedContext])

  // Clear selected pods and stop all streams when namespace changes
  useEffect(() => {
    if (!isStreaming) {
      setUnifiedLogsSelectedPods([])
      return
    }
    // Stop all active streams and reset
    const stopAndReset = async () => {
      for (const [, streamId] of Object.entries(streamIds.current)) {
        try { await window.kubectl.stopLogs(streamId) } catch { /* ignore */ }
      }
      streamIds.current = {}
      setIsStreaming(false)
      setUnifiedLogsSelectedPods([])
      reset()
      cancelFlush()
    }
    stopAndReset().catch(err => console.error('[UnifiedLogs] namespace cleanup failed:', err))
  }, [selectedNamespace])

  useEffect(() => {
    const syncPods = async () => {
      const existingPodNames = new Set(pods.map(p => p.metadata.name))
      const removedPods = unifiedLogsSelectedPods.filter(name => !existingPodNames.has(name))

      if (removedPods.length > 0) {
        setUnifiedLogsSelectedPods(unifiedLogsSelectedPods.filter(name => existingPodNames.has(name)))

        // Stop streams for removed pods
        for (const name of removedPods) {
          if (streamIds.current[name]) {
            await window.kubectl.stopLogs(streamIds.current[name]).catch(() => {})
            delete streamIds.current[name]
          }
        }
      }
    }
    syncPods().catch(err => console.error('[UnifiedLogs] syncPods failed:', err))
  }, [pods, unifiedLogsSelectedPods])

  const stopAllStreams = async () => {
    // Cancel pending flush timer and discard in-flight buffered lines — we
    // don't want chunks that arrive after Stop to appear. Flushed log history
    // is preserved so the user can still read it.
    cancelFlush()
    // Clear streamIds first so any onChunk callbacks still in flight are
    // discarded by the guard inside startStreaming's closure.
    const toStop = Object.values(streamIds.current)
    streamIds.current = {}
    for (const sid of toStop) {
      await window.kubectl.stopLogs(sid).catch(() => {})
    }
    setIsStreaming(false)
  }

  const startStreaming = async () => {
    if (!selectedContext) return
    setIsStreaming(true)
    // Reset the buffer so leftover chunks from a previous session don't bleed in.
    cancelFlush()
    reset()

    for (let i = 0; i < unifiedLogsSelectedPods.length; i++) {
        const podName = unifiedLogsSelectedPods[i]
        const pod = pods.find(p => p.metadata.name === podName)
        if (!pod) continue

        const namespace = pod.metadata.namespace || 'default'
        // Issue 2 fix: guard against empty containers array
        const containerName = pod.spec.containers[0]?.name
        if (!containerName) continue
        const color = POD_COLORS[i % POD_COLORS.length]

        try {
            const sid = await window.kubectl.streamLogs(
                selectedContext, namespace, podName, containerName,
                (chunk) => {
                    // Discard chunks that arrive after stopAllStreams cleared streamIds.
                    if (streamIds.current[podName] !== sid) return
                    const lines = chunk.split('\n').filter(Boolean)
                    const newEntries: LogEntry[] = lines.map(line => ({
                        id: crypto.randomUUID(),
                        podName,
                        containerName,
                        message: line,
                        timestamp: new Date(),
                        color
                    }))
                    // Accumulate into the shared buffer and schedule a single
                    // flush — at most one setState every 100 ms regardless of
                    // how many lines arrive per chunk.
                    append(newEntries)
                },
                () => {
                    // When the websocket closes, onEnd fires. Guard so we don't
                    // clear a newer stream for the same podName.
                    if (streamIds.current[podName] !== sid) return
                    delete streamIds.current[podName]
                    if (shouldResetStreaming(streamIds.current)) {
                      setIsStreaming(false)
                    }
                }
            )
            streamIds.current[podName] = sid
        } catch (err) {
            console.error(`Failed to stream logs for ${podName}:`, err)
        }
    }

    // Issue 2 fix: if no streams were started (all failed), reset streaming state
    if (Object.keys(streamIds.current).length === 0) {
      setIsStreaming(false)
    }
  }

  const togglePod = (name: string) => {
    setUnifiedLogsSelectedPods(
      unifiedLogsSelectedPods.includes(name)
        ? unifiedLogsSelectedPods.filter(p => p !== name)
        : [...unifiedLogsSelectedPods, name]
    )
  }

  const clearAll = () => {
    setUnifiedLogsSelectedPods([])
  }

  const searchTermLower = searchTerm.toLowerCase()
  const filteredLogs = useMemo(() => {
    if (!searchTermLower) return logs
    return logs.filter(l =>
      l.message.toLowerCase().includes(searchTermLower) ||
      l.podName.toLowerCase().includes(searchTermLower)
    )
  }, [logs, searchTermLower])

  const highlightRegex = useMemo(() => {
    if (!searchTerm) return null
    return new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi')
  }, [searchTerm])

  const subtitle = isStreaming
    ? `${unifiedLogsSelectedPods.length} pod${unifiedLogsSelectedPods.length !== 1 ? 's' : ''} streaming · ${logs.length} lines`
    : unifiedLogsSelectedPods.length > 0
      ? `${unifiedLogsSelectedPods.length} pod${unifiedLogsSelectedPods.length !== 1 ? 's' : ''} selected`
      : 'Stream logs from multiple pods'

  return (
    <div className="flex flex-col flex-1 bg-slate-50 dark:bg-[hsl(var(--bg-dark))] h-full overflow-hidden transition-colors duration-200">

      {/* Page Header — title + log search */}
      <PageHeader title="Unified Logs" subtitle={subtitle}>
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 text-[11px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-64"
          />
        </div>
      </PageHeader>

      {/* Controls sub-header */}
      <div className="px-8 py-3 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center gap-4 shrink-0">
        {/* Stream toggle */}
        <button
          onClick={() => { if (isStreaming) stopAllStreams(); else startStreaming() }}
          disabled={unifiedLogsSelectedPods.length === 0}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-30
            ${isStreaming
              ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20'
              : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20'}`}
        >
          {isStreaming ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
          {isStreaming ? 'Stop All' : 'Start Stream'}
        </button>

        {/* Clear logs */}
        <button
          onClick={() => reset()}
          title="Clear Logs"
          className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* Auto-scroll toggle */}
        <button
          onClick={() => setAutoScroll(v => !v)}
          title={autoScroll ? 'Auto-scroll on — click to disable' : 'Auto-scroll off — click to enable'}
          className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all
            ${autoScroll
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-500'
              : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500'}`}
        >
          Auto-scroll
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />

        {/* Add pods search */}
        <div className="relative group" ref={podSearchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Add pods to stream..."
            value={podSearchTerm}
            onChange={e => { setPodSearchTerm(e.target.value); setShowPodResults(true) }}
            onFocus={() => setShowPodResults(true)}
            disabled={isStreaming}
            className="pl-9 pr-4 py-2 text-[11px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-72"
          />
          {showPodResults && podSearchTerm.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 max-h-[200px] overflow-y-auto p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex flex-col gap-1">
                {filteredPods.map(p => {
                  const isSelected = unifiedLogsSelectedPods.includes(p.metadata.name)
                  return (
                    <button
                      key={p.metadata.uid}
                      disabled={isStreaming || isSelected}
                      onClick={() => togglePod(p.metadata.name)}
                      className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-all items-center flex justify-between group/item
                        ${isSelected
                          ? 'bg-blue-500/10 border-blue-500/10 text-blue-500/50 cursor-default'
                          : 'bg-white dark:bg-transparent border-slate-100 dark:border-transparent text-slate-600 dark:text-slate-300 hover:bg-blue-500/5 hover:border-blue-500/20 hover:text-blue-500 dark:hover:text-blue-400'}`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="truncate">{p.metadata.name}</span>
                        <span className="opacity-40 font-medium whitespace-nowrap text-[9px] uppercase tracking-tighter">[{p.metadata.namespace || 'default'}]</span>
                      </div>
                      {isSelected
                        ? <span className="text-[8px] uppercase tracking-widest bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400">Added</span>
                        : <Play className="w-2.5 h-2.5 opacity-0 group-hover/item:opacity-100 transition-opacity" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Selected pod pills */}
        {unifiedLogsSelectedPods.length > 0 && (
          <>
            <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />
            <div className="flex items-center gap-2 flex-wrap">
              {unifiedLogsSelectedPods.map(name => (
                <div
                  key={name}
                  className="px-3 py-1 rounded-lg bg-blue-500/10 border border-blue-400/20 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 text-[10px] font-black flex items-center gap-2 animate-in zoom-in-95 duration-200"
                >
                  <span className="truncate max-w-[140px]">{name}</span>
                  <button
                    disabled={isStreaming}
                    onClick={() => togglePod(name)}
                    className="hover:text-rose-400 transition-colors shrink-0 p-0.5 disabled:opacity-30"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              {!isStreaming && (
                <button
                  onClick={clearAll}
                  className="text-[9px] font-black text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 uppercase tracking-widest transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Log content */}
      <div className="flex-1 min-h-0 bg-white dark:bg-slate-950">
        <div
          ref={scrollRef}
          className="h-full overflow-auto p-6 font-mono text-[12px] selection:bg-blue-500/30 leading-relaxed"
          onScroll={handleScroll}
        >
          {filteredLogs.map(l => (
            <div key={l.id} className="flex gap-6 py-0.5 hover:bg-slate-100 dark:hover:bg-white/[0.02] group transition-colors">
              <span className="text-slate-400 dark:text-slate-600 shrink-0 select-none w-20 whitespace-nowrap font-medium">
                {l.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className={`shrink-0 font-black truncate w-40 tracking-tight ${l.color}`}>
                {l.podName}
              </span>
              <span className="text-slate-600 dark:text-slate-300 break-all">
                {highlightRegex ? (
                  l.message.split(highlightRegex).map((part, i) =>
                    part.toLowerCase() === searchTermLower
                      ? <span key={i} className="bg-blue-500/40 text-white px-0.5 rounded-sm">{part}</span>
                      : <span key={i}>{part}</span>
                  )
                ) : (
                  l.message
                )}
              </span>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center gap-6 opacity-40">
              <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 flex items-center justify-center">
                <Terminal className="w-8 h-8 text-blue-500" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 dark:text-slate-600">Stream Pending</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
