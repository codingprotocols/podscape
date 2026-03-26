import React, { useState, useEffect } from 'react'
import type { KubeStatefulSet, KubeEvent } from '../../../types'
import { formatAge } from '../../../types'
import { useAppStore } from '../../../store'
import { FileCode, X, Activity, RefreshCw, Zap, Server } from 'lucide-react'
import YAMLViewer from '../../common/YAMLViewer'
import AnalysisView from '../../advanced/AnalysisView'
import OwnerChain from '../../advanced/OwnerChain'
import { useYAMLEditor } from '../../../hooks/useYAMLEditor'

interface Props { statefulSet: KubeStatefulSet }

type Tab = 'overview' | 'events' | 'analysis'

export default function StatefulSetDetail({ statefulSet: s }: Props): JSX.Element {
  const { rolloutRestart, selectedContext, selectedNamespace, scanResource, scanResults, isScanning } = useAppStore()
  const { yaml, loading: yamlLoading, error: yamlError, open: openYAML, apply: applyYAML, close: closeYAML } = useYAMLEditor()
  const [tab, setTab] = useState<Tab>('overview')
  const [showScale, setShowScale] = useState(false)
  const [scaleVal, setScaleVal] = useState(String(s.spec.replicas ?? 1))
  const [scaleLoading, setScaleLoading] = useState(false)
  const [scaleMsg, setScaleMsg] = useState('')
  const [restartMsg, setRestartMsg] = useState('')

  const [events, setEvents] = useState<KubeEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  const desired = s.spec.replicas ?? 0
  const ready = s.status.readyReplicas ?? 0
  const current = s.status.currentReplicas ?? 0
  const updated = s.status.updatedReplicas ?? 0

  const ns = selectedNamespace === '_all'
    ? (s.metadata.namespace ?? '')
    : (selectedNamespace ?? s.metadata.namespace ?? '')

  const handleScale = async () => {
    if (!selectedContext) return
    const reps = parseInt(scaleVal)
    if (isNaN(reps) || reps < 0) return
    setScaleLoading(true)
    try {
      await window.kubectl.scaleResource(selectedContext, ns, 'statefulset', s.metadata.name, reps)
      setScaleMsg(`Scaled to ${reps} replicas`)
      setTimeout(() => setScaleMsg(''), 5000)
      setShowScale(false)
    } catch (err) {
      setScaleMsg(`Error: ${(err as Error).message}`)
    } finally {
      setScaleLoading(false)
    }
  }

  const handleRestart = async () => {
    await rolloutRestart('statefulset', s.metadata.name, s.metadata.namespace)
    setRestartMsg('Restart triggered')
    setTimeout(() => setRestartMsg(''), 5000)
  }

  const loadEvents = async () => {
    if (!selectedContext) return
    setEventsLoading(true)
    try {
      const evts = await window.kubectl.getResourceEvents(selectedContext, ns, 'StatefulSet', s.metadata.name)
      setEvents(evts)
    } catch {
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }

  useEffect(() => {
    scanResource(s as any)
  }, [s.metadata.uid])

  useEffect(() => {
    if (tab === 'events') loadEvents()
  }, [tab, s.metadata.uid])

  return (
    <div className="flex flex-col w-full h-full relative">
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{s.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{s.metadata.namespace}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openYAML('statefulset', s.metadata.name, false, s.metadata.namespace)}
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
        {(restartMsg || scaleMsg) && (
          <p className={`text-[10px] font-bold mt-3 uppercase tracking-wider ${scaleMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
            {restartMsg || scaleMsg}
          </p>
        )}
      </div>

      {/* Owner chain breadcrumb */}
      {s.metadata.uid && (
        <OwnerChain
          uid={s.metadata.uid}
          kind="StatefulSet"
          name={s.metadata.name}
          namespace={s.metadata.namespace ?? ''}
        />
      )}

      <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white/[0.02]">
        {(['overview', 'events'] as Tab[]).map(t => (
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
          {scanResults[s.metadata.uid]?.summary.errors > 0 && (
            <span className="text-[9px] font-black bg-red-500/20 text-red-400 rounded-full px-1.5 py-0.5">{scanResults[s.metadata.uid].summary.errors}</span>
          )}
          {tab === 'analysis' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        {tab === 'overview' && (
          <div className="space-y-8">
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Server size={12} /> Replicas
              </h4>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusCard label="Desired" value={desired} color="text-slate-200" />
                <StatusCard label="Ready" value={ready} color={ready >= desired ? 'text-emerald-400' : 'text-amber-400'} />
                <StatusCard label="Current" value={current} color="text-slate-400" />
                <StatusCard label="Updated" value={updated} color="text-blue-400" />
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4">Core Info</h4>
                <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4 space-y-3">
                  <InfoRow label="Service Name" value={s.spec.serviceName} mono />
                  <InfoRow label="Update Strategy" value={s.spec.updateStrategy?.type ?? 'RollingUpdate'} />
                  <InfoRow label="Created" value={formatAge(s.metadata.creationTimestamp) + ' ago'} />
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4">Selectors</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(s.spec.selector.matchLabels || {}).map(([k, v]) => (
                    <span key={k} className="text-[10px] font-bold bg-blue-500/5 text-blue-400/80 border border-blue-500/10 px-2.5 py-1 rounded-lg font-mono">
                      {k}={v}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === 'events' && (
          <div className="space-y-3">
            {eventsLoading ? (
              <div className="flex items-center gap-2 py-20 justify-center">
                <div className="w-4 h-4 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-[10px] font-bold text-slate-400 animate-pulse">Fetching events…</span>
              </div>
            ) : (
              <>
                {events.map((e, i) => (
                  <div key={e.metadata.uid || i} className={`p-4 rounded-2xl border transition-all ${e.type === 'Warning' ? 'bg-amber-500/5 border-amber-500/10' : 'bg-slate-50 dark:bg-white/[0.02] border-slate-100 dark:border-white/5'}`}>
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest ${e.type === 'Warning' ? 'text-amber-400' : 'text-blue-400'}`}>{e.reason}</span>
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{formatAge(e.lastTimestamp || e.metadata.creationTimestamp)} ago</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">{e.message}</p>
                    {e.count && e.count > 1 && <span className="inline-block mt-2 px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Seen {e.count} times</span>}
                  </div>
                ))}
                {events.length === 0 && (
                  <div className="text-center py-20 bg-slate-50 dark:bg-white/[0.01] rounded-3xl border border-dashed border-slate-200 dark:border-white/10 mt-4">
                    <Activity size={32} className="mx-auto text-slate-700 mb-4 opacity-20" />
                    <p className="text-sm text-slate-500 font-medium">No recent events found</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'analysis' && (
          <div>
            {(isScanning && !scanResults[s.metadata.uid]) ? (
              <div className="flex items-center gap-2 py-20 justify-center">
                <div className="w-4 h-4 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-[10px] font-bold text-slate-400 animate-pulse">Running analysis…</span>
              </div>
            ) : scanResults[s.metadata.uid] ? (
              <AnalysisView result={scanResults[s.metadata.uid]} />
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
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${s.metadata.name}`}
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

      {/* Scale Dialog */}
      {showScale && (
        <div className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-xs overflow-hidden">
            <div className="p-6">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6">Scale Resource</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Target Replicas</label>
                  <input
                    type="number"
                    min={0}
                    value={scaleVal}
                    onChange={e => setScaleVal(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white text-sm font-bold py-3 px-4 rounded-2xl border border-slate-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    placeholder="0"
                    autoFocus
                  />
                </div>
              </div>
            </div>
            <div className="flex bg-slate-50 dark:bg-white/5 p-4 gap-3">
              <button
                onClick={() => setShowScale(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleScale}
                disabled={scaleLoading}
                className="flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 shadow-lg shadow-blue-500/20"
              >
                {scaleLoading ? 'Scaling...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusCard({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 rounded-2xl p-4 transition-colors">
      <p className={`text-2xl font-black ${color} tracking-tight`}>{value}</p>
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widst mt-1">{label}</p>
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
