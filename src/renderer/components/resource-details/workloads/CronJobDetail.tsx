import React, { useEffect, useRef, useState } from 'react'
import type { KubeCronJob, KubeJob } from '../../../types'
import { formatAge } from '../../../types'
import { Clock, Play, FileCode, X, Activity, History, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { RefreshButton } from '../../common'
import YAMLViewer from '../../common/YAMLViewer'
import { useYAMLEditor } from '../../../hooks/useYAMLEditor'
import { useAppStore } from '../../../store'

interface Props { cronJob: KubeCronJob }

type TriggerState = 'idle' | 'running' | 'done' | 'error'

function jobStatus(job: KubeJob): { label: string; color: string } {
  if (job.status.active) return { label: 'Running', color: 'blue' }
  if (job.status.succeeded) return { label: 'Succeeded', color: 'emerald' }
  if (job.status.failed) return { label: 'Failed', color: 'red' }
  // Check conditions
  const failed = job.status.conditions?.find(c => c.type === 'Failed' && c.status === 'True')
  if (failed) return { label: 'Failed', color: 'red' }
  return { label: 'Pending', color: 'amber' }
}

function jobDuration(job: KubeJob): string {
  if (!job.status.startTime) return '—'
  const end = job.status.completionTime ? new Date(job.status.completionTime) : new Date()
  const start = new Date(job.status.startTime)
  const secs = Math.round((end.getTime() - start.getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

export default function CronJobDetail({ cronJob: cj }: Props): JSX.Element {
  const { yaml, loading: yamlLoading, error: yamlError, open: openYAML, apply: applyYAML, close: closeYAML } = useYAMLEditor()
  const { selectedContext, selectedNamespace } = useAppStore()

  const [recentJobs, setRecentJobs] = useState<KubeJob[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)

  const [triggerState, setTriggerState] = useState<TriggerState>('idle')
  const [triggerMsg, setTriggerMsg] = useState('')
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current)
  }, [])

  const fetchRecentJobs = async () => {
    if (!selectedContext) return
    setJobsLoading(true)
    try {
      const ns = cj.metadata.namespace ?? (selectedNamespace === '_all' ? null : selectedNamespace)
      const all = await window.kubectl.getJobs(selectedContext, ns) as KubeJob[]
      const owned = all.filter(j =>
        j.metadata.ownerReferences?.some(ref => ref.kind === 'CronJob' && ref.name === cj.metadata.name)
      )
      // Sort newest first
      owned.sort((a, b) => {
        const aTime = a.status.startTime ?? a.metadata.creationTimestamp
        const bTime = b.status.startTime ?? b.metadata.creationTimestamp
        return new Date(bTime).getTime() - new Date(aTime).getTime()
      })
      setRecentJobs(owned)
    } catch {
      // non-critical — silently fail
    } finally {
      setJobsLoading(false)
    }
  }

  useEffect(() => {
    fetchRecentJobs()
  }, [selectedContext, cj.metadata.name, cj.metadata.namespace]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTrigger = async () => {
    if (!selectedContext) return
    setTriggerState('running')
    setTriggerMsg('')
    try {
      const ns = cj.metadata.namespace ?? (selectedNamespace === '_all' ? '' : selectedNamespace) ?? ''
      const jobName = await window.kubectl.triggerCronJob(selectedContext, ns, cj.metadata.name)
      setTriggerState('done')
      setTriggerMsg(`Created job: ${jobName}`)
      // Refresh recent jobs after a short delay so the new job appears
      if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(fetchRecentJobs, 1000)
    } catch (err) {
      setTriggerState('error')
      setTriggerMsg((err as Error).message)
    }
  }

  return (
    <div className="flex flex-col w-full h-full relative">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{cj.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
              {cj.metadata.namespace} · {cj.spec.schedule}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Trigger Now */}
            <button
              onClick={triggerState === 'idle' || triggerState === 'done' || triggerState === 'error' ? handleTrigger : undefined}
              disabled={triggerState === 'running'}
              title="Trigger job manually"
              className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/30 transition-all flex items-center gap-2 group disabled:opacity-50"
            >
              {triggerState === 'running'
                ? <><Loader2 size={12} className="animate-spin" /> Triggering…</>
                : <><Play size={12} /> Trigger Now</>
              }
            </button>
            <button
              onClick={() => openYAML('cronjob', cj.metadata.name, false, cj.metadata.namespace)}
              disabled={yamlLoading}
              className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2 group disabled:opacity-50"
            >
              <FileCode size={14} className="group-hover:text-blue-400 transition-colors" />
              {yamlLoading ? 'Loading...' : 'YAML'}
            </button>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 ${cj.spec.suspend ? 'bg-amber-500/10 text-amber-500 outline-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 outline-emerald-500/20'}`}>
              {cj.spec.suspend ? 'SUSPENDED' : 'ACTIVE'}
            </span>
          </div>
        </div>

        {/* Trigger feedback */}
        {triggerState !== 'idle' && (
          <div className={`mt-3 flex items-center gap-2 text-[10px] font-bold animate-in slide-in-from-top-1 duration-150 ${
            triggerState === 'done' ? 'text-emerald-400'
              : triggerState === 'error' ? 'text-red-400'
              : 'text-slate-400'
          }`}>
            {triggerState === 'done'    && <CheckCircle2 size={12} />}
            {triggerState === 'error'   && <AlertCircle size={12} />}
            {triggerState === 'running' && <Loader2 size={12} className="animate-spin" />}
            {triggerMsg || (triggerState === 'running' ? 'Creating job…' : '')}
            {(triggerState === 'done' || triggerState === 'error') && (
              <button onClick={() => setTriggerState('idle')} className="ml-1 text-slate-500 hover:text-slate-300">
                <X size={10} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Info */}
          <div className="space-y-6">
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Clock size={12} /> Schedule
              </h4>
              <div className="bg-slate-50 dark:bg-white/[0.03] rounded-2xl p-4 border border-slate-100 dark:border-white/5">
                <p className="text-lg font-black text-slate-700 dark:text-slate-200 font-mono tracking-tight">{cj.spec.schedule}</p>
                <div className="grid grid-cols-2 gap-4 mt-4 py-4 border-t border-slate-100 dark:border-white/5">
                  <MetaItem label="Last Schedule" value={cj.status.lastScheduleTime ? formatAge(cj.status.lastScheduleTime) + ' ago' : 'Never'} />
                  <MetaItem label="Concurrency" value={cj.spec.concurrencyPolicy ?? 'Allow'} />
                  {cj.status.lastSuccessfulTime && (
                    <MetaItem label="Last Success" value={formatAge(cj.status.lastSuccessfulTime) + ' ago'} />
                  )}
                  <MetaItem label="Created" value={formatAge(cj.metadata.creationTimestamp) + ' ago'} />
                </div>
              </div>
            </section>

            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <History size={12} /> Status
              </h4>
              <div className="flex flex-wrap gap-3">
                <StatusBadge label="Running" value={cj.status.active?.length ?? 0} active={!!cj.status.active?.length} />
                <StatusBadge label="History Limit (ok)" value={cj.spec.successfulJobsHistoryLimit ?? 3} />
                <StatusBadge label="History Limit (fail)" value={cj.spec.failedJobsHistoryLimit ?? 1} />
              </div>
            </section>
          </div>

          {/* Recent Jobs */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><Play size={12} /> Recent Jobs</span>
              <RefreshButton
                onClick={fetchRecentJobs}
                loading={jobsLoading}
                title="Refresh jobs"
              />
            </h4>
            <div className="space-y-2">
              {jobsLoading && recentJobs.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-slate-500">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              ) : recentJobs.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 dark:bg-white/[0.01] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
                  <p className="text-xs text-slate-400">No recent jobs found</p>
                </div>
              ) : (
                recentJobs.slice(0, 10).map(job => {
                  const { label, color } = jobStatus(job)
                  const colorMap: Record<string, string> = {
                    blue: 'bg-blue-500/5 border-blue-500/10 text-blue-400 dot-blue',
                    emerald: 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400',
                    red: 'bg-red-500/5 border-red-500/10 text-red-400',
                    amber: 'bg-amber-500/5 border-amber-500/10 text-amber-400',
                  }
                  const dotColor: Record<string, string> = {
                    blue: 'bg-blue-500 animate-pulse',
                    emerald: 'bg-emerald-500',
                    red: 'bg-red-500',
                    amber: 'bg-amber-400',
                  }
                  return (
                    <div key={job.metadata.uid} className={`flex items-center justify-between p-3 border rounded-xl ${colorMap[color]}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-1.5 h-1.5 shrink-0 rounded-full ${dotColor[color]}`} />
                        <span className="text-[11px] font-bold font-mono truncate">{job.metadata.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className="text-[9px] text-slate-400">{job.status.startTime ? formatAge(job.status.startTime) + ' ago' : formatAge(job.metadata.creationTimestamp) + ' ago'}</span>
                        <span className="text-[9px] text-slate-500">{jobDuration(job)}</span>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-current/10`}>{label}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </div>
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
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${cj.metadata.name}`}
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

function MetaItem({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{label}</dt>
      <dd className="text-xs font-bold text-slate-700 dark:text-slate-200">{value}</dd>
    </div>
  )
}

function StatusBadge({ label, value, active }: { label: string, value: string | number, active?: boolean }) {
  return (
    <div className={`px-3 py-2 rounded-xl border transition-all ${active ? 'bg-blue-500/10 border-blue-500/20 text-blue-500' : 'bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 text-slate-400 dark:text-slate-500'}`}>
      <span className="text-[10px] font-black uppercase tracking-widest block mb-0.5">{label}</span>
      <span className="text-xs font-black">{value}</span>
    </div>
  )
}
