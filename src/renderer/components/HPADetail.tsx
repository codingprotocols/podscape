import React, { useState } from 'react'
import type { KubeHPA } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import { FileCode, X, Activity, Cpu, Target, History } from 'lucide-react'
import YAMLViewer from './YAMLViewer'

interface Props { hpa: KubeHPA }

export default function HPADetail({ hpa }: Props): JSX.Element {
  const { getYAML, applyYAML, refresh } = useAppStore()
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)

  const current = hpa.status.currentReplicas
  const desired = hpa.status.desiredReplicas
  const max = hpa.spec.maxReplicas
  const min = hpa.spec.minReplicas ?? 1
  const scalePct = max > min ? Math.round(((current - min) / (max - min)) * 100) : 0

  const handleViewYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    try {
      const content = await getYAML('hpa', hpa.metadata.name, false, hpa.metadata.namespace)
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
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{hpa.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{hpa.metadata.namespace} · HPA</p>
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
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 ${current === desired ? 'bg-emerald-500/10 text-emerald-500 outline-emerald-500/20' : 'bg-amber-500/10 text-amber-500 outline-amber-500/20'}`}>
              REPLICAS: {current}/{desired}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <div className="space-y-8">
          {/* Replica Gauge */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Cpu size={12} /> Autoscaling
            </h4>
            <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 rounded-2xl p-6 relative overflow-hidden group">
              <div className="flex justify-between items-end mb-6 relative z-10">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Current</span>
                  <span className="text-3xl font-black text-purple-400 tabular-nums">{current}</span>
                </div>
                <div className="text-center pb-2">
                  <div className="px-3 py-1 bg-purple-500/10 rounded-full border border-purple-500/20">
                    <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Desired: {desired}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Range</span>
                  <span className="text-lg font-black text-slate-300 tabular-nums">{min} — {max}</span>
                </div>
              </div>
              <div className="relative h-2.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden shadow-inner">
                <div
                  className="absolute left-0 h-full bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.5)] rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${scalePct}%` }}
                />
              </div>
            </div>
          </section>

          {/* Target Info */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Target size={12} /> Scale Target
              </h4>
              <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4 space-y-3">
                <InfoRow label="Target Kind" value={hpa.spec.scaleTargetRef.kind} />
                <InfoRow label="Target Name" value={hpa.spec.scaleTargetRef.name} mono />
                <InfoRow label="API Version" value={hpa.spec.scaleTargetRef.apiVersion || '—'} mono />
              </div>
            </div>

            <div>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <History size={12} /> Timing
              </h4>
              <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4 space-y-3">
                <InfoRow label="Last Scale" value={hpa.status.lastScaleTime ? formatAge(hpa.status.lastScaleTime) + ' ago' : 'Never'} />
                <InfoRow label="Created" value={formatAge(hpa.metadata.creationTimestamp) + ' ago'} />
              </div>
            </div>
          </section>

          {/* Conditions */}
          {hpa.status.conditions && (
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4">Autoscaling Conditions</h4>
              <div className="space-y-3">
                {hpa.status.conditions.map((c, i) => (
                  <div key={i} className={`p-4 rounded-2xl border transition-all ${c.status === 'True' ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-red-500/5 border-red-500/10'}`}>
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest ${c.status === 'True' ? 'text-emerald-400' : 'text-red-400'}`}>{c.type}</span>
                      {c.lastTransitionTime && (
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{formatAge(c.lastTransitionTime)} ago</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">{c.message}</p>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-2">{c.reason}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
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
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${hpa.metadata.name}`}
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
                <YAMLViewer
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

function InfoRow({ label, value, mono }: { label: string, value: string, mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      <span className={`text-[11px] font-bold text-slate-300 ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}
