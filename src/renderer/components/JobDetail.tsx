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
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600/10 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600 dark:text-blue-400">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{job.metadata.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ring-1 ring-inset ${isComplete
                ? 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/20'
                : failed > 0
                  ? 'bg-red-500/10 text-red-500 ring-red-500/20'
                  : 'bg-blue-500/10 text-blue-500 ring-blue-500/20'
                }`}>
                {isComplete ? 'Complete' : active > 0 ? 'Running' : 'Failed'}
              </span>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{job.metadata.namespace} · JOB</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleViewYAML} disabled={yamlLoading}
            className="text-[11px] font-bold px-4 py-1.5 rounded-xl bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-white/5 hover:bg-white/10 transition-all disabled:opacity-50 uppercase tracking-wider">
            {yamlLoading ? 'Loading…' : 'YAML'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 py-2 gap-2 border-b border-slate-100 dark:border-white/5 bg-white/[0.02] shrink-0">
        {(['overview', 'events'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${tab === t
              ? 'bg-blue-600/10 text-blue-400 shadow-[inset_0_0_12px_rgba(59,130,246,0.1)]'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/5'
              }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Status counters */}
          <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5">
            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Status</h4>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Active', value: active, color: active > 0 ? 'text-blue-400' : 'text-slate-500 dark:text-slate-400' },
                { label: 'Succeeded', value: succeeded, color: succeeded > 0 ? 'text-emerald-400' : 'text-slate-500 dark:text-slate-400' },
                { label: 'Failed', value: failed, color: failed > 0 ? 'text-red-400' : 'text-slate-500 dark:text-slate-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center bg-white/[0.03] border border-white/5 rounded-2xl py-4 transition-all hover:bg-white/[0.05]">
                  <p className={`text-xl font-bold ${color} tabular-nums`}>{value}</p>
                  <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{label}</p>
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
            <div className="px-6 py-5">
              <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Conditions</h4>
              <div className="space-y-2 px-1">
                {job.status.conditions.map(c => (
                  <div key={c.type} className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${c.status === 'True' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]' : 'bg-slate-400 dark:bg-slate-600'}`} />
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 font-bold uppercase tracking-tight">{c.type}</span>
                    {c.reason && <span className="text-[11px] text-slate-500 dark:text-slate-500 font-mono truncate">— {c.reason}</span>}
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

      {(yamlLoading || yaml !== null || yamlError !== null) && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">{yamlLoading ? 'Loading YAML…' : `YAML — ${job.metadata.name}`}</h3>
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
