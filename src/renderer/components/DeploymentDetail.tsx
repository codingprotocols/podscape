import React, { useState, useEffect } from 'react'
import type { KubeDeployment, KubeEvent } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import ScaleDialog from './ScaleDialog'
import YAMLViewer from './YAMLViewer'

interface Props { deployment: KubeDeployment }

type Tab = 'overview' | 'history' | 'events'

export default function DeploymentDetail({ deployment: d }: Props): JSX.Element {
  const { rolloutRestart, getYAML, selectedContext, selectedNamespace } = useAppStore()
  const [showScale, setShowScale] = useState(false)
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
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

  const handleViewYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    try {
      const content = await getYAML('deployment', d.metadata.name, false, d.metadata.namespace)
      setYaml(content)
    } catch (err) {
      setYamlError((err as Error).message ?? 'Failed to fetch YAML')
    } finally {
      setYamlLoading(false)
    }
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
    if (tab === 'history') loadHistory()
    if (tab === 'events') loadEvents()
  }, [tab, d.metadata.uid])

  return (
    <div className="flex flex-col w-[440px] min-w-[340px] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono truncate">{d.metadata.name}</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{d.metadata.namespace}</p>
          </div>
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${ready >= desired ? 'bg-green-500/20 text-green-300 ring-green-500/30' : 'bg-yellow-500/20 text-yellow-300 ring-yellow-500/30'
            }`}>
            {ready}/{desired} ready
          </span>
        </div>
        {/* Actions */}
        <div className="flex gap-2 mt-2.5">
          <button onClick={() => setShowScale(true)}
            className="text-xs px-3 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition-colors">
            Scale
          </button>
          <button onClick={handleRestart}
            className="text-xs px-3 py-1 rounded bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800 hover:bg-white/10 transition-colors">
            Restart
          </button>
          <button onClick={handleViewYAML} disabled={yamlLoading}
            className="text-xs px-3 py-1 rounded bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800 hover:bg-white/10 transition-colors disabled:opacity-50">
            {yamlLoading ? 'Loading…' : 'YAML'}
          </button>
        </div>
        {restartMsg && <p className="text-xs text-green-400 mt-1.5">{restartMsg}</p>}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
        {(['overview', 'history', 'events'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:text-slate-300'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <>
          {/* Replicas */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">Replicas</h4>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Desired', value: desired, color: 'text-slate-700 dark:text-slate-200' },
                { label: 'Ready', value: ready, color: ready >= desired ? 'text-green-400' : 'text-yellow-400' },
                { label: 'Available', value: available, color: 'text-slate-600 dark:text-slate-300' },
                { label: 'Updated', value: updated, color: 'text-blue-400' }
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center bg-white/5 rounded p-2">
                  <p className={`text-lg font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Strategy */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Strategy</h4>
            <dl className="space-y-1.5">
              <Row label="Type" value={d.spec.strategy?.type ?? 'RollingUpdate'} />
              {d.spec.strategy?.rollingUpdate && (
                <>
                  <Row label="Max Surge" value={String(d.spec.strategy.rollingUpdate.maxSurge ?? '25%')} />
                  <Row label="Max Unavailable" value={String(d.spec.strategy.rollingUpdate.maxUnavailable ?? '25%')} />
                </>
              )}
              <Row label="Created" value={formatAge(d.metadata.creationTimestamp) + ' ago'} />
            </dl>
          </div>

          {/* Selector labels */}
          {d.spec.selector.matchLabels && (
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Selector</h4>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(d.spec.selector.matchLabels).map(([k, v]) => (
                  <span key={k} className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded font-mono">
                    {k}={v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Conditions */}
          {d.status.conditions && d.status.conditions.length > 0 && (
            <div className="px-4 py-3">
              <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Conditions</h4>
              <div className="space-y-1.5">
                {d.status.conditions.map(c => (
                  <div key={c.type} className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.status === 'True' ? 'bg-green-400' : 'bg-slate-400 dark:bg-slate-500'}`} />
                    <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{c.type}</span>
                    {c.reason && <span className="text-xs text-slate-500 dark:text-slate-400">— {c.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'history' && (
        <div className="px-4 py-3 flex-1">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Rollout History</h4>
            <div className="flex gap-2">
              <button onClick={loadHistory} disabled={historyLoading}
                className="text-xs px-2 py-1 rounded bg-white/5 text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-800 hover:bg-white/10 transition-colors disabled:opacity-50">
                {historyLoading ? '…' : 'Refresh'}
              </button>
              <button onClick={() => handleUndo()} disabled={undoLoading}
                className="text-xs px-2 py-1 rounded bg-yellow-600/20 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-600/30 transition-colors disabled:opacity-50">
                {undoLoading ? 'Rolling back…' : 'Undo Last'}
              </button>
            </div>
          </div>
          {undoMsg && (
            <p className={`text-xs mb-3 ${undoMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{undoMsg}</p>
          )}
          {historyLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-5 h-5 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : history ? (
            <pre className="text-xs text-slate-600 dark:text-slate-300 bg-black/30 rounded p-3 overflow-x-auto whitespace-pre font-mono leading-relaxed">{history}</pre>
          ) : null}
        </div>
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
                <div key={e.metadata.uid || i} className={`rounded p-2 text-xs ${
                  e.type === 'Warning' ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-white/5 border border-slate-100 dark:border-slate-800'
                }`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`font-medium ${e.type === 'Warning' ? 'text-yellow-300' : 'text-slate-600 dark:text-slate-300'}`}>{e.reason}</span>
                    <span className="text-slate-500 dark:text-slate-400 text-[10px]">{e.count ? `×${e.count}` : ''}</span>
                  </div>
                  <p className="text-slate-400 dark:text-slate-500 leading-relaxed">{e.message}</p>
                  {e.lastTimestamp && (
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{formatAge(e.lastTimestamp)} ago</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scale dialog */}
      {showScale && (
        <ScaleDialog deployment={d} onClose={() => setShowScale(false)} />
      )}

      {/* YAML viewer */}
      {(yamlLoading || yaml !== null || yamlError !== null) && (
<<<<<<< HEAD
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {yamlLoading ? 'Loading YAML…' : `YAML — ${d.metadata.name}`}
              </h3>
              <button onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }} className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white">✕</button>
=======
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl h-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                  {yamlLoading
                    ? <div className="w-4 h-4 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin" />
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-500"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2v7h7" /></svg>
                  }
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">
                  {yamlLoading ? 'Loading YAML…' : `YAML — ${d.metadata.name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
>>>>>>> 135ceb6 (fix)
            </div>
            <div className="flex-1 min-h-0 bg-slate-950">
              {yamlError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
<<<<<<< HEAD
                  <p className="text-sm font-bold text-red-400">Failed to load YAML</p>
                  <pre className="text-xs text-slate-400 dark:text-slate-500 text-center max-w-lg break-words whitespace-pre-wrap">{yamlError}</pre>
=======
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                  </div>
                  <p className="text-sm font-bold text-red-400 text-center">Failed to load YAML</p>
                  <pre className="text-xs text-slate-400 text-center max-w-lg break-words whitespace-pre-wrap">{yamlError}</pre>
>>>>>>> 135ceb6 (fix)
                </div>
              ) : yamlLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : yaml !== null ? (
                <YAMLViewer content={yaml} />
              ) : null}
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
