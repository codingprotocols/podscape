import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { KubePod } from '../types'
import { podPhaseBg, formatAge } from '../types'
import { useAppStore } from '../store'

interface Props {
  pod: KubePod
}

const MIN_WIDTH = 360
const MAX_WIDTH = 900
const DEFAULT_WIDTH = 460

export default function PodDetail({ pod }: Props): JSX.Element {
  const { selectedContext, selectedNamespace, openExec } = useAppStore()
  const [logs, setLogs] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [selectedContainer, setSelectedContainer] = useState(pod.spec.containers[0]?.name ?? '')
  const [search, setSearch] = useState('')
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH)
  const [logFullscreen, setLogFullscreen] = useState(false)
  const logContainerRef = useRef<HTMLPreElement>(null)
  const fsLogContainerRef = useRef<HTMLPreElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartWidthRef = useRef(0)
  // Use a ref for activeStreamId so cleanup effects always have the latest value
  const activeStreamIdRef = useRef<string | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      // Stop any active stream on unmount
      if (activeStreamIdRef.current) {
        window.kubectl.stopLogs(activeStreamIdRef.current).catch(() => { })
        activeStreamIdRef.current = null
      }
    }
  }, [])

  // ── Stream helpers ────────────────────────────────────────────────────────

  const stopStream = useCallback(async () => {
    const id = activeStreamIdRef.current
    if (id) {
      await window.kubectl.stopLogs(id).catch(() => { })
      activeStreamIdRef.current = null
    }
    if (isMountedRef.current) setIsStreaming(false)
  }, [])

  const startStream = useCallback(async () => {
    await stopStream()
    if (!isMountedRef.current) return
    setLogs([])
    setLogError(null)
    setIsStreaming(true)
    try {
      const ctx = selectedContext!
      const ns = selectedNamespace === '_all'
        ? (pod.metadata.namespace ?? '')
        : (selectedNamespace ?? '')
      const streamId = await window.kubectl.streamLogs(
        ctx, ns, pod.metadata.name, selectedContainer,
        (chunk) => {
          if (isMountedRef.current) setLogs(prev => [...prev, ...chunk.split('\n')].slice(-2000))
        },
        () => {
          activeStreamIdRef.current = null
          if (isMountedRef.current) setIsStreaming(false)
        }
      )
      activeStreamIdRef.current = streamId
    } catch (err) {
      if (isMountedRef.current) {
        setLogError(err instanceof Error ? err.message : String(err))
        setIsStreaming(false)
      }
    }
  }, [selectedContext, selectedNamespace, pod, selectedContainer, stopStream])

  // Stop stream when pod/container changes (no auto-start)
  useEffect(() => {
    setLogs([])
    setLogError(null)
    setSearch('')
    // Read directly from ref to avoid stale closure
    const id = activeStreamIdRef.current
    if (id) {
      window.kubectl.stopLogs(id).catch(() => { })
      activeStreamIdRef.current = null
      setIsStreaming(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pod.metadata.uid, selectedContainer])

  // Auto-scroll both normal and fullscreen log panes
  useEffect(() => {
    if (!autoScroll) return
    logContainerRef.current && (logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight)
    fsLogContainerRef.current && (fsLogContainerRef.current.scrollTop = fsLogContainerRef.current.scrollHeight)
  }, [logs, autoScroll])

  // ── Panel resize (drag left edge) ─────────────────────────────────────────

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    dragStartXRef.current = e.clientX
    dragStartWidthRef.current = panelWidth

    const onMove = (mv: MouseEvent) => {
      if (!draggingRef.current) return
      // Dragging LEFT increases width; dragging RIGHT decreases
      const delta = dragStartXRef.current - mv.clientX
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidthRef.current + delta))
      setPanelWidth(next)
    }
    const onUp = () => {
      draggingRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelWidth])

  const phase = pod.status.phase ?? 'Unknown'
  const filteredLogs = search
    ? logs.filter(l => l.toLowerCase().includes(search.toLowerCase()))
    : logs

  // ── Shared log toolbar content ────────────────────────────────────────────

  const LogToolbar = (
    <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-900 shrink-0 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em]">Logs</h4>
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <button onClick={() => setLogs([])}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors uppercase tracking-wider">
              Clear
            </button>
          )}
          {/* Fullscreen toggle */}
          <button
            onClick={() => setLogFullscreen(v => !v)}
            title={logFullscreen ? 'Exit fullscreen' : 'Fullscreen logs'}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200
                       hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {logFullscreen
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/>
                </svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3"/>
                </svg>
            }
          </button>
          {isStreaming ? (
            <button
              onClick={stopStream}
              className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-red-600 dark:text-red-400
                         bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30
                         rounded-lg transition-colors border border-red-100 dark:border-red-900/30"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              STOP
            </button>
          ) : (
            <button
              onClick={startStream}
              className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-blue-600 dark:text-blue-400
                         bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30
                         rounded-lg transition-all active:scale-95 border border-blue-100 dark:border-blue-900/30"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1.5l7 3.5-7 3.5V1.5z"/></svg>
              LOAD LOGS
            </button>
          )}
        </div>
      </div>
      {logs.length > 0 && (
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 pointer-events-none"
            width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search logs…"
            className="w-full pl-7 pr-8 py-1.5 text-[11px] font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800
                       text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600
                       rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>
      )}
      {search && (
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-600">
          {filteredLogs.length} / {logs.length} lines match
        </p>
      )}
    </div>
  )

  const LogContent = (containerRef: React.RefObject<HTMLPreElement>) => (
    <pre
      ref={containerRef}
      className="absolute inset-0 overflow-auto p-4 font-mono text-[11px] text-emerald-400/90 leading-relaxed whitespace-pre-wrap break-all scrollbar-hide"
      onScroll={e => {
        const el = e.currentTarget
        setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
      }}
    >
      {filteredLogs.length === 0
        ? (isStreaming
            ? <span className="text-slate-600 animate-pulse"># Waiting for logs…{'\n'}</span>
            : logs.length > 0
              ? <span className="text-slate-600"># No lines match search{'\n'}</span>
              : <span className="text-slate-600"># Press LOAD LOGS to stream logs{'\n'}</span>
          )
        : search
          ? filteredLogs.map((line, i) => (
              <LogLine key={i} line={line} search={search} />
            ))
          : filteredLogs.join('\n')
      }
    </pre>
  )

  // ── Fullscreen overlay ────────────────────────────────────────────────────

  const FullscreenOverlay = logFullscreen ? (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 animate-in fade-in duration-150">
      {/* Fullscreen header */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400 font-mono">{pod.metadata.name}</span>
          {pod.spec.containers.length > 1 && (
            <select
              value={selectedContainer}
              onChange={e => setSelectedContainer(e.target.value)}
              className="bg-slate-800 text-slate-200 text-[10px] font-bold rounded-lg px-2.5 py-1
                         border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {pod.spec.containers.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={() => setLogFullscreen(false)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Exit fullscreen (Esc)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/>
          </svg>
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-slate-900">
        {LogToolbar}
      </div>

      {/* Log area */}
      <div className="flex-1 relative overflow-hidden">
        {LogContent(fsLogContainerRef)}
        {logs.length > 0 && (
          <button
            onClick={() => setAutoScroll(v => !v)}
            className={`absolute bottom-4 right-6 px-2.5 py-1 text-[9px] font-bold rounded-md border transition-all
              ${autoScroll
                ? 'bg-emerald-900/60 border-emerald-700/60 text-emerald-400'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-500'}`}
          >
            ↓ AUTO
          </button>
        )}
      </div>
    </div>
  ) : null

  // Close fullscreen on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLogFullscreen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Main panel ────────────────────────────────────────────────────────────

  return (
    <>
      {FullscreenOverlay}

      <div
        ref={panelRef}
        className="flex flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 h-full transition-colors duration-200 relative"
        style={{ width: panelWidth, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH }}
      >
        {/* Drag resize handle (left edge) */}
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors"
          title="Drag to resize"
        />

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-900 shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white font-mono truncate tracking-tight">{pod.metadata.name}</h3>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{pod.metadata.namespace}</p>
            </div>
            <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 transition-all ${podPhaseBg(phase)}`}>
              {phase.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Metadata */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-900 shrink-0">
          <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-3">Resource Info</h4>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            <MetaRow label="Node" value={pod.spec.nodeName ?? '—'} mono />
            <MetaRow label="Pod IP" value={pod.status.podIP ?? '—'} mono />
            <MetaRow label="Host IP" value={pod.status.hostIP ?? '—'} mono />
            <MetaRow label="QoS Class" value={pod.status.qosClass ?? '—'} />
            <MetaRow label="Created" value={formatAge(pod.metadata.creationTimestamp) + ' ago'} />
            <MetaRow label="Restart Policy" value={String(pod.spec.restartPolicy ?? 'Always')} />
          </dl>
        </div>

        {/* Containers */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-900 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em]">Containers</h4>
            {pod.spec.containers.length > 1 && (
              <select
                value={selectedContainer}
                onChange={e => setSelectedContainer(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded-lg px-2.5 py-1
                           border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {pod.spec.containers.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-3">
            {pod.spec.containers.map(c => {
              const status = pod.status.containerStatuses?.find(s => s.name === c.name)
              return (
                <div key={c.name} className="flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/50">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 font-mono truncate">{c.name}</p>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 truncate mt-0.5">{c.image}</p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    {status && (
                      <>
                        <span className={`w-2 h-2 rounded-full ${status.ready ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]'}`} />
                        {status.restartCount > 0 && (
                          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-md">
                            {status.restartCount}↺
                          </span>
                        )}
                      </>
                    )}
                    <button
                      onClick={() => openExec({
                        pod: pod.metadata.name,
                        container: c.name,
                        namespace: pod.metadata.namespace ?? selectedNamespace ?? ''
                      })}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-blue-600 dark:text-blue-400
                                 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30
                                 rounded-lg transition-all active:scale-95 border border-blue-100 dark:border-blue-900/30"
                    >
                      <span>$</span> SHELL
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Log viewer */}
        <div className="flex flex-col flex-1 min-h-0">
          {LogToolbar}

          {logError && (
            <div className="mx-6 mt-3 shrink-0 px-4 py-2.5 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl text-red-600 dark:text-red-400 text-[10px] font-bold">
              {logError}
            </div>
          )}

          <div className="flex-1 relative m-6 mt-3 mb-6 bg-slate-950 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800/50 shadow-inner">
            {LogContent(logContainerRef)}
            {logs.length > 0 && (
              <button
                onClick={() => setAutoScroll(v => !v)}
                className={`absolute bottom-3 right-3 px-2 py-1 text-[9px] font-bold rounded-md border transition-all
                  ${autoScroll
                    ? 'bg-emerald-900/60 border-emerald-700/60 text-emerald-400'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-500'}`}
              >
                ↓ AUTO
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function LogLine({ line, search }: { line: string; search: string }): JSX.Element {
  const idx = line.toLowerCase().indexOf(search.toLowerCase())
  if (idx === -1) return <span className="opacity-40">{line}{'\n'}</span>
  return (
    <span>
      {line.slice(0, idx)}
      <mark className="bg-yellow-400/30 text-yellow-200 rounded-sm not-italic">{line.slice(idx, idx + search.length)}</mark>
      {line.slice(idx + search.length)}
      {'\n'}
    </span>
  )
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-tighter mb-0.5">{label}</dt>
      <dd className={`text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
