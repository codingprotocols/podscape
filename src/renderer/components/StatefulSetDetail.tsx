import React, { useState, useEffect } from 'react'
import type { KubeStatefulSet, KubeEvent } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import YAMLViewer from './YAMLViewer'

interface Props { statefulSet: KubeStatefulSet }

type Tab = 'overview' | 'events'

export default function StatefulSetDetail({ statefulSet: s }: Props): JSX.Element {
  const { rolloutRestart, getYAML, selectedContext, selectedNamespace } = useAppStore()
  const [tab, setTab] = useState<Tab>('overview')
  const [showScale, setShowScale] = useState(false)
  const [scaleVal, setScaleVal] = useState(String(s.spec.replicas ?? 1))
  const [scaleLoading, setScaleLoading] = useState(false)
  const [scaleMsg, setScaleMsg] = useState('')
  const [restartMsg, setRestartMsg] = useState('')
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
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

  const handleViewYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    try {
      const content = await getYAML('statefulset', s.metadata.name, false, s.metadata.namespace)
      setYaml(content)
    } catch (err) {
      setYamlError((err as Error).message ?? 'Failed to fetch YAML')
    } finally {
      setYamlLoading(false)
    }
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
    if (tab === 'events') loadEvents()
  }, [tab, s.metadata.uid])

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono truncate">{s.metadata.name}</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{s.metadata.namespace}</p>
          </div>
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${ready >= desired ? 'bg-green-500/20 text-green-300 ring-green-500/30' : 'bg-yellow-500/20 text-yellow-300 ring-yellow-500/30'
            }`}>
            {ready}/{desired} ready
          </span>
        </div>
        <div className="flex gap-2 mt-2.5">
          <button onClick={() => setShowScale(true)}
            className="text-xs px-3 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition-colors">
            Scale
          </button>
          <button onClick={handleRestart}
            className="text-[11px] font-bold px-4 py-1.5 rounded-xl bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-white/5 hover:bg-white/10 transition-all uppercase tracking-wider">
            Restart
          </button>
          <button onClick={handleViewYAML} disabled={yamlLoading}
            className="text-[11px] font-bold px-4 py-1.5 rounded-xl bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-white/5 hover:bg-white/10 transition-all disabled:opacity-50 uppercase tracking-wider">
            {yamlLoading ? 'Loading…' : 'YAML'}
          </button>
        </div>
        {restartMsg && <p className="text-xs text-green-400 mt-1.5">{restartMsg}</p>}
        {scaleMsg && <p className={`text-xs mt-1.5 ${scaleMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{scaleMsg}</p>}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
        {(['overview', 'events'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${tab === t ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:text-slate-300'
              }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Replicas */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Replicas</h4>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Desired', value: desired, color: 'text-slate-700 dark:text-slate-200' },
                { label: 'Ready', value: ready, color: ready >= desired ? 'text-green-500' : 'text-yellow-400' },
                { label: 'Current', value: current, color: 'text-slate-600 dark:text-slate-300' },
                { label: 'Updated', value: updated, color: 'text-blue-500' }
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center bg-white/[0.03] rounded-2xl p-3 border border-slate-100 dark:border-white/5">
                  <p className={`text-xl font-black ${color}`}>{value}</p>
                  <p className="text-[9px] font-black text-slate-500 dark:text-slate-600 mt-1 uppercase tracking-widest leading-none">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Info</h4>
            <dl className="space-y-1.5">
              <Row label="Service Name" value={s.spec.serviceName} />
              <Row label="Created" value={formatAge(s.metadata.creationTimestamp) + ' ago'} />
            </dl>
          </div>

          {/* Selector */}
          {s.spec.selector.matchLabels && (
            <div className="px-4 py-3">
              <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Selector</h4>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(s.spec.selector.matchLabels).map(([k, v]) => (
                  <span key={k} className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded font-mono">
                    {k}={v}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'events' && (
        <div className="px-4 py-3 flex-1">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Events</h4>
            <button onClick={loadEvents} disabled={eventsLoading}
              className="text-xs px-2 py-1 rounded bg-white/5 text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-800 hover:bg-white/10 transition-colors disabled:opacity-50">
              {eventsLoading ? '…' : 'Refresh'}
            </button>
          </div>
          {eventsLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-5 h-5 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No events found</p>
          ) : (
            <div className="space-y-2">
              {events.map((e, i) => (
                <div key={e.metadata.uid || i} className={`rounded p-2 text-xs ${e.type === 'Warning' ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-white/5 border border-slate-100 dark:border-slate-800'
                  }`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`font-medium ${e.type === 'Warning' ? 'text-yellow-300' : 'text-slate-600 dark:text-slate-300'}`}>{e.reason}</span>
                    <span className="text-slate-500 dark:text-slate-400 text-[10px]">{e.count ? `×${e.count}` : ''}</span>
                  </div>
                  <p className="text-slate-400 dark:text-slate-500 leading-relaxed">{e.message}</p>
                  {e.lastTimestamp && <p className="text-slate-500 dark:text-slate-400 mt-1">{formatAge(e.lastTimestamp)} ago</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inline scale dialog */}
      {showScale && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 w-80 p-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Scale StatefulSet</h3>
            <label className="block text-xs text-slate-400 dark:text-slate-500 mb-1">Replicas</label>
            <input type="number" min={0} value={scaleVal} onChange={e => setScaleVal(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm rounded border border-slate-200 dark:border-slate-700 px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowScale(false)}
                className="text-xs px-4 py-2 rounded bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800 hover:bg-white/10 transition-colors">
                Cancel
              </button>
              <button onClick={handleScale} disabled={scaleLoading}
                className="text-xs px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
                {scaleLoading ? 'Scaling…' : 'Scale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {((yamlLoading || yaml !== null || yamlError !== null)) && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">{yamlLoading ? 'Loading YAML…' : `YAML — ${s.metadata.name}`}</h3>
              <button onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 transition-colors">✕</button>
            </div>
            <div className="flex-1 min-h-0">
              {yamlError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                  <p className="text-sm font-bold text-red-400">Failed to load YAML</p>
                  <pre className="text-xs text-slate-400 dark:text-slate-500 whitespace-pre-wrap">{yamlError}</pre>
                </div>
              ) : yamlLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : yaml !== null ? <YAMLViewer content={yaml} /> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0">{label}</dt>
      <dd className="text-xs text-slate-700 dark:text-slate-200">{value}</dd>
    </div>
  )
}
