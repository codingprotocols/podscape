import React, { useEffect, useRef, useState, useCallback } from 'react'
import { isMac } from '../../../utils/platform'
import type { KubePod, KubeEvent } from '../../../types'
import { podPhaseBg, formatAge } from '../../../types'
import { useAppStore } from '../../../store'
import { Maximize2, Minimize2, Copy, Download, Search, X, ChevronDown, Terminal, Trash2, Activity, FileCode } from 'lucide-react'
import { useYAMLEditor } from '../../../hooks/useYAMLEditor'
import PodRestartAnalyzer from '../../advanced/PodRestartAnalyzer'
import YAMLViewer from '../../common/YAMLViewer'
import AnalysisView from '../../advanced/AnalysisView'
import PodLifecycleTimeline from '../../advanced/PodLifecycleTimeline'
import { Shield, Clock as ClockIcon, BarChart2 } from 'lucide-react'
import OwnerChain from '../../advanced/OwnerChain'
import CopyButton from '../../common/CopyButton'
import TimeSeriesChart, { PrometheusTimeRangeBar } from '../../advanced/TimeSeriesChart'
import { podCpuQuery, podMemoryQuery, podNetworkRxQuery, podNetworkTxQuery } from '../../../utils/prometheusQueries'

interface Props {
  pod: KubePod
}

export default function PodDetail({ pod }: Props): JSX.Element {
  const {
    selectedContext, selectedNamespace, openExec,
    scanResults, scanResource, isScanning, prometheusAvailable,
  } = useAppStore()
  const { yaml, loading: yamlLoading, error: yamlError, open: openYAML, apply: applyYAML, close: closeYAML } = useYAMLEditor()
  const [activeTab, setActiveTab] = useState<'logs' | 'metrics' | 'analysis' | 'lifecycle'>('logs')
  const [events, setEvents] = useState<KubeEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [copyMsg, setCopyMsg] = useState('')
  const isDebugPod = pod.metadata.name.startsWith('podscape-debug-')
  const [selectedContainer, setSelectedContainer] = useState(
    isDebugPod ? 'debug' : (pod.spec.containers[0]?.name ?? '')
  )
  const [search, setSearch] = useState('')
  const [logFullscreen, setLogFullscreen] = useState(false)
  const [wrapLogs, setWrapLogs] = useState(false)
  const [showAnalyzer, setShowAnalyzer] = useState(false)
  const logContainerRef = useRef<HTMLPreElement>(null)
  const fsLogContainerRef = useRef<HTMLPreElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
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
          // Guard against a stale onEnd from a previous stream (e.g. when stopLogs
          // triggers ws.close() asynchronously after the next stream has already started).
          if (activeStreamIdRef.current === streamId) {
            activeStreamIdRef.current = null
            if (isMountedRef.current) setIsStreaming(false)
          }
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
    setEvents([])
    // Trigger scan
    scanResource(pod)
    // Fetch events for timeline
    const fetchEvents = async () => {
      if (!selectedContext) return
      setEventsLoading(true)
      try {
        const evs = await window.kubectl.getResourceEvents(
          selectedContext,
          pod.metadata.namespace ?? '',
          'Pod',
          pod.metadata.name
        )
        setEvents(evs)
      } catch (err) {
        console.error('[PodDetail] Failed to fetch events:', err)
      } finally {
        setEventsLoading(false)
      }
    }
    fetchEvents()

    // Read directly from ref to avoid stale closure
    const id = activeStreamIdRef.current
    if (id) {
      window.kubectl.stopLogs(id).catch(() => { })
      activeStreamIdRef.current = null
      setIsStreaming(false)
    }
  }, [pod.metadata.uid, selectedContainer, selectedContext, scanResource])

  // Auto-scroll both normal and fullscreen log panes
  useEffect(() => {
    if (!autoScroll) return
    logContainerRef.current && (logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight)
    fsLogContainerRef.current && (fsLogContainerRef.current.scrollTop = fsLogContainerRef.current.scrollHeight)
  }, [logs, autoScroll])


  const phase = pod.status.phase ?? 'Unknown'
  const filteredLogs = search
    ? logs.filter(l => l.toLowerCase().includes(search.toLowerCase()))
    : logs

  const copyLogs = () => {
    navigator.clipboard.writeText(filteredLogs.join('\n'))
    setCopyMsg('Copied!')
    setTimeout(() => setCopyMsg(''), 2000)
  }

  const downloadLogs = () => {
    const content = filteredLogs.join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pod.metadata.name}-${selectedContainer}-${Date.now()}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Shared log toolbar content ────────────────────────────────────────────

  const LogToolbar = (
    <div className={`px-6 py-4 shrink-0 bg-white/5 backdrop-blur-xl sticky top-0 z-10 transition-colors ${(isStreaming || logs.length > 0) ? 'border-b border-slate-100 dark:border-white/5' : ''}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
            <Terminal className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">Console</h4>
            <div className="flex items-center gap-2 mt-1">
              {isStreaming && (
                <span className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-500 px-1.5 py-0.5 rounded bg-emerald-500/10">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
              )}
              {logs.length > 0 && (
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-600">
                  {filteredLogs.length} LINES
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Action Buttons */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-lg p-0.5 border border-slate-200 dark:border-slate-800">
            {logs.length > 0 && (
              <>
                <ToolbarButton onClick={copyLogs} icon={<Copy className="w-3 h-3" />} title={copyMsg || "Copy Logs"} active={!!copyMsg} />
                <ToolbarButton onClick={downloadLogs} icon={<Download className="w-3 h-3" />} title="Download" />
                <ToolbarButton onClick={() => setLogs([])} icon={<Trash2 className="w-3 h-3" />} title="Clear" />
                <div className="w-[1px] h-3 bg-slate-200 dark:bg-slate-800 mx-0.5" />
              </>
            )}
            <ToolbarButton onClick={() => setWrapLogs(v => !v)} icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M4 6h16M4 12h10c1.5 0 3 1.5 3 3s-1.5 3-3 3h-2" /><path d="M12 15l-3 3 3 3" />
              </svg>
            } title="Wrap Lines" active={wrapLogs} />
            <ToolbarButton
              onClick={() => setLogFullscreen(v => !v)}
              icon={logFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              title={logFullscreen ? 'Exit Fullscreen' : 'Maximize'}
            />
          </div>
          {isStreaming ? (
            <button
              onClick={stopStream}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-red-500
                         bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-all border border-red-500/20"
            >
              <div className="w-1.5 h-1.5 rounded-sm bg-red-500" />
              STOP
            </button>
          ) : (
            <button
              onClick={startStream}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-blue-500
                         bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-all active:scale-95 border border-blue-500/20"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><path d="M2 1.5l7 3.5-7 3.5V1.5z" /></svg>
              STREAM
            </button>
          )}
        </div>
      </div>

      {logs.length > 0 && (
        <div className="mt-3 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 w-3.5 h-3.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search patterns or grep logs..."
            className="w-full pl-8 pr-8 py-2 text-[11px] font-mono bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800
                       text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500
                       rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      {search && (
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-600 mt-2">
          {filteredLogs.length} / {logs.length} lines match
        </p>
      )}
    </div>
  )

  const LogContent = (containerRef: React.RefObject<HTMLPreElement>) => (
    <pre
      ref={containerRef}
      className={`absolute inset-0 overflow-auto p-4 font-mono text-[11px] text-emerald-400/90 leading-relaxed scrollbar-hide
                 ${wrapLogs ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}
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
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-[hsl(var(--bg-dark))] animate-in zoom-in-95 duration-200">
      {/* Fullscreen header */}
      <div className={`flex items-center justify-between px-6 py-4 bg-white/5 backdrop-blur-xl border-b border-slate-100 dark:border-white/5 shrink-0 ${isMac ? 'pl-20' : ''}`}>
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tighter">{pod.metadata.name}</span>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">{selectedContainer}</span>
          </div>
          {pod.spec.containers.length > 1 && (
            <select
              value={selectedContainer}
              onChange={e => setSelectedContainer(e.target.value)}
              className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-[10px] font-bold rounded-lg px-2.5 py-1.5
                         border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {pod.spec.containers.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={() => setLogFullscreen(false)}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-all active:scale-90"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="shrink-0">
        {LogToolbar}
      </div>

      {/* Log area */}
      <div className="flex-1 relative overflow-hidden m-4 md:m-8 mt-2 md:mt-4 bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800/50 shadow-2xl overflow-hidden group">
        <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setAutoScroll(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold rounded-xl border backdrop-blur-md transition-all
              ${autoScroll
                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                : 'bg-slate-900/60 border-slate-700/60 text-slate-500 shadow-xl'}`}
          >
            <ChevronDown className={`w-3.5 h-3.5 ${autoScroll ? 'animate-bounce' : ''}`} />
            {autoScroll ? 'AUTO-SCROLL ON' : 'AUTO-SCROLL OFF'}
          </button>
        </div>
        {LogContent(fsLogContainerRef)}
      </div>
    </div>
  ) : null

  // Close fullscreen on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLogFullscreen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Global keyboard shortcuts for selected pod
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey

      // CMD+T -> Open Shell
      if (isCmdOrCtrl && e.key === 't') {
        e.preventDefault()
        openExec({ pod: pod.metadata.name, container: selectedContainer, namespace: pod.metadata.namespace ?? '' })
      }

      // CMD+L -> Toggle Logs (Fullscreen)
      if (isCmdOrCtrl && e.key === 'l') {
        e.preventDefault()
        setActiveTab('logs')
        setLogFullscreen(true)
      }

      // CMD+D -> Close Fullscreen Logs (if open)
      if (isCmdOrCtrl && e.key === 'd') {
        if (logFullscreen) {
          e.preventDefault()
          setLogFullscreen(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pod, selectedContainer, openExec, logFullscreen])

  // ── Events ────────────────────────────────────────────────────────────────

  return (
    <>
      {FullscreenOverlay}

      <div
        ref={panelRef}
        className="flex flex-col bg-transparent h-full transition-colors duration-200 relative w-full"
      >

        {/* Header */}
        <div className="px-6 py-6 border-b border-slate-100 dark:border-white/5 shrink-0 bg-white/5">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white font-mono truncate tracking-tight">{pod.metadata.name}</h3>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{pod.metadata.namespace}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => openYAML('pod', pod.metadata.name, false, pod.metadata.namespace)}
                disabled={yamlLoading}
                className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2 group disabled:opacity-50"
              >
                <FileCode size={14} className="group-hover:text-blue-400 transition-colors" />
                {yamlLoading ? 'Loading...' : 'YAML'}
              </button>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 transition-all ${podPhaseBg(phase)}`}>
                {phase.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Owner chain breadcrumb */}
        {pod.metadata.uid && (
          <OwnerChain
            uid={pod.metadata.uid}
            kind="Pod"
            name={pod.metadata.name}
            namespace={pod.metadata.namespace ?? ''}
          />
        )}

        {/* Details Wrapper (Scrollable) */}
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide">
          {/* Metadata */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-3">Resource Info</h4>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              <MetaRow label="Node" value={pod.spec.nodeName ?? '—'} mono copyable />
              <MetaRow label="Pod IP" value={pod.status.podIP ?? '—'} mono copyable />
              <MetaRow label="Host IP" value={pod.status.hostIP ?? '—'} mono copyable />
              <MetaRow label="QoS Class" value={pod.status.qosClass ?? '—'} />
              <MetaRow label="Created" value={formatAge(pod.metadata.creationTimestamp) + ' ago'} />
              <MetaRow label="Restart Policy" value={String(pod.spec.restartPolicy ?? 'Always')} />
            </dl>
          </div>

          {/* Containers */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Containers</h4>
                <button
                  onClick={() => setShowAnalyzer(!showAnalyzer)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all border
                    ${showAnalyzer
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100/50 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}
                >
                  <Activity className={`w-3 h-3 ${showAnalyzer ? 'animate-pulse' : ''}`} />
                  Analyze Restarts
                </button>
              </div>
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
                  <div key={c.name} className="flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-white/[0.03] p-2.5 rounded-xl border border-slate-100 dark:border-white/5">
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

            {showAnalyzer && (
              <div className="mt-6 animate-in fade-in slide-in-from-top-2 duration-300">
                <PodRestartAnalyzer pod={pod} />
              </div>
            )}
          </div>

          {/* Resource requests / limits */}
          {pod.spec.containers.some(c => c.resources?.requests || c.resources?.limits) && (
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-900 shrink-0">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-3">Resources</h4>
              <div className="space-y-2.5">
                {pod.spec.containers.filter(c => c.resources?.requests || c.resources?.limits).map(c => (
                  <div key={c.name} className="bg-slate-50/50 dark:bg-white/[0.03] rounded-xl p-2.5 border border-slate-100 dark:border-white/5">
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono mb-2">{c.name}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {c.resources?.requests?.cpu && (
                        <ResourceLimit label="CPU req" value={c.resources.requests.cpu} />
                      )}
                      {c.resources?.limits?.cpu && (
                        <ResourceLimit label="CPU lim" value={c.resources.limits.cpu} />
                      )}
                      {c.resources?.requests?.memory && (
                        <ResourceLimit label="Mem req" value={c.resources.requests.memory} />
                      )}
                      {c.resources?.limits?.memory && (
                        <ResourceLimit label="Mem lim" value={c.resources.limits.memory} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="px-6 flex items-center gap-6 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
          <TabButton
            active={activeTab === 'logs'}
            onClick={() => setActiveTab('logs')}
            label="Logs"
            icon={<Terminal size={14} />}
          />
          {prometheusAvailable && (
            <TabButton
              active={activeTab === 'metrics'}
              onClick={() => setActiveTab('metrics')}
              label="Metrics"
              icon={<BarChart2 size={14} />}
            />
          )}
          <TabButton
            active={activeTab === 'analysis'}
            onClick={() => setActiveTab('analysis')}
            label="Analysis"
            icon={<Shield size={14} />}
            count={scanResults[pod.metadata.uid]?.summary.errors || 0}
            countType="error"
          />
          <TabButton
            active={activeTab === 'lifecycle'}
            onClick={() => setActiveTab('lifecycle')}
            label="Lifecycle"
            icon={<ClockIcon size={14} />}
          />
        </div>

        {/* Tab Content */}
        {activeTab === 'logs' && (
          <div className={`flex flex-col transition-all duration-500 overflow-hidden ${isStreaming || logs.length > 0 ? 'flex-1 min-h-[300px]' : 'shrink-0'}`}>
            {LogToolbar}

            {(isStreaming || logs.length > 0) && (
              <div className="flex flex-col flex-1 min-h-0 animate-in slide-in-from-bottom-4 duration-500">
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
            )}
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="flex-1 overflow-y-auto scrollbar-hide min-h-0">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Prometheus Metrics</span>
                <PrometheusTimeRangeBar />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TimeSeriesChart
                  queries={[podCpuQuery(pod.metadata.name, pod.metadata.namespace ?? '')]}
                  title="CPU"
                  unit="m"
                />
                <TimeSeriesChart
                  queries={[podMemoryQuery(pod.metadata.name, pod.metadata.namespace ?? '')]}
                  title="Memory"
                  unit=" MiB"
                />
                <TimeSeriesChart
                  queries={[
                    podNetworkRxQuery(pod.metadata.name, pod.metadata.namespace ?? ''),
                    podNetworkTxQuery(pod.metadata.name, pod.metadata.namespace ?? ''),
                  ]}
                  title="Network I/O"
                  unit=" KiB/s"
                  className="col-span-2"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
            {(isScanning && !scanResults[pod.metadata.uid]) ? (
              <div className="flex items-center justify-center h-32">
                <span className="text-[10px] font-bold text-slate-400 animate-pulse">Running analysis…</span>
              </div>
            ) : scanResults[pod.metadata.uid] ? (
              <AnalysisView result={scanResults[pod.metadata.uid]} />
            ) : null}
          </div>
        )}

        {activeTab === 'lifecycle' && (
          <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
            {eventsLoading ? (
              <div className="flex items-center justify-center h-32">
                <span className="text-[10px] font-bold text-slate-400 animate-pulse">Fetching events…</span>
              </div>
            ) : (
              <PodLifecycleTimeline pod={pod} events={events} />
            )}
          </div>
        )}
      </div>

      {/* Premium YAML Modal */}
      {(yamlLoading || yaml !== null || yamlError !== null) && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                  {yamlLoading
                    ? <div className="w-4 h-4 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin" />
                    : <FileCode size={18} className="text-blue-500" />
                  }
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${pod.metadata.name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeYAML}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors focus:outline-none"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 min-h-0 bg-slate-950">
              {yamlError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                    <Activity size={20} className="text-red-400" />
                  </div>
                  <p className="text-sm font-bold text-red-400 uppercase tracking-widest">Failed to load manifest</p>
                  <pre className="text-xs text-slate-400 max-w-lg break-words whitespace-pre-wrap font-mono bg-white/5 p-4 rounded-xl border border-white/5">{yamlError}</pre>
                </div>
              ) : yamlLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : yaml !== null ? (
                <YAMLViewer editable
                  content={yaml}
                  onSave={applyYAML}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ToolbarButton({ onClick, icon, title, active }: { onClick: () => void; icon: React.ReactNode; title: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-all hover:bg-slate-200 dark:hover:bg-slate-800 
                 ${active ? 'text-blue-500 bg-blue-500/10' : 'text-slate-500'}`}
    >
      {icon}
    </button>
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

function MetaRow({ label, value, mono, copyable }: { label: string; value: string; mono?: boolean; copyable?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-tighter mb-0.5">{label}</dt>
      <dd className={`text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate flex items-center gap-1 ${mono ? 'font-mono' : ''}`}>
        <span className="truncate">{value}</span>
        {copyable && value !== '—' && <CopyButton value={value} size={11} />}
      </dd>
    </div>
  )
}

function ResourceLimit({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-tighter">{label}</dt>
      <dd className="text-[10px] font-bold font-mono text-slate-600 dark:text-slate-300">{value}</dd>
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  label: string
  icon: React.ReactNode
  count?: number
  countType?: 'error' | 'warning' | 'info'
}

function TabButton({ active, onClick, label, icon, count, countType }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`relative px-1 py-4 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all
        ${active ? 'text-blue-500' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
    >
      <span className={active ? 'text-blue-500' : 'text-slate-400'}>{icon}</span>
      {label}
      {count !== undefined && count > 0 && (
        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black leading-none
          ${countType === 'error' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
          {count}
        </span>
      )}
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full animate-in fade-in slide-in-from-bottom-1 duration-300" />
      )}
    </button>
  )
}
