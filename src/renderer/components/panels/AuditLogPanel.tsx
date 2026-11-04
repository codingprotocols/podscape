import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { RefreshButton } from '../common'
import PageHeader from '../core/PageHeader'
import type { AuditLogEntry } from '../../../common/constants'

const ACTIONS = [
  'scale', 'delete', 'apply_yaml', 'rollout_restart', 'rollout_undo',
  'cordon_node', 'drain_node', 'trigger_cronjob', 'create_debug_pod',
  'cp_to', 'cp_from', 'exec_start', 'exec_end',
]

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function matchesSearch(entry: AuditLogEntry, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    entry.resource_name.toLowerCase().includes(q) ||
    entry.resource_kind.toLowerCase().includes(q) ||
    entry.namespace.toLowerCase().includes(q) ||
    entry.kube_context.toLowerCase().includes(q) ||
    entry.kube_user.toLowerCase().includes(q) ||
    entry.action.toLowerCase().includes(q)
  )
}

export default function AuditLogPanel(): JSX.Element {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionFilter, setActionFilter] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<'' | 'success' | 'failure' | 'started'>('')
  const [search, setSearch] = useState('')
  // Keyed on the composite row key, not seq: seq resets to 0 on every log
  // rotation, so it is not unique across the merged archive + active list.
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await window.audit.list({
        action: actionFilter || undefined,
        outcome: outcomeFilter || undefined,
        limit: 500,
      })
      setEntries(result)
    } catch (err) {
      setEntries([])
      setLoadError((err as Error)?.message ?? 'Failed to load the audit log')
    } finally {
      setLoading(false)
    }
  }, [actionFilter, outcomeFilter])

  useEffect(() => { load() }, [load])

  const filtered = entries.filter(e => matchesSearch(e, search))

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-[hsl(var(--bg-dark))] overflow-hidden relative h-full transition-colors duration-200">
      <PageHeader
        title="Audit Log"
        subtitle="Every mutating action taken through Podscape, tamper-evidently recorded"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 border-r border-slate-200 dark:border-white/10 pr-6 mr-2">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Entries</span>
            <span className="text-[12px] font-black font-mono text-slate-700 dark:text-slate-300">{entries.length}</span>
          </div>
          <RefreshButton onClick={load} loading={loading} label="Refresh" />
        </div>
      </PageHeader>

      <div className="px-5 py-3 border-b border-slate-200 dark:border-white/[0.05] shrink-0 flex items-center gap-3 bg-white/50 dark:bg-white/[0.005] flex-wrap">
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">All actions</option>
          {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select
          value={outcomeFilter}
          onChange={e => setOutcomeFilter(e.target.value as '' | 'success' | 'failure' | 'started')}
          className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">All outcomes</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="started">Started</option>
        </select>

        <div className="ml-auto relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
          <input
            type="text"
            placeholder="Search resource, context, user…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-56"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-3 text-slate-500 dark:text-slate-600">
          <div className="w-4 h-4 border-2 border-slate-300 dark:border-slate-700 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-xs font-bold">Loading audit log…</span>
        </div>
      ) : loadError ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-red-500/[0.08] border border-red-500/20 max-w-md">
            <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
            <div>
              <p className="text-[11px] font-black text-red-600 dark:text-red-400">Failed to load the audit log</p>
              <p className="text-[10px] text-red-500/60 dark:text-red-400/60 mt-0.5">{loadError}</p>
            </div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-600 py-16">
          <p className="text-xs font-bold">No audit log entries match</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
            <thead className="sticky top-0 bg-slate-100 dark:bg-white/[0.03] z-10">
              <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-500">
                <th className="w-6 px-3 py-2" />
                <th className="px-3 py-2" style={{ width: '15%' }}>Time</th>
                <th className="px-3 py-2" style={{ width: '13%' }}>Action</th>
                <th className="px-3 py-2" style={{ width: '20%' }}>Resource</th>
                <th className="px-3 py-2" style={{ width: '13%' }}>Namespace</th>
                <th className="px-3 py-2" style={{ width: '13%' }}>Context</th>
                <th className="px-3 py-2" style={{ width: '10%' }}>Outcome</th>
                <th className="px-3 py-2 text-right" style={{ width: '8%' }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(entry => {
                const key = `${entry.seq}-${entry.timestamp}-${entry.hash}`
                const expanded = expandedKey === key
                return (
                  <React.Fragment key={key}>
                    <tr
                      onClick={() => setExpandedKey(expanded ? null : key)}
                      className="border-b border-slate-100 dark:border-white/[0.03] hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 text-slate-400">
                        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-slate-500 dark:text-slate-400 truncate">{formatTimestamp(entry.timestamp)}</td>
                      <td className="px-3 py-2 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 truncate">{entry.action}</td>
                      <td className="px-3 py-2 text-[10px] truncate">
                        <span className="text-slate-400 dark:text-slate-500">{entry.resource_kind}/</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{entry.resource_name}</span>
                      </td>
                      <td className="px-3 py-2 text-[10px] text-slate-500 dark:text-slate-400 truncate">{entry.namespace || '—'}</td>
                      <td className="px-3 py-2 text-[10px] text-slate-500 dark:text-slate-400 truncate">{entry.kube_context || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 text-[9px] font-black tracking-widest rounded-md border uppercase ${
                          entry.outcome === 'success'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : entry.outcome === 'failure'
                            ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                            : 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20'
                        }`}>
                          {entry.outcome}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[10px] font-mono text-slate-500 dark:text-slate-400 text-right">{entry.duration_ms}ms</td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-50 dark:bg-white/[0.015]">
                        <td colSpan={8} className="px-8 py-4">
                          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[10px] font-mono">
                            <div><span className="text-slate-400">kube_user:</span> <span className="text-slate-700 dark:text-slate-300">{entry.kube_user || '—'}</span></div>
                            <div><span className="text-slate-400">os_user:</span> <span className="text-slate-700 dark:text-slate-300">{entry.os_user || '—'}</span></div>
                            <div><span className="text-slate-400">client_cert_cn:</span> <span className="text-slate-700 dark:text-slate-300">{entry.kube_client_cert_cn || '—'}</span></div>
                            <div><span className="text-slate-400">seq:</span> <span className="text-slate-700 dark:text-slate-300">{entry.seq}</span></div>
                            {entry.error && (
                              <div className="col-span-2"><span className="text-slate-400">error:</span> <span className="text-red-500 dark:text-red-400">{entry.error}</span></div>
                            )}
                            {Object.keys(entry.params ?? {}).length > 0 && (
                              <div className="col-span-2"><span className="text-slate-400">params:</span> <span className="text-slate-700 dark:text-slate-300">{JSON.stringify(entry.params)}</span></div>
                            )}
                            <div className="col-span-2 truncate"><span className="text-slate-400">prev_hash:</span> <span className="text-slate-600 dark:text-slate-400">{entry.prev_hash}</span></div>
                            <div className="col-span-2 truncate"><span className="text-slate-400">hash:</span> <span className="text-slate-600 dark:text-slate-400">{entry.hash}</span></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
