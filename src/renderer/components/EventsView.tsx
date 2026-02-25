import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { KubeEvent } from '../types'
import { formatAge } from '../types'

type EventFilter = 'all' | 'Warning' | 'Normal'

export default function EventsView(): JSX.Element {
  const { events, loadSection, loadingResources, selectedNamespace, refresh } = useAppStore()
  const [filter, setFilter] = useState<EventFilter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { loadSection('events') }, [selectedNamespace])

  const warnings = events.filter(e => e.type === 'Warning').length
  const filtered = events
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
    })

  return (
    <div className="flex flex-col flex-1 bg-gray-900/50 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white">Events</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {selectedNamespace} · {events.length} total{warnings > 0 ? ` · ${warnings} warnings` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-gray-800 text-white text-xs rounded px-2.5 py-1.5 border border-white/10
                       focus:outline-none focus:ring-1 focus:ring-blue-500 w-36 placeholder-gray-600"
          />
          {/* Filter tabs */}
          <div className="flex rounded overflow-hidden border border-white/10">
            {(['all', 'Warning', 'Normal'] as EventFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  filter === f
                    ? f === 'Warning' ? 'bg-orange-600/30 text-orange-300' : 'bg-blue-600/30 text-blue-300'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {f === 'all' ? 'All' : f}
                {f === 'Warning' && warnings > 0 && (
                  <span className="ml-1.5 bg-orange-500/30 text-orange-300 text-xs px-1 rounded-full">
                    {warnings}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={refresh}
            disabled={loadingResources}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300
                       bg-white/5 hover:bg-white/10 rounded transition-colors disabled:opacity-50 border border-white/10"
          >
            <span className={loadingResources ? 'animate-spin inline-block' : 'inline-block'}>↻</span>
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
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
            isWarning
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
