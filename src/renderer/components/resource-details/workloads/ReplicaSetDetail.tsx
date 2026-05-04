import React, { useEffect, useState } from 'react'
import { useAppStore } from '../../../store'
import type { KubeReplicaSet, KubeEvent } from '../../../types'
import { formatAge } from '../../../types'
import { FileCode, X, Activity, Layers, Info, History } from 'lucide-react'
import YAMLViewer from '../../common/YAMLViewer'
import { useYAMLEditor } from '../../../hooks/useYAMLEditor'

interface Props {
  replicaSet: KubeReplicaSet
}

export default function ReplicaSetDetail({ replicaSet: rs }: Props): JSX.Element {
  const { selectedContext } = useAppStore()
  const { yaml, loading: yamlLoading, error: yamlError, open: openYAML, apply: applyYAML, close: closeYAML } = useYAMLEditor()
  const [events, setEvents] = useState<KubeEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [tab, setTab] = useState<'overview' | 'events'>('overview')

  const desired = rs.spec.replicas ?? 0
  const ready = rs.status.readyReplicas ?? 0
  const available = rs.status.availableReplicas ?? 0
  const replicas = rs.status.replicas ?? 0

  // Owner reference (usually a Deployment)
  const ownerName = (rs.metadata as any).ownerReferences?.find((o: any) => o.kind === 'Deployment')?.name

  useEffect(() => {
    const uid = rs.metadata.uid
    if (!selectedContext || tab !== 'events' || !uid) return
    setEventsLoading(true)
    window.kubectl.getResourceEvents(selectedContext, rs.metadata.namespace ?? 'default', uid)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [tab, rs.metadata.uid, selectedContext])

  return (
    <div className="flex flex-col w-full h-full relative font-sans">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{rs.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{rs.metadata.namespace} · REPLICSET</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openYAML('replicaset', rs.metadata.name, false, rs.metadata.namespace ?? 'default')}
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
      </div>

      <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white/[0.02]">
        {(['overview', 'events'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${tab === t
              ? 'text-blue-400'
              : 'text-slate-500 hover:text-slate-300'
              }`}>
            {t}
            {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        {tab === 'overview' ? (
          <div className="space-y-8">
            {/* Stats Grid */}
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Layers size={12} /> Status
              </h4>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusCard label="Desired" value={desired} color="text-slate-200" />
                <StatusCard label="Ready" value={ready} color={ready >= desired ? 'text-emerald-400' : 'text-amber-400'} />
                <StatusCard label="Current" value={replicas} color="text-slate-400" />
                <StatusCard label="Available" value={available} color={available >= desired ? 'text-blue-400' : 'text-red-400'} />
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Info size={12} /> Details
                </h4>
                <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4 space-y-3">
                  <InfoRow label="Controlled By" value={ownerName} mono />
                  <InfoRow label="Resource Type" value="Deployment" />
                  <InfoRow label="Created" value={formatAge(rs.metadata.creationTimestamp) + ' ago'} />
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4">Selectors</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(rs.spec.selector.matchLabels || {}).map(([k, v]) => (
                    <span key={k} className="text-[10px] font-bold bg-blue-500/5 text-blue-400/80 border border-blue-500/10 px-2.5 py-1 rounded-lg font-mono">
                      {k}={v}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {/* Labels */}
            {rs.metadata.labels && (
              <section>
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4">Labels</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(rs.metadata.labels).map(([k, v]) => (
                    <span key={k} className="px-3 py-1.5 bg-white/[0.02] border border-white/5 rounded-xl text-[10px] font-bold font-mono text-slate-400">
                      <span className="text-blue-400/70">{k}</span>={v}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
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
                <History size={32} className="mx-auto text-slate-700 mb-4 opacity-20" />
                <p className="text-sm text-slate-500 font-medium">No recent events found</p>
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
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${rs.metadata.name}`}
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
    <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 rounded-2xl p-4">
      <p className={`text-2xl font-black ${color} tracking-tight`}>{value}</p>
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">{label}</p>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string, value: string, mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      <span className={`text-[11px] font-bold text-slate-300 ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}
