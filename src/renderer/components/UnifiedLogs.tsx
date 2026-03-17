import React, { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../store'
import { Search, Play, Square, Trash2, Terminal } from 'lucide-react'

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
  const { pods, selectedContext } = useAppStore()
  const [selectedPods, setSelectedPods] = useState<string[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [podSearchTerm, setPodSearchTerm] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const streamIds = useRef<Record<string, string>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const podSearchRef = useRef<HTMLDivElement>(null)
  const [showPodResults, setShowPodResults] = useState(false)

  const availablePods = pods.filter(p => p.status.phase === 'Running')
  
  const filteredPods = podSearchTerm.trim().length > 0 
    ? availablePods.filter(p => 
        p.metadata.name.toLowerCase().includes(podSearchTerm.toLowerCase()) ||
        (p.metadata.namespace || 'default').toLowerCase().includes(podSearchTerm.toLowerCase())
      )
    : []

  useEffect(() => {
    return () => {
      stopAllStreams()
    }
  }, [])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, autoScroll])

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

  // Issue 3 fix: clear selected pods and stop all streams when context changes
  useEffect(() => {
    const cleanup = async () => {
      for (const sid of Object.values(streamIds.current)) {
        await window.kubectl.stopLogs(sid)
      }
      streamIds.current = {}
      setSelectedPods([])
      setLogs([])
      setIsStreaming(false)
    }
    cleanup()
  }, [selectedContext])

  useEffect(() => {
    const syncPods = async () => {
      const existingPodNames = new Set(pods.map(p => p.metadata.name))
      const removedPods = selectedPods.filter(name => !existingPodNames.has(name))

      if (removedPods.length > 0) {
        setSelectedPods(prev => prev.filter(name => existingPodNames.has(name)))

        // Stop streams for removed pods
        for (const name of removedPods) {
          if (streamIds.current[name]) {
            await window.kubectl.stopLogs(streamIds.current[name])
            delete streamIds.current[name]
          }
        }
      }
    }
    syncPods()
  }, [pods])

  const stopAllStreams = async () => {
    for (const sid of Object.values(streamIds.current)) {
      await window.kubectl.stopLogs(sid)
    }
    streamIds.current = {}
    setIsStreaming(false)
  }

  const startStreaming = async () => {
    if (!selectedContext) return
    setIsStreaming(true)
    setLogs([])

    for (let i = 0; i < selectedPods.length; i++) {
        const podName = selectedPods[i]
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
                    const lines = chunk.split('\n').filter(Boolean)
                    const newEntries: LogEntry[] = lines.map(line => ({
                        id: crypto.randomUUID(),
                        podName,
                        containerName,
                        message: line,
                        timestamp: new Date(),
                        color
                    }))
                    setLogs(prev => [...prev, ...newEntries].slice(-1000))
                },
                () => {}
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
    setSelectedPods(prev => 
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    )
  }

  const clearAll = () => {
    setSelectedPods([])
  }

  const filteredLogs = logs.filter(l => 
    l.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.podName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-[hsl(var(--bg-dark))] h-full overflow-hidden transition-colors duration-200">
      {/* Local Controls bar (no PageHeader) */}
      <div className="px-8 py-4 border-b border-slate-100 dark:border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => { if (isStreaming) stopAllStreams(); else startStreaming() }}
            disabled={selectedPods.length === 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-30
              ${isStreaming 
                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20' 
                : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20'}`}
          >
            {isStreaming ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
            {isStreaming ? 'Stop All' : 'Start Stream'}
          </button>
          
          <div className="h-6 w-px bg-slate-100 dark:bg-white/10 mx-1" />
          
          <button
             onClick={() => setLogs([])}
             title="Clear Logs"
             className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
             onClick={() => setAutoScroll(!autoScroll)}
             title={autoScroll ? "Autoscroll On" : "Autoscroll Off"}
             className={`p-2.5 rounded-xl border transition-all ${autoScroll ? 'bg-blue-500/20 border-blue-500/40 text-blue-500 font-bold' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 font-bold'}`}
          >
            <span className="text-[10px] uppercase font-black tracking-tighter">Auto</span>
          </button>
        </div>

        <div className="relative group min-w-[300px]" ref={podSearchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Add pods to stream..."
            value={podSearchTerm}
            onChange={e => {
              setPodSearchTerm(e.target.value)
              setShowPodResults(true)
            }}
            onFocus={() => setShowPodResults(true)}
            disabled={isStreaming}
            className="w-full pl-9 pr-4 py-2 text-[11px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
          
          {/* Search Results (Floating) */}
          {(showPodResults && podSearchTerm.trim().length > 0) && (
            <div className="absolute top-full left-0 right-0 mt-2 max-h-[200px] overflow-y-auto p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex flex-col gap-1">
                {filteredPods.map(p => {
                  const isSelected = selectedPods.includes(p.metadata.name)
                  return (
                    <button
                      key={p.metadata.uid}
                      disabled={isStreaming || isSelected}
                      onClick={() => togglePod(p.metadata.name)}
                      className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-all items-center flex justify-between group/item
                        ${isSelected 
                          ? 'bg-blue-500/10 border-blue-500/10 text-blue-500/50 cursor-default' 
                          : 'bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-blue-500/5 hover:border-blue-500/20 hover:text-blue-400'}`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="truncate">{p.metadata.name}</span>
                        <span className="opacity-40 font-medium whitespace-nowrap text-[9px] uppercase tracking-tighter">[{p.metadata.namespace || 'default'}]</span>
                      </div>
                      {isSelected ? (
                         <span className="text-[8px] uppercase tracking-widest bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400">Syncing</span>
                      ) : (
                         <Play className="w-2.5 h-2.5 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 bg-slate-950">
        {/* Selected Pods Pill Area */}
        <div className="flex items-center gap-3 px-8 py-3 bg-white/[0.02] border-b border-white/[0.05] shrink-0">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">Streams:</span>
          <div className="flex flex-wrap gap-2 overflow-x-auto scrollbar-hide py-1">
            {selectedPods.map((name) => (
              <div
                key={name}
                className="px-3 py-1 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-400 text-[10px] font-black flex items-center gap-2 animate-in zoom-in-95 duration-200"
              >
                <span className="truncate max-w-[150px]">{name}</span>
                <button 
                  disabled={isStreaming}
                  onClick={() => togglePod(name)}
                  className="hover:text-rose-400 transition-colors shrink-0 p-0.5"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
            {selectedPods.length === 0 && (
              <span className="text-[10px] font-bold text-slate-600 italic">No pods active</span>
            )}
          </div>
          {selectedPods.length > 0 && !isStreaming && (
            <button 
              onClick={clearAll} 
              className="ml-auto text-[9px] font-black text-slate-500 hover:text-slate-300 uppercase tracking-widest transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Log Terminal Content */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-auto p-6 font-mono text-[12px] selection:bg-blue-500/30 scroll-smooth leading-relaxed"
        >
          {filteredLogs.map(l => (
            <div key={l.id} className="flex gap-6 py-0.5 hover:bg-white/[0.02] group transition-colors">
              <span className="text-slate-600 shrink-0 select-none w-20 whitespace-nowrap font-medium">
                {l.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className={`shrink-0 font-black truncate w-40 tracking-tight ${l.color}`}>
                {l.podName}
              </span>
              <span className="text-slate-300 break-all">
                {searchTerm ? (
                  l.message.split(new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi')).map((part, i) =>
                    part.toLowerCase() === searchTerm.toLowerCase() 
                      ? <span key={i} className="bg-blue-500/40 text-white px-0.5 rounded-sm">{part}</span> 
                      : <span key={i}>{part}</span>
                  )
                ) : l.message}
              </span>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center gap-6 opacity-20">
              <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-white/10 flex items-center justify-center">
                <Terminal className="w-8 h-8 text-blue-500" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">Stream Pending</p>
            </div>
          )}
        </div>
        
        {/* Terminal Footer / Search */}
        <div className="px-8 py-2 bg-slate-900/50 border-t border-white/[0.05] flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
            <Search size={12} className="text-slate-600" />
            Filter Log Output
          </div>
          <input
            type="text"
            placeholder="Search within logs..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-[11px] font-bold text-slate-300 placeholder:text-slate-700 font-mono"
          />
        </div>
      </div>
    </div>
  )
}
