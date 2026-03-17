import React from 'react'
import type { KubeRoleBinding, KubeClusterRoleBinding } from '../types'
import { formatAge } from '../types'
import { FileCode, X, Activity, Link as LinkIcon, Users, User, Box } from 'lucide-react'
import YAMLViewer from './YAMLViewer'
import { useYAMLEditor } from '../hooks/useYAMLEditor'

type Binding = KubeRoleBinding | KubeClusterRoleBinding

export default function RoleBindingDetail({ binding }: { binding: Binding }) {
  const { yaml, loading: yamlLoading, error: yamlError, open: openYAML, apply: applyYAML, close: closeYAML } = useYAMLEditor()

  const isCluster = !binding.metadata.namespace
  const subjects = binding.subjects ?? []

  return (
    <div className="flex flex-col w-full h-full relative font-sans">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{binding.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
              {isCluster ? 'CLUSTER-WIDE SCOPED' : `${binding.metadata.namespace} · ROLE BINDING`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openYAML(isCluster ? 'clusterrolebinding' : 'rolebinding', binding.metadata.name, false, binding.metadata.namespace)}
              disabled={yamlLoading}
              className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2 group disabled:opacity-50"
            >
              <FileCode size={14} className="group-hover:text-blue-400 transition-colors" />
              {yamlLoading ? 'Loading...' : 'YAML'}
            </button>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 ${isCluster ? 'bg-purple-500/10 text-purple-400 outline-purple-500/20' : 'bg-violet-500/10 text-violet-400 outline-violet-500/20'}`}>
              {isCluster ? 'CRB' : 'RB'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <div className="space-y-8">
          {/* Role Ref */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <LinkIcon size={12} /> Role Reference
            </h4>
            <div className="bg-violet-500/5 border border-violet-500/10 rounded-2xl p-5 shadow-[inset_0_0_25px_rgba(139,92,246,0.03)] group">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                <div className="space-y-4">
                  <div>
                    <p className="text-[9px] font-black text-violet-400/60 uppercase tracking-widest mb-1.5">Reference Kind</p>
                    <span className="text-sm font-black text-violet-400 uppercase tracking-widest">{binding.roleRef.kind}</span>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-violet-400/60 uppercase tracking-widest mb-1.5">Target Name</p>
                    <span className="text-xs font-bold text-slate-200 font-mono italic break-all underline decoration-violet-500/30 underline-offset-4">{binding.roleRef.name}</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-[9px] font-black text-violet-400/60 uppercase tracking-widest mb-1.5">API Group</p>
                    <span className="text-[10px] font-bold text-slate-400 font-mono">{binding.roleRef.apiGroup || 'rbac.authorization.k8s.io'}</span>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-violet-400/60 uppercase tracking-widest mb-1.5">Created</p>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{formatAge(binding.metadata.creationTimestamp)} ago</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Subjects */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Users size={12} /> Bound Subjects ({subjects.length})
            </h4>
            <div className="space-y-3">
              {subjects.map((s, i) => (
                <div key={i} className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4 flex items-center gap-4 transition-all hover:bg-white/[0.04]">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.kind === 'ServiceAccount' ? 'bg-blue-500/10 text-blue-400' :
                      s.kind === 'User' ? 'bg-emerald-500/10 text-emerald-400' :
                        'bg-orange-500/10 text-orange-400'
                    }`}>
                    {s.kind === 'ServiceAccount' ? <Box size={18} /> :
                      s.kind === 'User' ? <User size={18} /> :
                        <Users size={18} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold text-slate-200 font-mono truncate">{s.name}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg border ${s.kind === 'ServiceAccount' ? 'bg-blue-500/5 text-blue-500/80 border-blue-500/10' :
                          s.kind === 'User' ? 'bg-emerald-500/5 text-emerald-500/80 border-emerald-500/10' :
                            'bg-orange-500/5 text-orange-500/80 border-orange-500/10'
                        }`}>
                        {s.kind.toUpperCase()}
                      </span>
                    </div>
                    {s.namespace && (
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{s.namespace}</p>
                    )}
                  </div>
                </div>
              ))}
              {subjects.length === 0 && (
                <div className="text-center py-10 bg-slate-50 dark:bg-white/[0.01] rounded-3xl border border-dashed border-slate-200 dark:border-white/10">
                  <p className="text-xs text-slate-500 font-medium italic">No subjects bound to this role</p>
                </div>
              )}
            </div>
          </section>

          {/* Labels */}
          {binding.metadata.labels && (
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4">Labels</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(binding.metadata.labels).map(([k, v]) => (
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
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${binding.metadata.name}`}
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
