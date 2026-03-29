import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '../../store'
import type { HelmRelease, HelmHistoryEntry } from '../../types'
import { formatAge } from '../../types'
import YAMLViewer from '../common/YAMLViewer'
import HelmRepoBrowser from './HelmRepoBrowser'
import { FileCode, X, Activity, HardDrive, History, Trash2, Clock, Globe, Shield, RefreshCw, Package } from 'lucide-react'
import PageHeader from '../core/PageHeader'

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase()
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
      {String(status || '')}
    </span>
  )
}

// ─── Release Drawer ───────────────────────────────────────────────────────────

function ReleaseDrawer({
  release,
  context,
  onClose,
  onUninstall,
  onUpgraded,
}: {
  release: HelmRelease
  context: string
  onClose: () => void
  onUninstall: (r: HelmRelease) => void
  onUpgraded: () => void
}) {
  const [tab, setTab] = useState<'overview' | 'history'>('overview')
  const [values, setValues] = useState<string | null>(null)
  const [loadingValues, setLoadingValues] = useState(false)
  const [valuesError, setValuesError] = useState<string | null>(null)
  const [history, setHistory] = useState<HelmHistoryEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null)
  const [rollingBack, setRollingBack] = useState(false)
  const [rbError, setRbError] = useState<string | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)

  useEffect(() => {
    if (tab === 'history' && history.length === 0) {
      setLoadingHistory(true)
      setHistoryError(null)
      window.helm.history(context, release.namespace, release.name)
        .then(raw => setHistory(raw as HelmHistoryEntry[]))
        .catch(err => setHistoryError((err as Error)?.message ?? 'Failed to load release history'))
        .finally(() => setLoadingHistory(false))
    }
  }, [tab])

  const handleViewValues = async () => {
    setValues(null); setValuesError(null); setLoadingValues(true)
    try {
      const out = await window.helm.values(context, release.namespace, release.name)
      setValues(out)
    } catch (err) {
      setValuesError((err as Error).message ?? 'Failed to fetch values')
    } finally {
      setLoadingValues(false)
    }
  }

  const handleUpgrade = async (newValues: string) => {
    setUpgrading(true)
    setUpgradeError(null)
    try {
      await window.helm.upgrade(context, release.namespace, release.name, newValues)
      setValues(null)
      onUpgraded()
    } catch (err) {
      setUpgradeError((err as Error).message ?? 'Upgrade failed')
    } finally {
      setUpgrading(false)
    }
  }

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

  return (
    <div className="flex flex-col w-[520px] min-w-[420px] border-l border-slate-100 dark:border-white/5 glass-heavy h-full shadow-2xl scale-in origin-right z-30">
      {/* Header */}
      <div className="px-6 py-6 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-black text-slate-900 dark:text-white font-mono truncate tracking-tight uppercase tracking-widest">{release.name}</h3>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusBadge status={release.status} />
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none mt-1">{release.namespace} · REV {release.revision}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 dark:text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleViewValues}
            disabled={loadingValues}
            className="text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl bg-blue-600/10 text-blue-400 border border-blue-500/20 hover:bg-blue-600/20 transition-all flex items-center gap-2"
          >
            <FileCode size={14} />
            {loadingValues ? 'Loading...' : 'Values YAML'}
          </button>
          <button onClick={() => onUninstall(release)}
            className="text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl bg-red-600/10 text-red-500 border border-red-500/20 hover:bg-red-600/20 transition-all flex items-center gap-2">
            <Trash2 size={14} />
            Uninstall
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-white/5 shrink-0 bg-slate-50 dark:bg-white/5">
        {(['overview', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${tab === t
              ? 'text-blue-500 dark:text-blue-400'
              : 'text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-300'
              }`}>
            {t}
            {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 scrollbar-hide">
        {tab === 'overview' && (
          <div className="space-y-6">
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Shield size={12} /> Release Details
            </h4>
            <div className="space-y-3">
              {[
                { label: 'Chart', value: release.chart, icon: <HardDrive size={14} /> },
                { label: 'App Version', value: release.app_version || '—', icon: <Globe size={14} /> },
                { label: 'Namespace', value: release.namespace, icon: <Clock size={14} /> },
                { label: 'Revision', value: release.revision, icon: <Activity size={14} /> },
                { label: 'Updated', value: release.updated ? formatAge(release.updated) + ' ago' : '—', icon: <History size={14} /> },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 dark:bg-white/[0.03] rounded-2xl px-5 py-4 border border-slate-100 dark:border-white/5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-right truncate max-w-[240px] font-mono">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-6">
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <History size={12} /> Revision History
            </h4>

            {rbError && (
              <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest">
                {rbError}
              </div>
            )}

            {loadingHistory ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : historyError ? (
              <p className="text-xs text-red-400 italic text-center py-20 uppercase tracking-widest opacity-60">{historyError}</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-slate-500 italic text-center py-20 uppercase tracking-widest opacity-40">No history available</p>
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
                          <span className="text-xs font-black text-slate-900 dark:text-white">Rev {entry.revision}</span>
                          <StatusBadge status={entry.status} />
                        </div>
                        <p className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-500 truncate">{entry.chart}</p>
                        {entry.status === 'deployed' && (
                          <div className="flex items-center gap-1.2 mt-2 text-[9px] font-bold text-emerald-500/80 uppercase tracking-widest">
                            <Shield size={10} /> Active Release
                          </div>
                        )}
                        {entry.description && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 font-medium leading-relaxed italic opacity-80">{entry.description}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-tighter">
                          {entry.updated ? formatAge(entry.updated) + ' ago' : ''}
                        </span>
                        {entry.status !== 'superseded' && entry.status !== 'deployed' && (
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
                      <div className="mt-4 pt-4 border-t border-blue-500/20 flex flex-col gap-3">
                        <p className="text-[10px] font-black uppercase tracking-wide text-blue-400">Confirm rollback to this version?</p>
                        <button
                          onClick={handleRollback}
                          disabled={rollingBack}
                          className="w-full py-2.5 text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                        >
                          {rollingBack ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                          {rollingBack ? 'Processing Rollback...' : 'Confirm Rollback'}
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

      {/* Values Modal */}
      {(loadingValues || values !== null || valuesError !== null) && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                  {loadingValues
                    ? <div className="w-4 h-4 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin" />
                    : <FileCode size={18} className="text-blue-500" />
                  }
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest leading-none">
                  {loadingValues ? 'Loading Values…' : `Values — ${release.name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setValues(null); setValuesError(null); setLoadingValues(false) }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors focus:outline-none"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {valuesError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                    <Activity size={20} className="text-red-400" />
                  </div>
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Failed to load values</p>
                  <pre className="text-xs text-slate-400 dark:text-slate-500 text-center max-w-lg break-words whitespace-pre-wrap">{valuesError}</pre>
                </div>
              ) : loadingValues ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : values !== null ? (
                <>
                  <YAMLViewer
                    content={values}
                    editable
                    onSave={handleUpgrade}
                  />
                  {upgradeError && (
                    <div className="px-6 py-3 bg-red-500/10 border-t border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest shrink-0">
                      {upgradeError}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main HelmPanel ───────────────────────────────────────────────────────────

export default function HelmPanel(): JSX.Element {
  const { selectedContext } = useAppStore()
  const [activeTab, setActiveTab] = useState<'releases' | 'browser'>('releases')
  const [releases, setReleases] = useState<HelmRelease[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<HelmRelease | null>(null)
  const [filter, setFilter] = useState('')
  const [uninstallTarget, setUninstallTarget] = useState<HelmRelease | null>(null)
  const [uninstalling, setUninstalling] = useState(false)

  // Clear stale release selection when context changes so the detail panel
  // doesn't show a release from the previous context while the new list loads.
  useEffect(() => {
    setSelected(null)
    setReleases([])
  }, [selectedContext])

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

  const filtered = (Array.isArray(releases) ? releases : []).filter(r =>
    (r.name || '').toLowerCase().includes(filter.toLowerCase()) ||
    (r.namespace || '').toLowerCase().includes(filter.toLowerCase()) ||
    (r.chart || '').toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="flex flex-1 min-w-0 min-h-0 bg-white dark:bg-[hsl(var(--bg-dark))] transition-colors duration-200">
      {/* List */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {/* Toolbar */}
        <PageHeader
          title={activeTab === 'releases' ? 'Helm Releases' : 'Repository Browser'}
          subtitle={
            activeTab === 'releases' && !loading ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                {filtered.length} installed
              </>
            ) : undefined
          }
        >
          <div className="flex items-center gap-6">
            {/* Tab switcher */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 rounded-xl p-1">
              <button
                onClick={() => setActiveTab('releases')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  activeTab === 'releases'
                    ? 'bg-white dark:bg-white/10 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <Activity size={11} />
                Releases
              </button>
              <button
                onClick={() => setActiveTab('browser')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  activeTab === 'browser'
                    ? 'bg-white dark:bg-white/10 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <Package size={11} />
                Repository
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {activeTab === 'releases' && (
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
            )}

            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300
                         glass-panel hover:bg-white/10 dark:hover:bg-white/5 rounded-xl shadow-sm
                         disabled:opacity-50 active:scale-95 leading-none">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Sync
            </button>
          </div>
        </PageHeader>

        {/* Content */}
        {activeTab === 'browser' ? (
          <HelmRepoBrowser />
        ) : (
        <div className="flex-1 overflow-auto scrollbar-hide">
          {!selectedContext ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
              <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center mb-4">
                <HardDrive size={32} strokeWidth={1.5} />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-center">Select a cluster context to view releases</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                <Activity size={24} className="text-red-400" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-1.5">Helm discovery failed</p>
                <p className="text-xs text-slate-500 dark:text-slate-500 max-w-sm leading-relaxed mx-auto italic">{error}</p>
              </div>
              <button onClick={load} className="px-6 py-2.5 text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-lg active:scale-95">
                Retry Connection
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
              <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center mb-4">
                <Globe size={32} strokeWidth={1.5} />
              </div>
              <p className="text-xs font-bold uppercase tracking-widest">
                {filter ? 'No results match filter' : 'No Helm releases detected'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-white/70 dark:bg-[hsl(var(--bg-dark),_0.7)] backdrop-blur-xl z-20">
                <tr className="border-b border-slate-100 dark:border-white/5">
                  {['Name', 'Namespace', 'Chart', 'Version', 'Status', 'Updated'].map(h => (
                    <th key={h} className="text-left pl-8 py-5 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">
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
                      <td className="px-8 py-4 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{String(r.name || '')}</td>
                      <td className="px-8 py-4 text-xs font-bold text-slate-500 dark:text-slate-500 font-mono tracking-tighter uppercase leading-none">{String(r.namespace || '')}</td>
                      <td className="px-8 py-4 text-xs text-slate-600 dark:text-slate-400 font-mono whitespace-nowrap">{String(r.chart || '')}</td>
                      <td className="px-8 py-4 text-xs text-slate-500 dark:text-slate-400 font-bold whitespace-nowrap">{String(r.app_version || '—')}</td>
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
        )}
      </div>

      {/* Drawer — key forces full remount on release change, resetting all tab state */}
      {selected && selectedContext && (
        <ReleaseDrawer
          key={`${selected.namespace}/${selected.name}`}
          release={selected}
          context={selectedContext}
          onClose={() => setSelected(null)}
          onUninstall={setUninstallTarget}
          onUpgraded={load}
        />
      )}

      {/* Uninstall confirm modal */}
      {uninstallTarget && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-white/10 shadow-2xl p-8 max-w-sm w-full scale-in animate-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
                <Trash2 size={28} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Uninstall Release</h3>
                <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mt-2 px-3 py-1 bg-red-500/5 rounded-lg border border-red-500/10 inline-block">Destructive Operation</p>
              </div>
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 text-center mb-8 leading-relaxed">
              Are you sure you want to uninstall <span className="font-mono font-bold text-slate-900 dark:text-white">{uninstallTarget.name}</span>? This will remove all associated kubernetes resources.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setUninstallTarget(null)} disabled={uninstalling}
                className="flex-1 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-all disabled:opacity-40">
                Abort
              </button>
              <button onClick={handleUninstall} disabled={uninstalling}
                className="flex-1 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-lg shadow-red-500/20 disabled:opacity-40">
                {uninstalling ? 'Removing...' : 'Uninstall'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
