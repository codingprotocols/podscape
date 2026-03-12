import React, { useState } from 'react'
import type { KubePVC } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import { FileCode, X, Activity, Database, HardDrive, Info } from 'lucide-react'
import YAMLViewer from './YAMLViewer'

interface Props { pvc: KubePVC }

export default function PVCDetail({ pvc }: Props): JSX.Element {
  const { getYAML, applyYAML, refresh } = useAppStore()
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)

  const phase = pvc.status.phase ?? 'Unknown'
  const capacity = Object.values(pvc.status.capacity ?? {})[0] ?? pvc.spec.resources?.requests?.storage ?? '—'
  const accessModes = (pvc.status.accessModes ?? pvc.spec.accessModes ?? []).join(', ')

  const handleViewYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    try {
      const content = await getYAML('pvc', pvc.metadata.name, false, pvc.metadata.namespace)
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
    <div className="flex flex-col w-full h-full relative font-sans">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{pvc.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{pvc.metadata.namespace} · PVC</p>
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
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 ${phase === 'Bound' ? 'bg-emerald-500/10 text-emerald-500 outline-emerald-500/20' : 'bg-amber-500/10 text-amber-500 outline-amber-500/20'}`}>
              {phase.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <div className="space-y-8">
          {/* Capacity Hero */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Database size={12} /> Storage status
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 rounded-2xl p-6 text-center shadow-sm">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Phase</p>
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-black ${phase === 'Bound' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                  {phase}
                </div>
              </div>
              <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 rounded-2xl p-6 text-center shadow-sm">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Capacity</p>
                <span className="text-3xl font-black text-slate-100 tabular-nums drop-shadow-lg">{capacity}</span>
              </div>
            </div>
          </section>

          {/* Details */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <HardDrive size={12} /> Volume Spec
              </h4>
              <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-5 space-y-4 shadow-inner">
                <InfoRow label="Access Modes" value={accessModes} />
                <InfoRow label="Volume Name" value={pvc.spec.volumeName ?? '—'} mono />
                <InfoRow label="Storage Class" value={pvc.spec.storageClassName ?? '—'} />
                <InfoRow label="Volume Mode" value={pvc.spec.volumeMode ?? 'Filesystem'} />
              </div>
            </div>

            <div>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Info size={12} /> Timing
              </h4>
              <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-5 space-y-4 shadow-inner">
                <InfoRow label="Created" value={formatAge(pvc.metadata.creationTimestamp) + ' ago'} />
                {pvc.spec.resources?.requests?.storage && (
                  <InfoRow label="Requested" value={pvc.spec.resources.requests.storage} />
                )}
              </div>
            </div>
          </section>

          {/* Labels */}
          {pvc.metadata.labels && (
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4">Labels</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(pvc.metadata.labels).map(([k, v]) => (
                  <span key={k} className="px-3 py-1.5 bg-white/[0.02] border border-white/5 rounded-xl text-[10px] font-bold font-mono text-slate-400">
                    <span className="text-blue-400/70">{k}</span>={v}
                  </span>
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
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${pvc.metadata.name}`}
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
