import React, { useState, useEffect } from 'react'
import type { KubeDaemonSet } from '../../../types'
import { formatAge } from '../../../types'
import { useAppStore } from '../../../store'
import { FileCode, X, Activity, Layers, Settings, Box, Info, AlertTriangle, CheckCircle } from 'lucide-react'
import YAMLViewer from '../../common/YAMLViewer'
import AnalysisView from '../../advanced/AnalysisView'
import OwnerChain from '../../advanced/OwnerChain'
import { useYAMLEditor } from '../../../hooks/useYAMLEditor'
import { useResourceEvents } from '../../../hooks/useResourceEvents'

interface Props { daemonSet: KubeDaemonSet }

type Tab = 'overview' | 'events' | 'analysis'

export default function DaemonSetDetail({ daemonSet: ds }: Props): JSX.Element {
  const { scanResource, scanResults, isScanning, selectedContext: ctx } = useAppStore()
  const { yaml, loading: yamlLoading, error: yamlError, open: openYAML, apply: applyYAML, close: closeYAML } = useYAMLEditor()
  const [tab, setTab] = useState<Tab>('overview')
  const { events } = useResourceEvents(ctx, ds.metadata.name, 'DaemonSet', ds.metadata.namespace)

  const desired = ds.status.desiredNumberScheduled

  useEffect(() => {
    scanResource(ds as any)
  }, [ds.metadata.uid])

  return (
    <div className="flex flex-col w-full h-full relative">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{ds.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{ds.metadata.namespace} · DAEMONSET</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openYAML('daemonset', ds.metadata.name, false, ds.metadata.namespace)}
              disabled={yamlLoading}
              className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2 group disabled:opacity-50"
            >
              <FileCode size={14} className="group-hover:text-blue-400 transition-colors" />
              {yamlLoading ? 'Loading...' : 'YAML'}
            </button>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 ${ds.status.numberReady >= desired ? 'bg-emerald-500/10 text-emerald-500 outline-emerald-500/20' : 'bg-amber-500/10 text-amber-500 outline-amber-500/20'}`}>
              {ds.status.numberReady}/{desired} READY
            </span>
          </div>
        </div>
      </div>

      {/* Owner chain breadcrumb */}
      {ds.metadata.uid && (
        <OwnerChain
          uid={ds.metadata.uid}
          kind="DaemonSet"
          name={ds.metadata.name}
          namespace={ds.metadata.namespace ?? ''}
        />
      )}

      <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white/[0.02]">
        <button onClick={() => setTab('overview')}
          className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${tab === 'overview' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
          Overview
          {tab === 'overview' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
        </button>
        <button onClick={() => setTab('events')}
          className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative flex items-center gap-1.5 ${tab === 'events' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
          Events
          {events.some(e => e.type === 'Warning') && (
            <span className="text-[9px] font-black bg-amber-500/20 text-amber-400 rounded-full px-1.5 py-0.5">{events.filter(e => e.type === 'Warning').length}</span>
          )}
          {tab === 'events' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
        </button>
        <button onClick={() => setTab('analysis')}
          className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative flex items-center gap-1.5 ${tab === 'analysis' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
          Analysis
          {scanResults[ds.metadata.uid]?.summary.errors > 0 && (
            <span className="text-[9px] font-black bg-red-500/20 text-red-400 rounded-full px-1.5 py-0.5">{scanResults[ds.metadata.uid].summary.errors}</span>
          )}
          {tab === 'analysis' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        {tab === 'overview' && <div className="space-y-8">
          {/* Stats Grid */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Layers size={12} /> Status
            </h4>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatusCard label="Desired" value={desired} color="text-slate-200" />
              <StatusCard label="Ready" value={ds.status.numberReady} color={ds.status.numberReady >= desired ? 'text-emerald-400' : 'text-amber-400'} />
              <StatusCard label="Available" value={ds.status.numberAvailable ?? 0} color="text-blue-400" />
              <StatusCard label="Unavailable" value={ds.status.numberUnavailable ?? 0} color={ds.status.numberUnavailable ? 'text-red-400' : 'text-slate-500'} />
            </div>
          </section>

          {/* Config & Containers */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Settings size={12} /> Strategy
                </h4>
                <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4 space-y-3">
                  <InfoRow label="Strategy Type" value={ds.spec.updateStrategy?.type ?? 'RollingUpdate'} />
                  {ds.spec.updateStrategy?.rollingUpdate?.maxUnavailable !== undefined && (
                    <InfoRow label="Max Unavailable" value={String(ds.spec.updateStrategy.rollingUpdate.maxUnavailable)} />
                  )}
                  <InfoRow label="Created" value={formatAge(ds.metadata.creationTimestamp) + ' ago'} />
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Info size={12} /> Selectors
                </h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ds.spec.selector.matchLabels || {}).map(([k, v]) => (
                    <span key={k} className="text-[10px] font-bold bg-blue-500/5 text-blue-400/80 border border-blue-500/10 px-2.5 py-1 rounded-lg font-mono">
                      {k}={v}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Box size={12} /> Containers
              </h4>
              <div className="space-y-3">
                {ds.spec.template.spec.containers.map(c => (
                  <div key={c.name} className="p-4 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl">
                    <p className="text-xs font-bold text-slate-200 font-mono mb-1">{c.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono break-all">{c.image}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Labels */}
          {ds.metadata.labels && (
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4">Labels</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(ds.metadata.labels).map(([k, v]) => (
                  <span key={k} className="px-3 py-1.5 bg-white/[0.02] border border-white/5 rounded-xl text-[10px] font-bold font-mono text-slate-400">
                    <span className="text-blue-400/70">{k}</span>={v}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>}

        {tab === 'events' && (
          <div className="space-y-3">
            {events.length === 0 ? (
              <div className="text-center py-20 bg-slate-50 dark:bg-white/[0.01] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
                <p className="text-xs text-slate-400">No events recorded for this DaemonSet</p>
              </div>
            ) : events.map((e, i) => (
              <div key={i} className={`flex gap-4 p-4 rounded-2xl border ${e.type === 'Warning' ? 'bg-amber-500/5 border-amber-500/10' : 'bg-white/[0.02] border-white/5'}`}>
                <div className={`mt-0.5 shrink-0 ${e.type === 'Warning' ? 'text-amber-400' : 'text-slate-500'}`}>
                  {e.type === 'Warning' ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{e.reason}</span>
                    {e.count && e.count > 1 && (
                      <span className="text-[9px] font-bold bg-slate-700 text-slate-400 rounded-full px-1.5 py-0.5">×{e.count}</span>
                    )}
                    <span className="text-[9px] text-slate-500 ml-auto">{formatAge(e.lastTimestamp ?? e.eventTime ?? e.firstTimestamp ?? '')} ago</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed break-words">{e.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'analysis' && (
          <div>
            {(isScanning && !scanResults[ds.metadata.uid]) ? (
              <div className="flex items-center gap-2 py-20 justify-center">
                <div className="w-4 h-4 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-[10px] font-bold text-slate-400 animate-pulse">Running analysis…</span>
              </div>
            ) : scanResults[ds.metadata.uid] ? (
              <AnalysisView result={scanResults[ds.metadata.uid]} />
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
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${ds.metadata.name}`}
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
    </div>
  )
}

function StatusCard({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 rounded-2x p-4">
      <p className={`text-2xl font-black ${color} tracking-tight`}>{value}</p>
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">{label}</p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      <span className="text-[11px] font-bold text-slate-300">{value || '—'}</span>
    </div>
  )
}
