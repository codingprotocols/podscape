import React, { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store'
import type { KubeEvent } from '../../types'
import { formatAge } from '../../types'
import { Search, Filter, Activity } from 'lucide-react'

type EventFilter = 'all' | 'Warning' | 'Normal'

export default function EventsView(): JSX.Element {
  const { events, loadSection, loadingResources, selectedNamespace } = useAppStore()
  const [filter, setFilter] = useState<EventFilter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { loadSection('events') }, [selectedNamespace])

  const filtered = useMemo(() => events
    .filter(e => filter === 'all' || e.type === filter)
    .filter(e => {
      if (!search) return true
      const msg = (e.message || '').toLowerCase()
      const reason = (e.reason || '').toLowerCase()
      const obj = (e.involvedObject.name || '').toLowerCase()
      const s = search.toLowerCase()
      return msg.includes(s) || reason.includes(s) || obj.includes(s)
    })
    .sort((a, b) => {
      const t1 = new Date(a.lastTimestamp || a.firstTimestamp || a.eventTime || 0).getTime()
      const t2 = new Date(b.lastTimestamp || b.firstTimestamp || b.eventTime || 0).getTime()
      return t2 - t1
    })
  , [events, filter, search])

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[hsl(var(--bg-dark))]">
      {/* Sub-header for local filters */}
      <div className="px-8 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
            <Filter size={12} />
            Filter
          </div>
          <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl">
            {(['all', 'Normal', 'Warning'] as EventFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${filter === f
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Search events..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-[11px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-64"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto scrollbar-hide">
        {loadingResources ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
            <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-[10px] font-bold uppercase tracking-widest animate-pulse">Loading events…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-slate-500">
            <Activity size={40} className="opacity-10" />
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-40">{events.length === 0 ? 'No events found' : 'No matches found'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {filtered.map(event => (
              <EventRow key={event.metadata.uid} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EventRow({ event: e }: { event: KubeEvent }) {
  const isWarning = e.type === 'Warning'
  const ts = e.lastTimestamp ?? e.firstTimestamp ?? e.eventTime ?? ''

  return (
    <div className={`px-8 py-4 hover:bg-white/[0.02] transition-colors group relative ${isWarning ? 'bg-orange-500/[0.02]' : ''}`}>
      {isWarning && <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500/40" />}
      <div className="flex items-start gap-4">
        <div className="shrink-0 mt-1">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider border ${isWarning
              ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
              : 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20'
            }`}>
            {e.type ?? 'Unknown'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap mb-1">
            <span className="text-sm font-black text-slate-800 dark:text-slate-100">{e.reason ?? 'Unknown'}</span>
            <span className="text-[11px] font-bold text-slate-400 font-mono">
              {e.involvedObject.kind}/{e.involvedObject.name}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{e.message ?? '—'}</p>
          <div className="flex items-center gap-4 mt-2">
            {e.count && e.count > 1 && (
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-600 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md">×{e.count}</span>
            )}
            {e.source?.component && (
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-600 uppercase tracking-widest">{e.source.component}</span>
            )}
            {ts && (
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-auto">{formatAge(ts)} ago</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
