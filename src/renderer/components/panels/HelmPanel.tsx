import React, { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '../../store'
import type { HelmRelease } from '../../types'
import { formatAge } from '../../types'
import HelmRepoBrowser from './HelmRepoBrowser'
import { Activity, HardDrive, Package, Trash2, X, Globe } from 'lucide-react'
import { RefreshButton } from '../common'
import PageHeader from '../core/PageHeader'
import { useDragResize } from '../../hooks/useDragResize'

import HelmReleaseDetail from '../resource-details/cluster/HelmReleaseDetail'

// ─── Main HelmPanel ───────────────────────────────────────────────────────────

export default function HelmPanel(): JSX.Element {
  const { selectedContext, helmInstallHint, setHelmInstallHint } = useAppStore()
  const [activeTab, setActiveTab] = useState<'releases' | 'browser'>('releases')
  const [releases, setReleases] = useState<HelmRelease[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<HelmRelease | null>(null)
  const [filter, setFilter] = useState('')
  const [uninstallTarget, setUninstallTarget] = useState<HelmRelease | null>(null)
  const [uninstalling, setUninstalling] = useState(false)
  const { width: detailWidth, onMouseDown: handleResizeMouseDown } = useDragResize(
    Math.round(window.innerWidth / 2),
    300,
    Math.round(window.innerWidth * 0.8)
  )

  // If arriving from CostPanel install button, switch to browser tab and carry hint.
  useEffect(() => {
    if (helmInstallHint) {
      setActiveTab('browser')
    }
  }, [helmInstallHint])

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

  // Keep the selected release in sync with the updated releases list
  // (e.g. after an upgrade or refresh, to show the new version/revision).
  useEffect(() => {
    if (selected) {
      const found = releases.find(r => r.name === selected.name && r.namespace === selected.namespace)
      if (found && found !== selected) {
        setSelected(found)
      }
    }
  }, [releases])

  const handleUninstall = async (r: HelmRelease) => {
    if (!r || !selectedContext) return
    setUninstalling(true)
    try {
      await window.helm.uninstall(selectedContext, r.namespace, r.name)
      if (selected?.name === r.name) setSelected(null)
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
            {/* Tab switcher — hidden when a release detail is open */}
            {!selected && <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 rounded-xl p-1">
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
            </div>}
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

            <RefreshButton 
              onClick={load}
              loading={loading}
              label="Refresh"
            />
          </div>
        </PageHeader>

        {/* Content */}
        {activeTab === 'browser' ? (
          <HelmRepoBrowser
            installHint={helmInstallHint ?? undefined}
            onHintConsumed={() => setHelmInstallHint(null)}
          />
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
                  {(selected ? ['Name', 'Status', 'Updated'] : ['Name', 'Namespace', 'Chart', 'Version', 'Status', 'Updated']).map(h => (
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
                      {!selected && (
                        <>
                          <td className="px-8 py-4 text-xs font-bold text-slate-500 dark:text-slate-500 font-mono tracking-tighter uppercase leading-none">{String(r.namespace || '')}</td>
                          <td className="px-8 py-4 text-xs text-slate-600 dark:text-slate-400 font-mono whitespace-nowrap lg:max-w-xs truncate">{String(r.chart_name || r.chart || '')}</td>
                          <td className="px-8 py-4 text-xs text-slate-500 dark:text-slate-400 font-bold whitespace-nowrap">{String(r.chart_version || '—')}</td>
                        </>
                      )}
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

      {/* Detail Pane */}
      {selected && selectedContext && (
        <>
          {/* Drag resize handle */}
          <div
            onMouseDown={handleResizeMouseDown}
            className="w-1 cursor-col-resize bg-slate-100 dark:bg-white/5 hover:bg-blue-500/40 transition-colors shrink-0 select-none"
            title="Drag to resize"
          />
          <div
            className="flex flex-col shrink-0 h-full overflow-hidden border-l border-slate-200 dark:border-white/5 animate-in slide-in-from-right-4 duration-300"
            style={{ width: detailWidth }}
          >
            <div className="flex-1 min-h-0 overflow-auto">
              <HelmReleaseDetail
                key={`${selected.namespace}/${selected.name}/${selected.revision}`}
                release={selected}
                context={selectedContext}
                onUninstall={setUninstallTarget}
                onRefresh={load}
                onClose={() => setSelected(null)}
              />
            </div>
          </div>
        </>
      )}

      {/* Uninstall confirm modal */}
      {uninstallTarget && (
        <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
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
              <button onClick={() => handleUninstall(uninstallTarget)} disabled={uninstalling}
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

