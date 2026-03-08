import React, { useState, useEffect } from 'react'
import type { KubeCronJob, KubeEvent } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import YAMLViewer from './YAMLViewer'

interface Props { cronJob: KubeCronJob }

type Tab = 'overview' | 'events'

export default function CronJobDetail({ cronJob: c }: Props): JSX.Element {
  const { getYAML, selectedContext, selectedNamespace } = useAppStore()
  const [tab, setTab] = useState<Tab>('overview')
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [events, setEvents] = useState<KubeEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  const activeJobs = c.status.active?.length ?? 0
  const isSuspended = c.spec.suspend ?? false

  const ns = selectedNamespace === '_all'
    ? (c.metadata.namespace ?? '')
    : (selectedNamespace ?? c.metadata.namespace ?? '')

  const handleViewYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    try {
      const content = await getYAML('cronjob', c.metadata.name, false, c.metadata.namespace)
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
      const evts = await window.kubectl.getResourceEvents(selectedContext, ns, 'CronJob', c.metadata.name)
      setEvents(evts)
    } catch {
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'events') loadEvents()
  }, [tab, c.metadata.uid])

  return (
    <div className="flex flex-col w-[440px] min-w-[340px] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono truncate">{c.metadata.name}</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{c.metadata.namespace}</p>
          </div>
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${
            isSuspended
              ? 'bg-slate-500/20 text-slate-400 dark:text-slate-500 ring-gray-500/30'
              : 'bg-green-500/20 text-green-300 ring-green-500/30'
          }`}>
            {isSuspended ? 'Suspended' : 'Active'}
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
            className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:text-slate-300'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Schedule */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Schedule</h4>
            <div className="bg-black/30 rounded px-3 py-2 font-mono text-sm text-green-400">
              {c.spec.schedule}
            </div>
          </div>

          {/* Status */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Status</h4>
            <dl className="space-y-1.5">
              <Row label="Active Jobs" value={String(activeJobs)} />
              <Row label="Suspended" value={isSuspended ? 'Yes' : 'No'} />
              <Row label="Last Scheduled" value={c.status.lastScheduleTime ? formatAge(c.status.lastScheduleTime) + ' ago' : 'Never'} />
              <Row label="Last Successful" value={c.status.lastSuccessfulTime ? formatAge(c.status.lastSuccessfulTime) + ' ago' : 'Never'} />
            </dl>
          </div>

          {/* Spec */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Spec</h4>
            <dl className="space-y-1.5">
              <Row label="Concurrency" value={c.spec.concurrencyPolicy ?? 'Allow'} />
              <Row label="Success History" value={String(c.spec.successfulJobsHistoryLimit ?? 3)} />
              <Row label="Failed History" value={String(c.spec.failedJobsHistoryLimit ?? 1)} />
              <Row label="Created" value={formatAge(c.metadata.creationTimestamp) + ' ago'} />
            </dl>
          </div>

          {/* Active jobs */}
          {c.status.active && c.status.active.length > 0 && (
            <div className="px-4 py-3">
              <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Active Jobs</h4>
              <div className="space-y-1">
                {c.status.active.map(j => (
                  <div key={j.name} className="flex items-center gap-2 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <span className="font-mono text-slate-600 dark:text-slate-300">{j.name}</span>
                    <span className="text-slate-500 dark:text-slate-400">{j.namespace}</span>
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
                <div key={e.metadata.uid || i} className={`rounded p-2 text-xs ${
                  e.type === 'Warning' ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-white/5 border border-slate-100 dark:border-slate-800'
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
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{yamlLoading ? 'Loading YAML…' : `YAML — ${c.metadata.name}`}</h3>
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
