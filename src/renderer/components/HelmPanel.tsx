import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '../store'
import type { HelmRelease, HelmHistoryEntry } from '../types'
import { formatAge } from '../types'

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  const cls =
    s === 'deployed'   ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
    s === 'failed'     ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
    s === 'pending-install' || s === 'pending-upgrade' || s === 'pending-rollback'
                       ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
    s === 'uninstalling' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' :
    s === 'superseded' ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' :
                         'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  )
}

// ─── Drawer (detail panel) ────────────────────────────────────────────────────

type DrawerTab = 'overview' | 'values' | 'history'

function ReleaseDrawer({
  release,
  context,
  onClose,
  onUninstall
}: {
  release: HelmRelease
  context: string
  onClose: () => void
  onUninstall: (r: HelmRelease) => void
}) {
  const [tab, setTab] = useState<DrawerTab>('overview')
  const [values, setValues] = useState<string | null>(null)
  const [history, setHistory] = useState<HelmHistoryEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null)
  const [rollingBack, setRollingBack] = useState(false)
  const [rbError, setRbError] = useState<string | null>(null)

  useEffect(() => {
    if (tab === 'values' && values === null) {
      window.helm.values(context, release.namespace, release.name).then(setValues).catch(() => setValues('{}'))
    }
    if (tab === 'history' && history.length === 0) {
      setLoadingHistory(true)
      window.helm.history(context, release.namespace, release.name)
        .then(raw => setHistory(raw as HelmHistoryEntry[]))
        .catch(() => setHistory([]))
        .finally(() => setLoadingHistory(false))
    }
  }, [tab])

  const handleRollback = async () => {
    if (rollbackTarget === null) return
    setRollingBack(true)
    setRbError(null)
    try {
      await window.helm.rollback(context, release.namespace, release.name, rollbackTarget)
      setRollbackTarget(null)
      // Refresh history
      const raw = await window.helm.history(context, release.namespace, release.name)
      setHistory(raw as HelmHistoryEntry[])
    } catch (e) {
      setRbError(e instanceof Error ? e.message : 'Rollback failed')
    } finally {
      setRollingBack(false)
    }
  }

  const TABS: DrawerTab[] = ['overview', 'values', 'history']

  return (
    <div className="flex flex-col w-[520px] min-w-[400px] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 h-full shadow-2xl">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono truncate">{release.name}</h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <StatusBadge status={release.status} />
              <span className="text-[10px] text-slate-400 dark:text-slate-500">{release.namespace}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Rev {release.revision}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onUninstall(release)}
              className="px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              Uninstall
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-px">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >{t}</button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && (
          <div className="px-5 py-4 space-y-1">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Release Info</p>
            {[
              { label: 'Chart', value: release.chart },
              { label: 'App Version', value: release.app_version || '—' },
              { label: 'Namespace', value: release.namespace },
              { label: 'Revision', value: release.revision },
              { label: 'Status', value: <StatusBadge status={release.status} /> },
              { label: 'Updated', value: release.updated ? formatAge(release.updated) + ' ago' : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                <span className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0">{label}</span>
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200 text-right">{value}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'values' && (
          <div className="p-4">
            {values === null ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-5 h-5 border-2 border-slate-200 dark:border-slate-700 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : (
              <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 overflow-auto whitespace-pre-wrap break-all">
                {values}
              </pre>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="px-5 py-4">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Revision History</p>

            {rbError && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40">
                <p className="text-xs text-red-600 dark:text-red-400">{rbError}</p>
              </div>
            )}

            {loadingHistory ? (
              <div className="flex items-center justify-center h-24">
                <div className="w-5 h-5 border-2 border-slate-200 dark:border-slate-700 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">No history available</p>
            ) : (
              <div className="space-y-2">
                {[...history].reverse().map((entry) => (
                  <div key={entry.revision}
                    className={`rounded-xl p-3 border transition-colors ${
                      rollbackTarget === entry.revision
                        ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Rev {entry.revision}</span>
                          <StatusBadge status={entry.status} />
                        </div>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">{entry.chart}</p>
                        {entry.description && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 italic">{entry.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          {entry.updated ? formatAge(entry.updated) + ' ago' : ''}
                        </span>
                        {entry.status !== 'superseded' && (
                          <button
                            onClick={() => setRollbackTarget(rollbackTarget === entry.revision ? null : entry.revision)}
                            className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {rollbackTarget === entry.revision ? 'Cancel' : 'Rollback here'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {rollbackTarget !== null && (
              <div className="mt-4 flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-xl">
                <span className="text-xs text-amber-700 dark:text-amber-300 flex-1">
                  Roll back <strong>{release.name}</strong> to revision <strong>{rollbackTarget}</strong>?
                </span>
                <button
                  onClick={handleRollback}
                  disabled={rollingBack}
                  className="px-3 py-1 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                >
                  {rollingBack ? 'Rolling back...' : 'Confirm'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main HelmPanel ───────────────────────────────────────────────────────────

export default function HelmPanel(): JSX.Element {
  const { selectedContext } = useAppStore()
  const [releases, setReleases] = useState<HelmRelease[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<HelmRelease | null>(null)
  const [filter, setFilter] = useState('')
  const [uninstallTarget, setUninstallTarget] = useState<HelmRelease | null>(null)
  const [uninstalling, setUninstalling] = useState(false)

  const load = useCallback(async () => {
    if (!selectedContext) return
    setLoading(true)
    setError(null)
    try {
      const raw = await window.helm.list(selectedContext)
      setReleases(raw as HelmRelease[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to list Helm releases')
    } finally {
      setLoading(false)
    }
  }, [selectedContext])

  useEffect(() => { load() }, [load])

  const handleUninstall = async () => {
    if (!uninstallTarget || !selectedContext) return
    setUninstalling(true)
    try {
      await window.helm.uninstall(selectedContext, uninstallTarget.namespace, uninstallTarget.name)
      if (selected?.name === uninstallTarget.name) setSelected(null)
      setUninstallTarget(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Uninstall failed')
      setUninstallTarget(null)
    } finally {
      setUninstalling(false)
    }
  }

  const filtered = releases.filter(r =>
    r.name.toLowerCase().includes(filter.toLowerCase()) ||
    r.namespace.toLowerCase().includes(filter.toLowerCase()) ||
    r.chart.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="flex flex-1 min-w-0 min-h-0">
      {/* List */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/30 shrink-0">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-slate-400">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Helm Releases</h2>
            {!loading && (
              <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full font-bold">
                {filtered.length}
              </span>
            )}
          </div>
          <div className="flex-1" />
          <div className="relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              className="absolute left-2.5 top-2 text-slate-400 pointer-events-none">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter releases..."
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                         rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500
                         focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-52"
            />
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300
                       hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-40">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              className={loading ? 'animate-spin' : ''}>
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {!selectedContext ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="opacity-40">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
              </svg>
              <p className="text-sm font-medium">Select a cluster to view Helm releases</p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
              <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm font-medium">Loading releases...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
              <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-red-400">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Helm not available</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm leading-relaxed">{error}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                  Make sure helm is installed. Set the path in Settings if needed.
                </p>
              </div>
              <button onClick={load} className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors">
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="opacity-40">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
              </svg>
              <p className="text-sm font-medium">{filter ? 'No releases match' : 'No Helm releases found'}</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  {['Name', 'Namespace', 'Chart', 'Version', 'Status', 'Updated'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const isActive = selected?.name === r.name && selected?.namespace === r.namespace
                  return (
                    <tr
                      key={`${r.namespace}/${r.name}`}
                      onClick={() => setSelected(isActive ? null : r)}
                      className={`border-b border-slate-100 dark:border-slate-800/50 cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{r.name}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.namespace}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 font-mono whitespace-nowrap">{r.chart}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.app_version || '—'}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-2.5 text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        {r.updated ? formatAge(r.updated) + ' ago' : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Drawer — key forces full remount on release change, resetting all tab state */}
      {selected && selectedContext && (
        <ReleaseDrawer
          key={`${selected.namespace}/${selected.name}`}
          release={selected}
          context={selectedContext}
          onClose={() => setSelected(null)}
          onUninstall={setUninstallTarget}
        />
      )}

      {/* Uninstall confirm modal */}
      {uninstallTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-red-500">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Uninstall Release</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">This will remove all Kubernetes resources</p>
              </div>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 mb-5">
              Uninstall <span className="font-mono font-bold text-slate-900 dark:text-white">{uninstallTarget.name}</span>{' '}
              from namespace <span className="font-mono text-slate-600 dark:text-slate-300">{uninstallTarget.namespace}</span>?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setUninstallTarget(null)} disabled={uninstalling}
                className="flex-1 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-40">
                Cancel
              </button>
              <button onClick={handleUninstall} disabled={uninstalling}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-40">
                {uninstalling ? 'Removing...' : 'Uninstall'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
