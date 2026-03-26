import React, { useState } from 'react'
import type { KubeJob } from '../../../types'
import { formatAge } from '../../../types'
import { Play, CheckCircle2, Circle, Clock, FileCode, X, Activity, History, AlertTriangle, CheckCircle } from 'lucide-react'
import YAMLViewer from '../../common/YAMLViewer'
import { useYAMLEditor } from '../../../hooks/useYAMLEditor'
import { useAppStore } from '../../../store'
import { useResourceEvents } from '../../../hooks/useResourceEvents'

interface Props { job: KubeJob }

export default function JobDetail({ job }: Props): JSX.Element {
  const { yaml, loading: yamlLoading, error: yamlError, open: openYAML, apply: applyYAML, close: closeYAML } = useYAMLEditor()
  const { selectedContext: ctx } = useAppStore()
  const { events } = useResourceEvents(ctx, job.metadata.name, 'Job', job.metadata.namespace)

  const conditions = job.status.conditions ?? []
  const startTime = job.status.startTime
  const completionTime = job.status.completionTime

  return (
    <div className="flex flex-col w-full h-full relative">
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{job.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{job.metadata.namespace}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openYAML('job', job.metadata.name, false, job.metadata.namespace)}
              disabled={yamlLoading}
              className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2 group disabled:opacity-50"
            >
              <FileCode size={14} className="group-hover:text-blue-400 transition-colors" />
              {yamlLoading ? 'Loading...' : 'YAML'}
            </button>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 ${job.status.succeeded ? 'bg-emerald-500/10 text-emerald-500 outline-emerald-500/20' : job.status.failed ? 'bg-red-500/10 text-red-500 outline-red-500/20' : 'bg-blue-500/10 text-blue-500 outline-blue-500/20'}`}>
              {job.status.succeeded ? 'COMPLETED' : job.status.failed ? 'FAILED' : 'RUNNING'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            {/* Progress */}
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Play size={12} /> Progress
              </h4>
              <div className="bg-slate-50 dark:bg-white/[0.03] rounded-2xl p-4 border border-slate-100 dark:border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Completions</span>
                  <span className="text-sm font-black text-slate-700 dark:text-slate-200 font-mono italic">
                    {job.status.succeeded ?? 0} / {job.spec.completions ?? 1}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-1000"
                    style={{ width: `${((job.status.succeeded ?? 0) / (job.spec.completions ?? 1)) * 100}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-6 py-4 border-t border-slate-100 dark:border-white/5">
                  <MetaItem label="Active" value={String(job.status.active ?? 0)} />
                  <MetaItem label="Succeeded" value={String(job.status.succeeded ?? 0)} />
                  <MetaItem label="Failed" value={String(job.status.failed ?? 0)} />
                  <MetaItem label="Parallelism" value={String(job.spec.parallelism ?? 1)} />
                </div>
              </div>
            </section>

            {/* Timing */}
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Clock size={12} /> Timing
              </h4>
              <div className="space-y-3">
                <TimeRow label="Started" value={startTime ? formatAge(startTime) + ' ago' : '—'} />
                <TimeRow label="Finished" value={completionTime ? formatAge(completionTime) + ' ago' : '—'} />
                <TimeRow label="Duration" value={startTime && completionTime ? calculateDuration(startTime, completionTime) : 'In progress...'} />
              </div>
            </section>
          </div>

          {/* Conditions */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <History size={12} /> Timeline
            </h4>
            <div className="space-y-3">
              {conditions.map((c, i) => (
                <div key={i} className="flex gap-4 p-4 bg-slate-50 dark:bg-white/[0.03] rounded-2xl border border-slate-100 dark:border-white/5 relative overflow-hidden group">
                  {c.status === 'True' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/50" />}
                  <div className={`mt-0.5 shrink-0 ${c.status === 'True' ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {c.type === 'Complete' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                  </div>
                  <div>
                    <h5 className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">{c.type}</h5>
                    <p className="text-[10px] font-bold text-slate-500 mt-1 leading-relaxed">{c.reason}: {c.message}</p>
                    {c.lastTransitionTime && (
                      <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-tighter">{formatAge(c.lastTransitionTime)} ago</p>
                    )}
                  </div>
                </div>
              ))}
              {conditions.length === 0 && (
                <div className="text-center py-12 bg-slate-50 dark:bg-white/[0.01] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
                  <p className="text-xs text-slate-400">No conditions reported yet</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Events */}
        <section>
          <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Activity size={12} /> Events
            {events.some(e => e.type === 'Warning') && (
              <span className="text-[9px] font-black bg-amber-500/20 text-amber-400 rounded-full px-1.5 py-0.5 ml-1">{events.filter(e => e.type === 'Warning').length} warning{events.filter(e => e.type === 'Warning').length > 1 ? 's' : ''}</span>
            )}
          </h4>
          <div className="space-y-2">
            {events.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 dark:bg-white/[0.01] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
                <p className="text-xs text-slate-400">No events recorded for this Job</p>
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
        </section>
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
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${job.metadata.name}`}
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

function calculateDuration(start: string, end: string) {
  const diff = new Date(end).getTime() - new Date(start).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s`
}

function MetaItem({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{label}</dt>
      <dd className="text-xs font-bold text-slate-700 dark:text-slate-200">{value}</dd>
    </div>
  )
}

function TimeRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-white/5 last:border-0 italic">
      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</span>
      <span className="text-xs font-bold text-slate-600 dark:text-slate-300 font-mono">{value}</span>
    </div>
  )
}
