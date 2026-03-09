import React, { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store'
import type { KubeEvent } from '../types'
import { formatAge } from '../types'

type EventFilter = 'all' | 'Warning' | 'Normal'

export default function EventsView(): JSX.Element {
  const { events, loadSection, loadingResources, selectedNamespace, refresh } = useAppStore()
  const [filter, setFilter] = useState<EventFilter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { loadSection('events') }, [selectedNamespace])

  const warnings = useMemo(() => events.filter(e => e.type === 'Warning').length, [events])
  const filtered = useMemo(() => events
    .filter(e => filter === 'all' || e.type === filter)
    .filter(e => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        e.involvedObject.name.toLowerCase().includes(q) ||
        (e.reason ?? '').toLowerCase().includes(q) ||
        (e.message ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      const ta = new Date(a.lastTimestamp ?? a.firstTimestamp ?? a.eventTime ?? 0).getTime()
      const tb = new Date(b.lastTimestamp ?? b.firstTimestamp ?? b.eventTime ?? 0).getTime()
      return tb - ta
    }), [events, filter, search])

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-[hsl(var(--bg-dark))] h-full transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-white/5 shrink-0 bg-white/5 backdrop-blur-xl">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight leading-none">Events</h2>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-2.5 flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-600" />
            {selectedNamespace} · {events.length} total{warnings > 0 ? ` · ${warnings} warnings` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter events..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 text-[11px] font-bold rounded-xl px-4 py-2.5 border border-transparent
                       focus:border-blue-500/50 focus:outline-none focus:ring-4 focus:ring-blue-500/10 w-48 transition-all placeholder-slate-400 dark:placeholder-slate-600"
          />
          {/* Filter tabs */}
          <div className="flex rounded-xl overflow-hidden glass-panel border border-slate-200 dark:border-white/5 p-1 bg-white/5">
            {(['all', 'Warning', 'Normal'] as EventFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all rounded-lg ${filter === f
                    ? f === 'Warning' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
              >
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
          <button
            onClick={refresh}
            disabled={loadingResources}
            className="flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300
                       glass-panel hover:bg-white/10 dark:hover:bg-white/5 rounded-xl shadow-sm
                       disabled:opacity-50 active:scale-95 border border-slate-200 dark:border-white/5"
          >
            <span className={`transition-transform duration-700 ${loadingResources ? 'animate-spin inline-block' : 'inline-block'}`}>↻</span>
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loadingResources ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
            <div className="w-6 h-6 border-2 border-gray-700 border-t-gray-400 rounded-full animate-spin" />
            <span className="text-sm">Loading events…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-500">
            <span className="text-3xl opacity-30">◻</span>
            <p className="text-sm">{events.length === 0 ? 'No events' : 'No matches'}</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
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
    <div className={`px-5 py-3 hover:bg-white/3 transition-colors ${isWarning ? 'border-l-2 border-orange-500/50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${isWarning
              ? 'bg-orange-500/20 text-orange-300'
              : 'bg-gray-500/20 text-gray-400'
            }`}>
            {e.type ?? 'Unknown'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-200">{e.reason ?? 'Unknown'}</span>
            <span className="text-xs text-gray-500">
              {e.involvedObject.kind}/{e.involvedObject.name}
            </span>
            {e.involvedObject.fieldPath && (
              <span className="text-xs text-gray-600 font-mono">{e.involvedObject.fieldPath}</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{e.message ?? '—'}</p>
          <div className="flex items-center gap-3 mt-1">
            {e.count && e.count > 1 && (
              <span className="text-xs text-gray-600">× {e.count}</span>
            )}
            {e.source?.component && (
              <span className="text-xs text-gray-600">{e.source.component}</span>
            )}
            {ts && (
              <span className="text-xs text-gray-600">{formatAge(ts)} ago</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
