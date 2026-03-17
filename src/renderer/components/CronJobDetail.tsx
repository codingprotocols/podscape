import React, { useState } from 'react'
import type { KubeCronJob, KubeJob } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import { Clock, Play, FileCode, X, Activity, History } from 'lucide-react'
import YAMLViewer from './YAMLViewer'

interface Props { cronJob: KubeCronJob }

export default function CronJobDetail({ cronJob: cj }: Props): JSX.Element {
  const { refresh, applyYAML, getYAML } = useAppStore()
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)

  const handleViewYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    try {
      const content = await getYAML('cronjob', cj.metadata.name, false, cj.metadata.namespace)
      setYaml(content)
    } catch (err) {
      setYamlError((err as Error).message ?? 'Failed to fetch YAML')
    } finally {
      setYamlLoading(false)
    }
  }

  const handleApplyYAML = async (newYaml: string) => {
    try {
      await applyYAML(newYaml)
      refresh()
      setYaml(null)
    } catch (err) {
      throw err
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
            <button
              onClick={handleViewYAML}
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
                </div>
              </div>
            </section>

            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <History size={12} /> Status
              </h4>
              <div className="flex flex-wrap gap-3">
                <StatusBadge label="Running" value={cj.status.active?.length ?? 0} active={!!cj.status.active?.length} />
                <StatusBadge label="Created" value={formatAge(cj.metadata.creationTimestamp) + ' ago'} />
              </div>
            </section>
          </div>

          {/* Jobs */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Play size={12} /> Recent Jobs
            </h4>
            <div className="space-y-3">
              {cj.status.active?.map(jobRef => (
                <div key={jobRef.name} className="flex items-center justify-between p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-[11px] font-bold font-mono text-blue-400">{jobRef.name}</span>
                  </div>
                  <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded">Running</span>
                </div>
              ))}
              {(!cj.status.active || cj.status.active.length === 0) && (
                <div className="text-center py-12 bg-slate-50 dark:bg-white/[0.01] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
                  <p className="text-xs text-slate-400">No active jobs currently running</p>
                </div>
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
                onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }}
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
                  onSave={handleApplyYAML}
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
