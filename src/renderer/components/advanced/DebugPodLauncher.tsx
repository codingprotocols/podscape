import React, { useState, useRef } from 'react'
import { Search, Terminal, Plus, Trash2, Play, Power, Box, Cpu, Database, AlertCircle, X, RefreshCw, ChevronRight } from 'lucide-react'
import { useAppStore } from '../../store'
import PageHeader from '../core/PageHeader'
import type { DebugPodEntry } from '../../types'

const DEBUG_IMAGES = [
  {
    name: 'nicolaka/netshoot',
    label: 'Netshoot',
    description: 'Full network debugging toolkit',
    tools: ['curl', 'dig', 'tcpdump', 'netcat', 'nmap', 'ping', 'traceroute', 'iptables', 'ss'],
    recommended: true,
  },
  {
    name: 'busybox',
    label: 'BusyBox',
    description: 'Minimal toolkit, fast to pull',
    tools: ['nc', 'ping', 'nslookup', 'wget', 'telnet'],
    recommended: false,
  },
  {
    name: 'alpine:3',
    label: 'Alpine',
    description: 'Lightweight with apk package manager',
    tools: ['ping', 'wget', 'nc', 'nslookup'],
    recommended: false,
  },
  {
    name: 'ubuntu:22.04',
    label: 'Ubuntu',
    description: 'Full Linux environment with apt',
    tools: ['curl', 'ping', 'nc', 'wget', 'apt-get'],
    recommended: false,
  },
] as const

function generatePodName() {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `podscape-debug-${suffix}`
}

function StatusBadge({ status }: { status: DebugPodEntry['status'] }) {
  if (status === 'creating') return (
    <span className="flex items-center gap-1.5 text-[10px] font-black text-blue-400 uppercase tracking-wider">
      <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
      Creating
    </span>
  )
  if (status === 'running') return (
    <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-400 uppercase tracking-wider">
      <span className="w-2 h-2 rounded-full bg-emerald-400" />
      Running
    </span>
  )
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-black text-red-400 uppercase tracking-wider">
      <span className="w-2 h-2 rounded-full bg-red-400" />
      Error
    </span>
  )
}

export default function DebugPodLauncher() {
  const {
    selectedContext, selectedNamespace, namespaces,
    debugPods, addDebugPod, removeDebugPod, updateDebugPod,
    openExec, deleteResource,
  } = useAppStore()

  const [selectedImage, setSelectedImage] = useState<string>(DEBUG_IMAGES[0].name)
  const [customImage, setCustomImage] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [targetNs, setTargetNs] = useState('')
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const isMountedRef = useRef(true)
  React.useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  const effectiveNs = targetNs || (selectedNamespace === '_all' ? 'default' : (selectedNamespace ?? 'default'))
  const effectiveImage = useCustom ? customImage : selectedImage
  const imageLabel = useCustom ? (customImage || 'Custom') : (DEBUG_IMAGES.find(i => i.name === selectedImage)?.label ?? selectedImage)

  const launch = async () => {
    if (!selectedContext || !effectiveImage.trim()) return
    setLaunching(true)
    setLaunchError(null)
    const name = generatePodName()
    const entry: DebugPodEntry = {
      name, namespace: effectiveNs, image: effectiveImage,
      imageLabel, launchedAt: new Date(), status: 'creating',
    }
    addDebugPod(entry)
    try {
      await window.kubectl.createDebugPod(selectedContext, effectiveNs, effectiveImage, name)
      
      // Wait for pod to be running — exponential backoff, 250 ms → ×1.5 → 5 s cap
      let isReady = false
      let backoff = 250
      const maxBackoff = 5000
      const maxAttempts = 40  // ~90 s worst-case at 5 s cap
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, backoff))
        backoff = Math.min(backoff * 1.5, maxBackoff)

        if (!isMountedRef.current) break  // component unmounted — stop polling

        const pods = await window.kubectl.getPods(selectedContext, effectiveNs) as any[]
        if (!isMountedRef.current) break
        const p = pods.find(p => p.metadata?.name === name)
        if (p?.status?.phase === 'Running') {
          isReady = true
          break
        }
      }

      if (!isMountedRef.current) return

      if (!isReady) {
        throw new Error('Pod did not become ready in time')
      }

      updateDebugPod(name, { status: 'running' })
      // Auto-open exec into the newly ready pod
      openExec({ pod: name, container: 'debug', namespace: effectiveNs })
    } catch (err) {
      if (!isMountedRef.current) return
      updateDebugPod(name, { status: 'error', error: (err as Error).message })
      setLaunchError((err as Error).message)
    } finally {
      if (isMountedRef.current) setLaunching(false)
    }
  }

  const connect = (pod: DebugPodEntry) => {
    openExec({ pod: pod.name, container: 'debug', namespace: pod.namespace })
  }

  const stop = async (pod: DebugPodEntry) => {
    removeDebugPod(pod.name)
    try {
      await deleteResource('pod', pod.name, false, pod.namespace)
    } catch { /* ignore — pod may already be gone */ }
  }

  const stopAll = async () => {
    const running = debugPods.filter(p => p.status !== 'creating')
    for (const pod of running) await stop(pod)
  }

  const nsList = namespaces.map(n => n.metadata.name)

  return (
    <div className="flex-1 flex flex-col h-full bg-[hsl(var(--bg-dark))] overflow-hidden">
      <PageHeader
        title="Debug Pod Launcher"
        subtitle="Launch ephemeral pods with network debugging tools & interactive shells"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-3xl mx-auto w-full">

        {/* Image selector */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 space-y-4">
          <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Debug Image</h2>

          <div className="grid grid-cols-2 gap-2">
            {DEBUG_IMAGES.map(img => (
              <button
                key={img.name}
                onClick={() => { setSelectedImage(img.name); setUseCustom(false) }}
                className={`relative p-4 rounded-xl border text-left transition-all ${!useCustom && selectedImage === img.name
                  ? 'border-amber-500/50 bg-amber-500/10'
                  : 'border-white/5 bg-white/[0.02] hover:border-white/10'
                  }`}
              >
                {img.recommended && (
                  <span className="absolute top-2 right-2 text-[9px] font-black text-amber-400 uppercase tracking-wider bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                    Recommended
                  </span>
                )}
                <p className={`text-xs font-black mb-0.5 ${!useCustom && selectedImage === img.name ? 'text-amber-300' : 'text-slate-300'}`}>
                  {img.label}
                </p>
                <p className="text-[10px] text-slate-500 mb-2">{img.description}</p>
                <div className="flex flex-wrap gap-1">
                  {img.tools.slice(0, 4).map(t => (
                    <span key={t} className="text-[9px] font-mono text-slate-600 bg-white/5 px-1.5 py-0.5 rounded">{t}</span>
                  ))}
                  {img.tools.length > 4 && (
                    <span className="text-[9px] text-slate-600">+{img.tools.length - 4}</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Custom image */}
          <div>
            <button
              onClick={() => setUseCustom(u => !u)}
              className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-wider transition-colors ${useCustom ? 'text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <div className={`w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center transition-colors ${useCustom ? 'border-amber-500 bg-amber-500' : 'border-slate-600'}`}>
                {useCustom && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5"><polyline points="20 6 9 17 4 12" /></svg>}
              </div>
              Use custom image
            </button>
            {useCustom && (
              <input
                type="text"
                autoFocus
                placeholder="e.g. my-registry.io/debug:latest"
                value={customImage}
                onChange={e => setCustomImage(e.target.value)}
                className="mt-2 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-mono text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-all"
              />
            )}
          </div>
        </div>

        {/* Namespace */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 space-y-3">
          <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Namespace</h2>
          {nsList.length > 0 ? (
            <select
              value={targetNs || effectiveNs}
              onChange={e => setTargetNs(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-xl text-xs font-mono text-slate-300 focus:outline-none focus:border-amber-500/50 transition-all"
            >
              {nsList.map(ns => <option key={ns} value={ns}>{ns}</option>)}
            </select>
          ) : (
            <input
              type="text"
              placeholder="default"
              value={targetNs}
              onChange={e => setTargetNs(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/5 rounded-xl text-xs font-mono text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-all"
            />
          )}
          <p className="text-[10px] text-slate-600">Pod will be created in <span className="text-slate-400 font-mono">{effectiveNs}</span></p>
        </div>

        {/* Launch button */}
        <div className="space-y-2">
          {launchError && (
            <div className="px-4 py-3 rounded-xl bg-red-950/30 border border-red-900/40 text-xs text-red-400 break-words">
              {launchError}
            </div>
          )}
          <button
            onClick={launch}
            disabled={launching || !selectedContext || (useCustom && !customImage.trim())}
            className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            {launching
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating pod…</>
              : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> Launch Debug Pod</>
            }
          </button>
          <p className="text-center text-[10px] text-slate-600">
            Creates a pod running <code className="font-mono">sleep infinity</code> — you'll be dropped into an interactive shell.
          </p>
        </div>

        {/* Active pods */}
        {debugPods.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                Active Debug Pods
                <span className="ml-2 text-slate-600 font-mono normal-case">({debugPods.length})</span>
              </h2>
              {debugPods.some(p => p.status !== 'creating') && (
                <button
                  onClick={stopAll}
                  className="text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-red-400 transition-colors"
                >
                  Stop All
                </button>
              )}
            </div>

            <div className="space-y-2">
              {debugPods.map(pod => (
                <div
                  key={pod.name}
                  className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black font-mono text-slate-200 truncate">{pod.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-slate-500 font-mono">{pod.namespace}</span>
                        <span className="text-[10px] text-slate-600">·</span>
                        <span className="text-[10px] text-slate-500">{pod.imageLabel}</span>
                        <span className="text-[10px] text-slate-600">·</span>
                        <span className="text-[10px] text-slate-600">{pod.launchedAt.toLocaleTimeString()}</span>
                      </div>
                      {pod.error && (
                        <p className="text-[10px] text-red-400 mt-1 break-words">{pod.error}</p>
                      )}
                    </div>
                    <StatusBadge status={pod.status} />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => connect(pod)}
                      disabled={pod.status !== 'running'}
                      className="flex-1 py-2 text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all flex items-center justify-center gap-1.5"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
                      Connect
                    </button>
                    <button
                      onClick={() => stop(pod)}
                      disabled={pod.status === 'creating'}
                      className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-400 border border-red-900/40 hover:bg-red-950/30 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all"
                    >
                      Stop
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-center text-[10px] text-slate-600">
              Debug pods keep running until you click Stop. They use your cluster resources.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
