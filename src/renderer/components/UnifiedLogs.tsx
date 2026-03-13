import React, { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../store'
import { ICONS, Icon } from './Icons'
import { Search, Play, Square, Trash2 } from 'lucide-react'

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
        const containerName = pod.spec.containers[0].name
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
      {/* Header / Controls */}
      <div className="flex flex-col px-6 py-5 border-b border-slate-200 dark:border-white/5 bg-slate-50/80 dark:bg-white/5 backdrop-blur-md shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter flex items-center gap-3">
              <Icon path={ICONS.terminal} size={20} className="text-blue-500" />
              Unified Log Streamer
            </h2>
            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-[0.2em] flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
              {isStreaming ? `${selectedPods.length} pods active` : `${selectedPods.length} pods selected`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (isStreaming) stopAllStreams(); else startStreaming() }}
              disabled={selectedPods.length === 0}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-30
                ${isStreaming 
                  ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20' 
                  : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20'}`}
            >
              {isStreaming ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
              {isStreaming ? 'Stop All' : 'Start Stream'}
            </button>
            <button
               onClick={() => setLogs([])}
               title="Clear Logs"
               className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
               onClick={() => setAutoScroll(!autoScroll)}
               title={autoScroll ? "Autoscroll On" : "Autoscroll Off"}
               className={`p-2 rounded-xl border transition-all ${autoScroll ? 'bg-blue-500/20 border-blue-500/40 text-blue-500' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* Row 1: Searches */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pod Selection Search */}
            <div className="flex flex-col gap-2 min-w-0 relative">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Find Pods</span>
              <div className="relative group">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Search pod name or namespace..."
                  value={podSearchTerm}
                  onChange={e => setPodSearchTerm(e.target.value)}
                  disabled={isStreaming}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-colors"
                />
              </div>

              {/* Search Results (Floating) */}
              {podSearchTerm.trim().length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 max-h-[140px] overflow-y-auto p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-blue-500/20 shadow-2xl z-50 rounded-xl">
                  <div className="flex flex-col gap-1">
                    {filteredPods.map(p => {
                      const isSelected = selectedPods.includes(p.metadata.name)
                      return (
                        <button
                          key={p.metadata.uid}
                          disabled={isStreaming || isSelected}
                          onClick={() => togglePod(p.metadata.name)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all items-center flex justify-between
                            ${isSelected 
                              ? 'bg-blue-500/10 border-blue-500/20 text-blue-500/50 cursor-default' 
                              : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-blue-500/5 dark:hover:bg-blue-500/20 hover:border-blue-500/20 dark:hover:border-blue-500/40 hover:text-blue-500 dark:hover:text-blue-400'}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[200px]">{p.metadata.name}</span>
                            <span className="opacity-40 font-medium whitespace-nowrap text-[9px]">[{p.metadata.namespace || 'default'}]</span>
                          </div>
                          {isSelected ? (
                             <span className="text-[8px] uppercase tracking-widest bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400">Selected</span>
                          ) : (
                             <Play className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100" />
                          )}
                        </button>
                      )
                    })}
                    {filteredPods.length === 0 && (
                      <p className="text-[10px] text-slate-400 dark:text-slate-600 text-center py-2 font-bold italic">No matches for "{podSearchTerm}"</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Log Search */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Search Logs</span>
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-500" />
                <input
                  type="text"
                  placeholder="Filter output..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-lg text-[10px] font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Full-width Selected Pods Area */}
          <div className="flex flex-col gap-2 p-3 bg-slate-100/50 dark:bg-black/30 rounded-2xl border border-slate-200 dark:border-white/5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Selected Pods</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-black">{selectedPods.length}</span>
              </div>
              {selectedPods.length > 0 && !isStreaming && (
                <button 
                  onClick={clearAll} 
                  className="flex items-center gap-2 text-[9px] font-black text-rose-500/70 hover:text-rose-400 uppercase tracking-widest transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Deselect All
                </button>
              )}
            </div>
            
            <div className="flex flex-wrap gap-2 max-h-[80px] overflow-y-auto scrollbar-thin content-start pr-2">
              {selectedPods.map((name) => (
                <div
                  key={name}
                  className="px-2.5 py-1 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-400 text-[10px] font-black flex items-center gap-2 animate-in zoom-in-95 duration-200 group/pill"
                >
                  <span className="truncate max-w-[200px]">{name}</span>
                  <button 
                    disabled={isStreaming}
                    onClick={() => togglePod(name)}
                    className="hover:text-rose-400 transition-colors shrink-0 p-0.5"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              {selectedPods.length === 0 && (
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-600 italic py-1">No pods selected. Search at the top to add pods.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Log Terminal */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-auto p-4 font-mono text-[12px] selection:bg-blue-500/30 bg-slate-950 border-t border-slate-200 dark:border-white/5 shadow-inner scroll-smooth"
      >
        {filteredLogs.map(l => (
          <div key={l.id} className="flex gap-4 py-0.5 hover:bg-white/[0.02] group">
            <span className="text-slate-600 shrink-0 select-none w-16 whitespace-nowrap">
              {l.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className={`shrink-0 font-black truncate w-32 ${l.color}`}>
              [{l.podName}]
            </span>
            <span className="text-slate-300 break-all">
              {searchTerm ? (
                l.message.split(new RegExp(`(${searchTerm})`, 'gi')).map((part, i) => 
                  part.toLowerCase() === searchTerm.toLowerCase() 
                    ? <span key={i} className="bg-blue-500/40 text-white px-0.5 rounded-sm">{part}</span> 
                    : <span key={i}>{part}</span>
                )
              ) : l.message}
            </span>
          </div>
        ))}
        {logs.length === 0 && !isStreaming && (
          <div className="h-full flex flex-col items-center justify-center opacity-20 gap-4">
            <Icon path={ICONS.terminal} size={64} className="text-slate-500" />
            <p className="text-sm font-black uppercase tracking-widest text-slate-400">Select pods to begin streaming</p>
          </div>
        )}
      </div>
    </div>
  )
}
