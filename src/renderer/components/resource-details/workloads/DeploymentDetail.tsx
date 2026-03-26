import React, { useState, useEffect } from 'react'
import type { KubeDeployment, KubeEvent } from '../../../types'
import { formatAge } from '../../../types'
import { useAppStore } from '../../../store'
import ScaleDialog from '../../common/ScaleDialog'
import YAMLViewer from '../../common/YAMLViewer'
import AnalysisView from '../../advanced/AnalysisView'
import { FileCode, X, Activity, Layers, History, Settings, Zap, RefreshCw } from 'lucide-react'
import { useYAMLEditor } from '../../../hooks/useYAMLEditor'
import OwnerChain from '../../advanced/OwnerChain'
import TimeSeriesChart, { PrometheusTimeRangeBar } from '../../advanced/TimeSeriesChart'
import { deploymentCpuQuery, deploymentMemoryQuery } from '../../../utils/prometheusQueries'

interface Props { deployment: KubeDeployment }

type Tab = 'overview' | 'history' | 'events' | 'analysis'

export default function DeploymentDetail({ deployment: d }: Props): JSX.Element {
  const { rolloutRestart, selectedContext, selectedNamespace, scanResource, scanResults, isScanning, prometheusAvailable } = useAppStore()
  const { yaml, loading: yamlLoading, error: yamlError, open: openYAML, apply: applyYAML, close: closeYAML } = useYAMLEditor()
  const [showScale, setShowScale] = useState(false)
  const [restartMsg, setRestartMsg] = useState('')
  const [tab, setTab] = useState<Tab>('overview')

  // Rollout history
  const [history, setHistory] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [undoMsg, setUndoMsg] = useState('')
  const [undoLoading, setUndoLoading] = useState(false)

  // Events
  const [events, setEvents] = useState<KubeEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  const desired = d.spec.replicas ?? 0
  const ready = d.status.readyReplicas ?? 0
  const available = d.status.availableReplicas ?? 0
  const updated = d.status.updatedReplicas ?? 0

  const ns = selectedNamespace === '_all'
    ? (d.metadata.namespace ?? '')
    : (selectedNamespace ?? d.metadata.namespace ?? '')

  const handleRestart = async () => {
    await rolloutRestart('deployment', d.metadata.name, d.metadata.namespace)
    setRestartMsg('Restart triggered')
    setTimeout(() => setRestartMsg(''), 5000)
  }

  const loadHistory = async () => {
    if (!selectedContext) return
    setHistoryLoading(true)
    try {
      const out = await window.kubectl.rolloutHistory(selectedContext, ns, 'deployment', d.metadata.name)
      setHistory(out)
    } catch (err) {
      setHistory(`Error: ${(err as Error).message}`)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleUndo = async (revision?: number) => {
    if (!selectedContext) return
    setUndoLoading(true)
    try {
      await window.kubectl.rolloutUndo(selectedContext, ns, 'deployment', d.metadata.name, revision)
      setUndoMsg(revision ? `Rolled back to revision ${revision}` : 'Rolled back to previous revision')
      setTimeout(() => setUndoMsg(''), 5000)
      await loadHistory()
    } catch (err) {
      setUndoMsg(`Error: ${(err as Error).message}`)
      setTimeout(() => setUndoMsg(''), 5000)
    } finally {
      setUndoLoading(false)
    }
  }

  const loadEvents = async () => {
    if (!selectedContext) return
    setEventsLoading(true)
    try {
      const evts = await window.kubectl.getResourceEvents(selectedContext, ns, 'Deployment', d.metadata.name)
      setEvents(evts)
    } catch {
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }

  useEffect(() => {
    scanResource(d as any)
  }, [d.metadata.uid])

  useEffect(() => {
    if (tab === 'history') loadHistory()
    if (tab === 'events') loadEvents()
  }, [tab, d.metadata.uid])

  return (
    <div className="flex flex-col w-full h-full relative font-sans">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{d.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{d.metadata.namespace} · DEPLOYMENT</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openYAML('deployment', d.metadata.name, false, d.metadata.namespace)}
              disabled={yamlLoading}
              className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2 group disabled:opacity-50"
            >
              <FileCode size={14} className="group-hover:text-blue-400 transition-colors" />
              {yamlLoading ? 'Loading...' : 'YAML'}
            </button>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 ${ready >= desired ? 'bg-emerald-500/10 text-emerald-500 outline-emerald-500/20' : 'bg-amber-500/10 text-amber-500 outline-amber-500/20'}`}>
              {ready}/{desired} READY
            </span>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={() => setShowScale(true)}
            className="text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all flex items-center gap-2">
            <Zap size={14} /> Scale
          </button>
          <button onClick={handleRestart}
            className="text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2">
            <RefreshCw size={14} /> Restart
          </button>
        </div>
        {restartMsg && (
          <p className="text-[10px] font-bold text-emerald-400 mt-3 uppercase tracking-wider">{restartMsg}</p>
        )}
      </div>

      {/* Owner chain breadcrumb */}
      {d.metadata.uid && (
        <OwnerChain
          uid={d.metadata.uid}
          kind="Deployment"
          name={d.metadata.name}
          namespace={d.metadata.namespace ?? ''}
        />
      )}

      <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white/[0.02]">
        {(['overview', 'history', 'events'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${tab === t
              ? 'text-blue-400'
              : 'text-slate-500 hover:text-slate-300'
              }`}>
            {t}
            {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
          </button>
        ))}
        <button onClick={() => setTab('analysis')}
          className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative flex items-center gap-1.5 ${tab === 'analysis' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
          Analysis
          {scanResults[d.metadata.uid]?.summary.errors > 0 && (
            <span className="text-[9px] font-black bg-red-500/20 text-red-400 rounded-full px-1.5 py-0.5">{scanResults[d.metadata.uid].summary.errors}</span>
          )}
          {tab === 'analysis' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        {tab === 'overview' && (
          <div className="space-y-8">
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Layers size={12} /> Replicas
              </h4>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusCard label="Desired" value={desired} color="text-slate-200" />
                <StatusCard label="Ready" value={ready} color={ready >= desired ? 'text-emerald-400' : 'text-amber-400'} />
                <StatusCard label="Available" value={available} color="text-blue-400" />
                <StatusCard label="Updated" value={updated} color="text-slate-400" />
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Settings size={12} /> Strategy
                </h4>
                <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4 space-y-3">
                  <InfoRow label="Strategy Type" value={d.spec.strategy?.type ?? 'RollingUpdate'} />
                  {d.spec.strategy?.rollingUpdate && (
                    <>
                      <InfoRow label="Max Surge" value={String(d.spec.strategy.rollingUpdate.maxSurge ?? '25%')} />
                      <InfoRow label="Max Unavailable" value={String(d.spec.strategy.rollingUpdate.maxUnavailable ?? '25%')} />
                    </>
                  )}
                  <InfoRow label="Created" value={formatAge(d.metadata.creationTimestamp) + ' ago'} />
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 uppercase tracking-widest">Selectors</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(d.spec.selector.matchLabels || {}).map(([k, v]) => (
                    <span key={k} className="text-[10px] font-bold bg-blue-500/5 text-blue-400/80 border border-blue-500/10 px-2.5 py-1 rounded-lg font-mono">
                      {k}={v}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {/* Prometheus metrics */}
            {prometheusAvailable && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Metrics</h4>
                  <PrometheusTimeRangeBar />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TimeSeriesChart
                    queries={[deploymentCpuQuery(d.metadata.name, d.metadata.namespace ?? '')]}
                    title="CPU"
                    unit="m"
                  />
                  <TimeSeriesChart
                    queries={[deploymentMemoryQuery(d.metadata.name, d.metadata.namespace ?? '')]}
                    title="Memory"
                    unit=" MiB"
                  />
                </div>
              </section>
            )}

            {/* Conditions */}
            {d.status.conditions && d.status.conditions.length > 0 && (
              <section>
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4">Conditions</h4>
                <div className="space-y-3">
                  {d.status.conditions.map(c => (
                    <div key={c.type} className={`p-4 rounded-2xl border transition-all ${c.status === 'True' ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-slate-50 dark:bg-white/[0.02] border-slate-100 dark:border-white/5'}`}>
                      <div className="flex items-center justify-between gap-4 mb-1">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${c.status === 'True' ? 'text-emerald-400' : 'text-slate-400'}`}>{c.type}</span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{c.reason}</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed font-medium">{c.message}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest flex items-center gap-2">
                <History size={12} /> Rollout Timeline
              </h4>
              <div className="flex gap-2">
                <button onClick={loadHistory} disabled={historyLoading}
                  className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 transition-all outline-none">
                  {historyLoading ? '...' : 'Refresh'}
                </button>
                <button onClick={() => handleUndo()} disabled={undoLoading}
                  className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-amber-600/10 text-amber-500 border border-amber-500/20 hover:bg-amber-600/20 transition-all outline-none">
                  {undoLoading ? 'Rolling back...' : 'Undo Last'}
                </button>
              </div>
            </div>
            {undoMsg && (
              <p className={`text-[10px] font-black uppercase tracking-widest p-3 rounded-xl border ${undoMsg.startsWith('Error') ? 'bg-red-500/5 text-red-400 border-red-500/10' : 'bg-emerald-500/5 text-emerald-400 border-emerald-500/10'}`}>{undoMsg}</p>
            )}
            <div className="bg-slate-950 rounded-2xl border border-white/5 p-6 shadow-inner overflow-hidden">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : history ? (
                <pre className="text-[11px] font-bold font-mono text-slate-400 whitespace-pre overflow-x-auto leading-relaxed">{history}</pre>
              ) : (
                <p className="text-xs text-slate-600 italic text-center py-12">No history available</p>
              )}
            </div>
          </div>
        )}

        {tab === 'events' && (
          <div className="space-y-3">
            {eventsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : events.map((e, i) => (
              <div key={e.metadata.uid || i} className={`p-4 rounded-2xl border transition-all ${e.type === 'Warning' ? 'bg-amber-500/5 border-amber-500/10' : 'bg-slate-50 dark:bg-white/[0.02] border-slate-100 dark:border-white/5'}`}>
                <div className="flex items-center justify-between gap-4 mb-2">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${e.type === 'Warning' ? 'text-amber-400' : 'text-blue-400'}`}>{e.reason}</span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{formatAge(e.lastTimestamp || e.metadata.creationTimestamp)} ago</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">{e.message}</p>
              </div>
            ))}
            {!eventsLoading && events.length === 0 && (
              <div className="text-center py-20 bg-slate-50 dark:bg-white/[0.01] rounded-3xl border border-dashed border-slate-200 dark:border-white/10 mt-4">
                <Activity size={32} className="mx-auto text-slate-700 mb-4 opacity-20" />
                <p className="text-sm text-slate-500 font-medium">No recent events found</p>
              </div>
            )}
          </div>
        )}

        {tab === 'analysis' && (
          <div>
            {(isScanning && !scanResults[d.metadata.uid]) ? (
              <div className="flex items-center gap-2 py-20 justify-center">
                <div className="w-4 h-4 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-[10px] font-bold text-slate-400 animate-pulse">Running analysis…</span>
              </div>
            ) : scanResults[d.metadata.uid] ? (
              <AnalysisView result={scanResults[d.metadata.uid]} />
            ) : (
              <div className="text-center py-20">
                <p className="text-sm text-slate-500 font-medium">No scan results yet</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Premium YAML Modal */}
      {(yamlLoading || yaml !== null || yamlError !== null) && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                  {yamlLoading
                    ? <div className="w-4 h-4 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin" />
                    : <FileCode size={18} className="text-blue-500" />
                  }
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${d.metadata.name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeYAML}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors focus:outline-none"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 min-h-0 bg-slate-950">
              {yamlError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                    <Activity size={20} className="text-red-400" />
                  </div>
                  <p className="text-sm font-bold text-red-400 uppercase tracking-widest">Failed to load manifest</p>
                  <pre className="text-xs text-slate-400 max-w-lg break-words whitespace-pre-wrap font-mono bg-white/5 p-4 rounded-xl border border-white/5">{yamlError}</pre>
                </div>
              ) : yamlLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : yaml !== null ? (
                <YAMLViewer editable
                  content={yaml}
                  onSave={applyYAML}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Scale dialog */}
      {showScale && (
        <ScaleDialog deployment={d} onClose={() => setShowScale(false)} />
      )}
    </div>
  )
}

function StatusCard({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 rounded-2xl p-4">
      <p className={`text-2xl font-black ${color} tracking-tight`}>{value}</p>
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">{label}</p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      <span className="text-[11px] font-bold text-slate-300">{value || '—'}</span>
    </div>
  )
}
