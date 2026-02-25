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
      await window.kubectl.stopLogs(activeStreamId).catch(() => {})
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
    <div className="flex flex-col w-[440px] min-w-[340px] border-l border-white/10 bg-gray-900/70 h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white font-mono truncate">{pod.metadata.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{pod.metadata.namespace}</p>
          </div>
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${podPhaseBg(phase)}`}>
            {phase}
          </span>
        </div>
      </div>

      {/* Metadata */}
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Info</h4>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <MetaRow label="Node" value={pod.spec.nodeName ?? '—'} mono />
          <MetaRow label="Pod IP" value={pod.status.podIP ?? '—'} mono />
          <MetaRow label="Host IP" value={pod.status.hostIP ?? '—'} mono />
          <MetaRow label="QoS" value={pod.status.qosClass ?? '—'} />
          <MetaRow label="Created" value={formatAge(pod.metadata.creationTimestamp) + ' ago'} />
          <MetaRow label="Restart" value={String(pod.spec.restartPolicy ?? 'Always')} />
        </dl>
      </div>

      {/* Containers */}
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Containers</h4>
          {pod.spec.containers.length > 1 && (
            <select
              value={selectedContainer}
              onChange={e => setSelectedContainer(e.target.value)}
              className="bg-gray-800 text-white text-xs rounded px-2 py-0.5 border border-white/10 focus:outline-none"
            >
              {pod.spec.containers.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="space-y-1.5">
          {pod.spec.containers.map(c => {
            const status = pod.status.containerStatuses?.find(s => s.name === c.name)
            return (
              <div key={c.name} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-white font-mono truncate">{c.name}</p>
                  <p className="text-xs text-gray-500 truncate">{c.image}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {status && (
                    <>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.ready ? 'bg-green-400' : 'bg-red-400'}`} />
                      {status.restartCount > 0 && (
                        <span className="text-xs text-orange-400">{status.restartCount}↺</span>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => openExec({
                      pod: pod.metadata.name,
                      container: c.name,
                      namespace: pod.metadata.namespace ?? selectedNamespace ?? ''
                    })}
                    className="text-xs text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded
                               bg-blue-500/10 hover:bg-blue-500/20 transition-colors border border-blue-500/20"
                    title="Exec into container"
                  >
                    $ shell
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Log viewer */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Logs</h4>
            {isStreaming && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                live
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)}
                className="w-3 h-3 accent-blue-500" />
              Scroll
            </label>
            <button onClick={() => setLogs([])}
              className="text-xs text-gray-400 hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-white/5">
              Clear
            </button>
            <button
              onClick={startStream}
              disabled={isStreaming}
              className="text-xs text-gray-300 hover:text-white bg-white/5 hover:bg-white/10
                         px-2 py-0.5 rounded transition-colors disabled:opacity-50 border border-white/10"
            >
              {isStreaming ? 'Live…' : 'Restart'}
            </button>
          </div>
        </div>

        {logError && (
          <div className="mx-3 mt-2 shrink-0 px-3 py-2 bg-red-900/40 border border-red-500/30 rounded text-red-300 text-xs">
            {logError}
          </div>
        )}

        <pre
          ref={logContainerRef}
          className="flex-1 overflow-auto p-3 font-mono text-xs text-green-300 leading-relaxed bg-black/40 whitespace-pre-wrap break-all"
          onScroll={e => {
            const el = e.currentTarget
            setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
          }}
        >
          {logs.length === 0
            ? (isStreaming ? '# Waiting for logs…\n' : '# No logs\n')
            : logs.join('\n')}
        </pre>
      </div>
    </div>
  )
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`text-xs text-gray-200 truncate ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
