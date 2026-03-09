import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '../store'
import type { HelmRelease, HelmHistoryEntry } from '../types'
import { formatAge } from '../types'
import LoadingAnimation from './LoadingAnimation'
import YAMLViewer from './YAMLViewer'

// ─── Types ────────────────────────────────────────────────────────────────────

type DrawerTab = 'overview' | 'history' | 'values'

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  const cls =
    s === 'deployed' ? 'bg-emerald-500/10 text-emerald-500 outline-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]' :
      s === 'failed' ? 'bg-red-500/10 text-red-500 outline-red-500/20' :
        s === 'pending-install' || s === 'pending-upgrade' || s === 'pending-rollback'
          ? 'bg-amber-500/10 text-amber-500 outline-amber-500/20' :
          s === 'uninstalling' ? 'bg-orange-500/10 text-orange-500 outline-orange-500/20' :
            s === 'superseded' ? 'bg-slate-500/10 text-white/50 outline-white/10' :
              'bg-blue-500/10 text-blue-500 outline-blue-500/20'

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider outline outline-1 outline-offset-[-1px] transition-all ${cls}`}>
      {status}
    </span>
  )
}

// ─── Release Drawer ───────────────────────────────────────────────────────────

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
    <div className="flex flex-col w-[520px] min-w-[420px] border-l border-slate-100 dark:border-white/5 glass-heavy h-full shadow-2xl scale-in origin-right">
      {/* Header */}
      <div className="px-6 py-6 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-black text-slate-900 dark:text-white font-mono truncate tracking-tight">{release.name}</h3>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusBadge status={release.status} />
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{release.namespace} · REV {release.revision}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={() => onUninstall(release)}
            className="text-[11px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl bg-red-600/10 text-red-500 border border-red-500/20 hover:bg-red-600/20 transition-all">
            Uninstall
          </button>
          <div className="flex-1" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 dark:border-white/5 shrink-0 bg-white/5">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-6 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all ${tab === t ? 'text-blue-500 border-b-2 border-blue-500 bg-blue-500/5' : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-400'
              }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-slate-50/30 dark:bg-black/20">
        {tab === 'overview' && (
          <div className="p-5 space-y-6">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Release Details</h4>
            <div className="grid gap-3">
              {[
                { label: 'Chart', value: release.chart },
                { label: 'App Version', value: release.app_version || '—' },
                { label: 'Namespace', value: release.namespace },
                { label: 'Revision', value: release.revision },
                { label: 'Updated', value: release.updated ? formatAge(release.updated) + ' ago' : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/[0.03] rounded-2xl px-5 py-3 border border-slate-100 dark:border-white/5 flex items-center justify-between gap-4">
                  <span className="text-[10px] font-black text-slate-500 dark:text-slate-600 uppercase tracking-widest">{label}</span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 text-right truncate max-w-[240px] font-mono">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'values' && (
          <div className="p-5">
            {values === null ? (
              <div className="flex items-center justify-center py-20"><LoadingAnimation /></div>
            ) : (
              <div className="bg-slate-950 rounded-2xl border border-white/5 overflow-hidden">
                <YAMLViewer content={values} />
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="p-5 space-y-6">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Revision History</h4>

            {rbError && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold">
                {rbError}
              </div>
            )}

            {loadingHistory ? (
              <div className="flex items-center justify-center py-20"><LoadingAnimation /></div>
            ) : history.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic text-center py-10 uppercase tracking-widest opacity-40">No history available</p>
            ) : (
              <div className="space-y-3">
                {[...history].reverse().map((entry) => (
                  <div key={entry.revision}
                    className={`rounded-2xl p-4 border transition-all ${rollbackTarget === entry.revision
                      ? 'border-blue-500 bg-blue-600/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                      : 'border-slate-100 dark:border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-[14px] font-black text-slate-900 dark:text-white">Rev {entry.revision}</span>
                          <StatusBadge status={entry.status} />
                        </div>
                        <p className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-500 truncate">{entry.chart}</p>
                        {entry.description && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium leading-relaxed italic opacity-80">{entry.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-tighter">
                          {entry.updated ? formatAge(entry.updated) + ' ago' : ''}
                        </span>
                        {entry.status !== 'superseded' && (
                          <button
                            onClick={() => setRollbackTarget(rollbackTarget === entry.revision ? null : entry.revision)}
                            className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border transition-all ${rollbackTarget === entry.revision
                                ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                                : 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20'
                              }`}
                          >
                            {rollbackTarget === entry.revision ? 'Cancel' : 'Rollback'}
                          </button>
                        )}
                      </div>
                    </div>

                    {rollbackTarget === entry.revision && (
                      <div className="mt-4 pt-4 border-t border-blue-500/20 flex items-center gap-3">
                        <p className="text-[10px] font-black uppercase tracking-wide text-blue-400 flex-1">Confirm rollback to this version?</p>
                        <button
                          onClick={handleRollback}
                          disabled={rollingBack}
                          className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 shadow-lg shadow-blue-500/20"
                        >
                          {rollingBack ? 'Processing...' : 'Confirm'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
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
    <div className="flex flex-1 min-w-0 min-h-0 bg-white dark:bg-[hsl(var(--bg-dark))] transition-colors duration-200">
      {/* List */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-8 py-7 border-b border-slate-200 dark:border-white/5 shrink-0 bg-white/5 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none uppercase">Helm Releases</h2>
              {!loading && (
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[.25em] mt-2.5 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                  {filtered.length} installed
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter releases..."
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 text-[11px] font-bold rounded-xl px-4 py-2.5 pl-10
                           border border-transparent focus:border-blue-500/50 focus:outline-none focus:ring-4 focus:ring-blue-500/10 
                           w-64 transition-all placeholder-slate-400 dark:placeholder-slate-600"
              />
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              </div>
            </div>

            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300
                         glass-panel hover:bg-white/10 dark:hover:bg-white/5 rounded-xl shadow-sm
                         disabled:opacity-50 active:scale-95">
              <span className={`transition-transform duration-700 ${loading ? 'animate-spin' : ''}`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6m12 6a9 9 0 0 1-15-6.7L3 16" /></svg>
              </span>
              Sync
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {!selectedContext ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
              <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                <span className="text-2xl">◻</span>
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-center">Select a cluster to view Helm releases</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-24">
              <LoadingAnimation />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-2">Helm not available</p>
                <p className="text-xs text-slate-500 dark:text-slate-500 max-w-sm leading-relaxed">{error}</p>
              </div>
              <button onClick={load} className="px-6 py-2 text-[11px] font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg active:scale-95">
                Retry Discovery
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
              <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                <span className="text-2xl">◻</span>
              </div>
              <p className="text-xs font-bold uppercase tracking-widest leading-none">
                {filter ? 'No releases match' : 'No Helm releases found'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-white/70 dark:bg-[hsl(var(--bg-dark),_0.7)] backdrop-blur-xl z-20">
                <tr className="border-b border-slate-100 dark:border-white/5">
                  {['Name', 'Namespace', 'Chart', 'Version', 'Status', 'Updated'].map(h => (
                    <th key={h} className="text-left px-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="w-14" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                {filtered.map(r => {
                  const isActive = selected?.name === r.name && selected?.namespace === r.namespace
                  const uid = `${r.namespace}/${r.name}`
                  return (
                    <tr
                      key={uid}
                      onClick={() => setSelected(isActive ? null : r)}
                      className={`group cursor-pointer transition-colors duration-200 relative ${isActive
                        ? 'bg-blue-600/10 border-l-[3px] border-blue-500 shadow-[inset_4px_0_12px_-4px_rgba(59,130,246,0.3)]'
                        : 'hover:bg-slate-100/50 dark:hover:bg-white/5 border-l-[3px] border-transparent'
                        }`}
                    >
                      <td className="px-8 py-4 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{r.name}</td>
                      <td className="px-8 py-4 text-xs font-bold text-slate-500 dark:text-slate-500 font-mono tracking-tighter uppercase">{r.namespace}</td>
                      <td className="px-8 py-4 text-xs text-slate-600 dark:text-slate-400 font-mono whitespace-nowrap">{r.chart}</td>
                      <td className="px-8 py-4 text-xs text-slate-500 dark:text-slate-400 font-bold whitespace-nowrap">{r.app_version || '—'}</td>
                      <td className="px-8 py-4 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                      <td className="px-8 py-4 text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        {r.updated ? formatAge(r.updated) + ' ago' : '—'}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-blue-500 transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m9 18 6-6-6-6" /></svg>
                        </div>
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
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl p-8 max-w-sm w-full scale-in">
            <div className="flex flex-col items-center text-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-500">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Uninstall Release</h3>
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">Permanent Action</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-8 leading-relaxed">
              Uninstall <span className="font-mono font-black text-slate-900 dark:text-white">{uninstallTarget.name}</span> from <span className="font-bold text-blue-500">{uninstallTarget.namespace}</span>? All associated resources will be deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setUninstallTarget(null)} disabled={uninstalling}
                className="flex-1 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-all disabled:opacity-40">
                Cancel
              </button>
              <button onClick={handleUninstall} disabled={uninstalling}
                className="flex-1 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-lg shadow-red-500/20 disabled:opacity-40">
                {uninstalling ? 'Removing...' : 'Uninstall'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
