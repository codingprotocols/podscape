import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { KubePod } from '../types'
import { podPhaseBg, formatAge } from '../types'
import { useAppStore } from '../store'

interface Props {
  pod: KubePod
}

export default function PodDetail({ pod }: Props): JSX.Element {
  const { selectedContext, selectedNamespace, openExec } = useAppStore()
  const [logs, setLogs] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [selectedContainer, setSelectedContainer] = useState(pod.spec.containers[0]?.name ?? '')
  const logContainerRef = useRef<HTMLPreElement>(null)

  const stopStream = useCallback(async () => {
    if (activeStreamId) {
      await window.kubectl.stopLogs(activeStreamId).catch(() => { })
      setActiveStreamId(null)
    }
    setIsStreaming(false)
  }, [activeStreamId])

  const startStream = useCallback(async () => {
    await stopStream()
    setLogs([])
    setLogError(null)
    setIsStreaming(true)
    try {
      const ctx = selectedContext!
      const ns = selectedNamespace!
      const streamId = await window.kubectl.streamLogs(
        ctx, ns, pod.metadata.name, selectedContainer,
        (chunk) => setLogs(prev => [...prev, ...chunk.split('\n')].slice(-2000)),
        () => { setIsStreaming(false); setActiveStreamId(null) }
      )
      setActiveStreamId(streamId)
    } catch (err) {
      setLogError(err instanceof Error ? err.message : String(err))
      setIsStreaming(false)
    }
  }, [selectedContext, selectedNamespace, pod, selectedContainer, stopStream])

  useEffect(() => {
    startStream()
    return () => { stopStream() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pod.metadata.uid, selectedContainer])

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const phase = pod.status.phase ?? 'Unknown'

  return (
    <div className="flex flex-col w-[460px] min-w-[360px] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 h-full transition-colors duration-200">
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
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em]">Logs</h4>
            {isStreaming && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setLogs([])}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors uppercase tracking-wider">
              Clear
            </button>
            <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 cursor-pointer select-none">
              <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)}
                className="w-3 h-3 accent-blue-500 rounded border-slate-300 dark:border-slate-700" />
              SCROLL
            </label>
            <button
              onClick={startStream}
              disabled={isStreaming}
              className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300
                         bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800
                         rounded-lg transition-colors disabled:opacity-50 border border-slate-200 dark:border-slate-800"
            >
              {isStreaming ? 'STREAMING…' : 'RESTART'}
            </button>
          </div>
        </div>

        {logError && (
          <div className="mx-6 mt-3 shrink-0 px-4 py-2.5 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl text-red-600 dark:text-red-400 text-[10px] font-bold">
            {logError}
          </div>
        )}

        <div className="flex-1 relative m-6 mt-3 mb-6 bg-slate-950 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800/50 shadow-inner">
          <pre
            ref={logContainerRef}
            className="absolute inset-0 overflow-auto p-4 font-mono text-[11px] text-emerald-400/90 leading-relaxed whitespace-pre-wrap break-all scrollbar-hide"
            onScroll={e => {
              const el = e.currentTarget
              setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
            }}
          >
            {logs.length === 0
              ? (isStreaming ? <span className="text-slate-600 animate-pulse"># Waiting for logs…\n</span> : <span className="text-slate-600"># No logs available\n</span>)
              : logs.join('\n')}
          </pre>
        </div>
      </div>
    </div>
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
