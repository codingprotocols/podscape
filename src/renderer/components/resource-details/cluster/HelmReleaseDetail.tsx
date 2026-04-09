import React, { useEffect, useState } from 'react'
import { FileCode, X, Activity, HardDrive, History, Trash2, Shield, RefreshCw } from 'lucide-react'
import { RefreshButton } from '../../common'
import type { HelmRelease, HelmHistoryEntry } from '../../../types'
import { formatAge } from '../../../types'
import YAMLViewer from '../../common/YAMLViewer'
import CopyButton from '../../common/CopyButton'

interface Props {
  release: HelmRelease
  context: string
  onUninstall: (r: HelmRelease) => void
  onUpgraded: () => Promise<void>
}

export default function HelmReleaseDetail({ release, context, onUninstall, onUpgraded }: Props): JSX.Element {
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview')
  const [values, setValues] = useState<string | null>(null)
  const [loadingValues, setLoadingValues] = useState(false)
  const [valuesError, setValuesError] = useState<string | null>(null)
  const [history, setHistory] = useState<HelmHistoryEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null)
  const [rollingBack, setRollingBack] = useState(false)
  const [rbError, setRbError] = useState<string | null>(null)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [latestChartName, setLatestChartName] = useState<string | null>(null)
  const [upgradeVersion, setUpgradeVersion] = useState<string | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [isCustomChart, setIsCustomChart] = useState(false)
  const [refreshingRepos, setRefreshingRepos] = useState(false)

  useEffect(() => {
    if (activeTab === 'history' && history.length === 0) {
      loadHistory()
    }
  }, [activeTab])

  useEffect(() => {
    checkForUpdates()
  }, [release.chart])

  const checkForUpdates = async () => {
    if (!window.helm.repoSearch) return
    setCheckingUpdate(true)
    setIsCustomChart(false)
    try {
      // Use explicit chart_name if available, fallback to manual parsing
      let chartName = release.chart_name
      if (!chartName) {
        const chartStr = release.chart || ''
        const lastHyphen = chartStr.lastIndexOf('-')
        if (lastHyphen === -1) {
          setIsCustomChart(true)
          return
        }
        chartName = chartStr.substring(0, lastHyphen)
      }
      
      // 2. Search for the chart in repos
      const res = await window.helm.repoSearch(chartName, 10, 0) as { charts: Array<{ name: string; version: string }> }
      if (res && res.charts && res.charts.length > 0) {
        // Look for exact match (e.g. searching "nginx" might return "bitnami/nginx")
        const currentVersion = release.chart_version || release.chart.split('-').pop() || ''
        
        // Prioritize a chart that matches our current version (likely the repo we used)
        let match = res.charts.find(c => (c.name.endsWith('/' + chartName) || c.name === chartName) && c.version === currentVersion)
        
        // Fallback to first name match if no version match found
        if (!match) {
          match = res.charts.find(c => c.name.endsWith('/' + chartName) || c.name === chartName)
        }

        if (match) {
          setLatestVersion(match.version)
          setLatestChartName(match.name)
        } else {
          setIsCustomChart(true)
        }
      } else {
        setIsCustomChart(true)
      }
    } catch (err) {
      console.warn('Failed to check for chart updates', err)
      setIsCustomChart(true)
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleRefreshRepos = async () => {
    if (!window.helm.repoRefresh) return
    setRefreshingRepos(true)
    try {
      await window.helm.repoRefresh()
      await checkForUpdates()
    } catch (err) {
      console.warn('Failed to refresh repos', err)
    } finally {
      setRefreshingRepos(false)
    }
  }

  const currentChartVersion = release.chart_version || release.chart.split('-').pop() || ''
  const isUpdateAvailable = latestVersion && latestVersion !== currentChartVersion 
    // Basic semver check logic (can be improved with a lib)
    && latestVersion > currentChartVersion 

  const loadHistory = async () => {
    setLoadingHistory(true)
    try {
      const raw = await window.helm.history(context, release.namespace, release.name)
      setHistory(raw as HelmHistoryEntry[])
    } catch (err) {
      console.error('Failed to load release history', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleViewValues = async () => {
    setValues(null)
    setValuesError(null)
    setLoadingValues(true)
    try {
      const out = await window.helm.values(context, release.namespace, release.name)
      setValues(out)
    } catch (err) {
      setValuesError((err as Error).message ?? 'Failed to fetch values')
    } finally {
      setLoadingValues(false)
    }
  }

  const handleInitiateUpgrade = async () => {
    setUpgradeVersion(latestVersion)
    await handleViewValues()
  }

  const handleUpgrade = async (newValues: string) => {
    setUpgradeError(null)
    try {
      await window.helm.upgrade(context, release.namespace, release.name, newValues, latestChartName ?? undefined, upgradeVersion ?? undefined)
      await onUpgraded()
      // Brief delay to ensure k8s storage propagation for follow-up checks
      await new Promise(resolve => setTimeout(resolve, 1000))
      setValues(null)
      setUpgradeVersion(null)
    } catch (err) {
      setUpgradeError((err as Error).message ?? 'Upgrade failed')
    } finally {
      // Done
    }
  }

  const handleRollback = async () => {
    if (rollbackTarget === null) return
    setRollingBack(true)
    setRbError(null)
    try {
      await window.helm.rollback(context, release.namespace, release.name, rollbackTarget)
      setRollbackTarget(null)
      await loadHistory()
    } catch (e) {
      setRbError(e instanceof Error ? e.message : 'Rollback failed')
    } finally {
      setRollingBack(false)
    }
  }

  return (
    <div className="flex flex-col bg-transparent h-full transition-colors duration-200 relative w-full font-sans">
      {/* Header */}
      <div className="px-6 py-6 border-b border-slate-100 dark:border-white/5 shrink-0 bg-white/5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-slate-900 dark:text-white font-mono truncate tracking-tight">{release.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{release.namespace} · HELM RELEASE</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleViewValues}
              disabled={loadingValues}
              className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2 group disabled:opacity-50"
            >
              <FileCode size={14} className="group-hover:text-blue-400 transition-colors" />
              {loadingValues ? 'Loading...' : 'Values YAML'}
            </button>
            <button
               onClick={() => onUpgraded()}
               className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 text-slate-400 hover:text-blue-500 border border-white/5 hover:border-blue-500/20 transition-all group"
               title="Refresh Release Info"
            >
               <RefreshCw size={14} className="group-active:animate-spin" />
            </button>
            <StatusBadge status={release.status} />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
           <button onClick={() => onUninstall(release)}
            className="text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl bg-red-600/10 text-red-500 border border-red-500/20 hover:bg-red-600/20 transition-all flex items-center gap-2">
            <Trash2 size={14} /> Uninstall
          </button>
        </div>
      </div>

      {/* Styled Breadcrumb Area */}
      <div className="px-5 py-2.5 border-b border-slate-100 dark:border-white/5 bg-white/5 flex items-center gap-2">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-slate-600">
           <path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em]">
          HELM / {release.name}
        </span>
      </div>

      {/* Details Wrapper (Scrollable) */}
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide">
        {activeTab === 'overview' && (
          <>
            {/* Metadata */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <Shield size={12} /> Release Info
              </h4>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5">
                <div className="min-w-0">
                  <dt className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-tighter mb-0.5">Chart</dt>
                  <dd className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex flex-col gap-1.5">
                    <span className="truncate font-mono">{release.chart}</span>
                    {checkingUpdate ? (
                      <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest animate-pulse">
                        <RefreshCw size={10} className="animate-spin" /> Checking for updates...
                      </div>
                    ) : isUpdateAvailable ? (
                        <div className="flex items-center gap-2.5">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 w-fit shadow-[0_0_12px_-2px_rgba(59,130,246,0.2)]">
                              <Activity size={11} className="shrink-0" />
                              <span className="text-[9px] font-black uppercase tracking-wider">Update available: {latestVersion}</span>
                            </div>
                            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter px-1">from {latestChartName}</span>
                          </div>
                          <button 
                            onClick={handleInitiateUpgrade}
                            className="text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20 transition-all active:scale-95 flex items-center gap-1.5"
                          >
                            <RefreshCw size={10} /> Upgrade
                          </button>
                        </div>
                      ) : latestVersion ? (
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-black text-emerald-500/60 uppercase tracking-widest flex items-center gap-1.5 px-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40" /> Latest version
                          </span>
                          <button 
                            onClick={handleRefreshRepos}
                            disabled={refreshingRepos}
                            className="text-slate-500 hover:text-blue-500 transition-colors p-1"
                            title="Refresh Helm Repositories"
                          >
                            <RefreshCw size={10} className={refreshingRepos ? 'animate-spin' : ''} />
                          </button>
                        </div>
                    ) : isCustomChart ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-slate-500/60 uppercase tracking-widest flex items-center gap-1.5 px-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-500/30" /> Local / Custom Chart
                        </span>
                        <button 
                          onClick={handleRefreshRepos}
                          disabled={refreshingRepos}
                          className="text-slate-500 hover:text-blue-500 transition-colors p-1"
                          title="Refresh Helm Repositories"
                        >
                          <RefreshCw size={10} className={refreshingRepos ? 'animate-spin' : ''} />
                        </button>
                      </div>
                    ) : null}
                  </dd>
                </div>
                <MetaRow label="App Version" value={release.app_version || '—'} mono />
                <MetaRow label="Revision" value={String(release.revision)} mono />
                <MetaRow label="Updated" value={release.updated ? formatAge(release.updated) + ' ago' : '—'} />
                <MetaRow label="Status" value={release.status} />
                <MetaRow label="Namespace" value={release.namespace} mono />
              </dl>
            </div>
            
            <div className="p-6">
              <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                    <Activity size={14} />
                  </div>
                  <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Active Status</h4>
                </div>
                <p className="text-xs text-slate-400 font-medium leading-relaxed">
                  This release is currently <span className="text-emerald-400 font-bold uppercase">{release.status}</span>. 
                  View revision history to see previous versions or perform a rollback.
                </p>
              </div>
            </div>
          </>
        )}

        {activeTab === 'history' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest flex items-center gap-2">
                <History size={12} /> Revision History
              </h4>
              <RefreshButton
                onClick={loadHistory}
                loading={loadingHistory}
                label="Refresh"
              />
            </div>

            {rbError && (
              <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest">
                {rbError}
              </div>
            )}

            <div className="rounded-2xl border border-slate-100 dark:border-white/5 overflow-hidden">
               {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-xs text-slate-600 italic text-center py-12">No history available</p>
              ) : (
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-white/[0.03] border-b border-slate-100 dark:border-white/5 text-[9px] font-black uppercase tracking-widest text-slate-500">
                      <th className="px-4 py-2.5 text-left">Rev</th>
                      <th className="px-4 py-2.5 text-left">Status</th>
                      <th className="px-4 py-2.5 text-left">Age</th>
                      <th className="px-4 py-2.5 text-left">Description</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                    {[...history].reverse().map(entry => (
                      <tr key={entry.revision} className="hover:bg-white/[0.02] transition-colors relative group">
                        <td className="px-4 py-4 font-mono font-bold text-slate-200">#{entry.revision}</td>
                        <td className="px-4 py-4"><StatusBadge status={entry.status} /></td>
                        <td className="px-4 py-4 text-slate-400 whitespace-nowrap">{entry.updated ? formatAge(entry.updated) + ' ago' : '—'}</td>
                        <td className="px-4 py-4 text-slate-500 dark:text-slate-400 italic max-w-[200px] truncate">{entry.description || '—'}</td>
                        <td className="px-4 py-4 text-right">
                          {entry.status !== 'deployed' && entry.status !== 'superseded' && (
                            <button
                              onClick={() => setRollbackTarget(rollbackTarget === entry.revision ? null : entry.revision)}
                              className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border transition-all ${
                                rollbackTarget === entry.revision
                                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                : 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20'
                              }`}
                            >
                              {rollbackTarget === entry.revision ? 'Cancel' : 'Rollback'}
                            </button>
                          )}
                          {entry.status === 'deployed' && (
                            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Active</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {rollbackTarget !== null && (
              <div className="p-5 rounded-2xl bg-blue-600/10 border border-blue-500/20 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h5 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Confirm Rollback</h5>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">Instantly revert to revision #{rollbackTarget}?</p>
                  </div>
                  <button
                    onClick={handleRollback}
                    disabled={rollingBack}
                    className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-2 disabled:opacity-50"
                  >
                    {rollingBack ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {rollingBack ? 'Executing...' : 'Rollback Now'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="px-6 flex items-center gap-8 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <TabButton
          active={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
          label="Overview"
          icon={<HardDrive size={14} />}
        />
        <TabButton
          active={activeTab === 'history'}
          onClick={() => setActiveTab('history')}
          label="History"
          icon={<History size={14} />}
        />
      </div>

      {/* Values Modal */}
      {(loadingValues || values !== null || valuesError !== null) && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                  {loadingValues
                    ? <div className="w-4 h-4 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin" />
                    : <FileCode size={18} className="text-blue-500" />
                  }
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">
                  {loadingValues ? 'Loading Values…' : upgradeVersion ? `Upgrade to ${upgradeVersion}` : `Edit — ${release.name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setValues(null); setValuesError(null); setLoadingValues(false); setUpgradeVersion(null) }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors focus:outline-none"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 min-h-0 bg-slate-950">
              {valuesError ? (
                 <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                    <Activity size={20} className="text-red-400" />
                  </div>
                  <p className="text-sm font-bold text-red-400 uppercase tracking-widest">Failed to load manifest</p>
                   <pre className="text-xs text-slate-400 max-w-lg break-words whitespace-pre-wrap font-mono bg-white/5 p-4 rounded-xl border border-white/5">{valuesError}</pre>
                </div>
              ) : loadingValues ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : values !== null ? (
                <>
                  <YAMLViewer editable
                    content={values}
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

function MetaRow({ label, value, mono, copyable }: { label: string; value: string; mono?: boolean; copyable?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-tighter mb-0.5">{label}</dt>
      <dd className={`text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate flex items-center gap-1 ${mono ? 'font-mono' : ''}`}>
        <span className="truncate">{value}</span>
        {copyable && value !== '—' && <CopyButton value={value} size={11} />}
      </dd>
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  label: string
  icon: React.ReactNode
  count?: number
  countType?: 'default' | 'error'
}

function TabButton({ active, onClick, label, icon, count, countType = 'default' }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all
        ${active ? 'text-blue-500 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold min-w-[18px] text-center
          ${countType === 'error' ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'}`}>
          {count}
        </span>
      )}
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.6)]" />
      )}
    </button>
  )
}
