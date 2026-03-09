import React, { useState, useEffect } from 'react'
import type { KubeJob, KubeEvent } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import YAMLViewer from './YAMLViewer'

interface Props { job: KubeJob }

type Tab = 'overview' | 'events'

export default function JobDetail({ job }: Props): JSX.Element {
  const { getYAML, selectedContext, selectedNamespace } = useAppStore()
  const [tab, setTab] = useState<Tab>('overview')
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [events, setEvents] = useState<KubeEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  const active = job.status.active ?? 0
  const succeeded = job.status.succeeded ?? 0
  const failed = job.status.failed ?? 0
  const completions = job.spec.completions ?? 1
  const isComplete = succeeded >= completions

  const ns = selectedNamespace === '_all'
    ? (job.metadata.namespace ?? '')
    : (selectedNamespace ?? job.metadata.namespace ?? '')

  const duration = job.status.startTime && job.status.completionTime
    ? formatAge(job.status.startTime) + ' → ' + formatAge(job.status.completionTime)
    : job.status.startTime ? 'Running for ' + formatAge(job.status.startTime) : '—'

  const handleViewYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    try {
      const content = await getYAML('job', job.metadata.name, false, job.metadata.namespace)
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
      const evts = await window.kubectl.getResourceEvents(selectedContext, ns, 'Job', job.metadata.name)
      setEvents(evts)
    } catch {
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'events') loadEvents()
  }, [tab, job.metadata.uid])

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono truncate">{job.metadata.name}</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{job.metadata.namespace}</p>
          </div>
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${isComplete
              ? 'bg-green-500/20 text-green-300 ring-green-500/30'
              : failed > 0
                ? 'bg-red-500/20 text-red-300 ring-red-500/30'
                : 'bg-blue-500/20 text-blue-300 ring-blue-500/30'
            }`}>
            {isComplete ? 'Complete' : active > 0 ? 'Running' : 'Failed'}
          </span>
        </div>
        <div className="flex gap-2 mt-2.5">
          <button onClick={handleViewYAML} disabled={yamlLoading}
            className="text-xs px-3 py-1 rounded bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800 hover:bg-white/10 transition-colors disabled:opacity-50">
            {yamlLoading ? 'Loading…' : 'YAML'}
          </button>
        </div>
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
          {/* Status counters */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">Status</h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Active', value: active, color: active > 0 ? 'text-blue-400' : 'text-slate-500 dark:text-slate-400' },
                { label: 'Succeeded', value: succeeded, color: succeeded > 0 ? 'text-green-400' : 'text-slate-500 dark:text-slate-400' },
                { label: 'Failed', value: failed, color: failed > 0 ? 'text-red-400' : 'text-slate-500 dark:text-slate-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center bg-white/5 rounded p-2">
                  <p className={`text-lg font-bold ${color}`}>{value}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Spec */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Spec</h4>
            <dl className="space-y-1.5">
              <Row label="Completions" value={String(completions)} />
              <Row label="Parallelism" value={String(job.spec.parallelism ?? 1)} />
              <Row label="Backoff Limit" value={String(job.spec.backoffLimit ?? 6)} />
              <Row label="Duration" value={duration} />
              <Row label="Created" value={formatAge(job.metadata.creationTimestamp) + ' ago'} />
            </dl>
          </div>

          {/* Conditions */}
          {job.status.conditions && job.status.conditions.length > 0 && (
            <div className="px-4 py-3">
              <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Conditions</h4>
              <div className="space-y-1.5">
                {job.status.conditions.map(c => (
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

      {tab === 'events' && (
        <div className="px-4 py-3 flex-1">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Events</h4>
            <button onClick={loadEvents} disabled={eventsLoading}
              className="text-xs px-2 py-1 rounded bg-white/5 text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-800 hover:bg-white/10 disabled:opacity-50">
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

      {/* YAML viewer */}
      {(yamlLoading || yaml !== null || yamlError !== null) && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{yamlLoading ? 'Loading YAML…' : `YAML — ${job.metadata.name}`}</h3>
              <button onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }} className="text-slate-400 dark:text-slate-500 hover:text-white">✕</button>
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
