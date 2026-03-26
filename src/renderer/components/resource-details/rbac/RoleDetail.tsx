import React, { useEffect, useState } from 'react'
import { useAppStore } from '../../../store'
import type { KubeRole, KubeClusterRole, PolicyRule, KubeEvent } from '../../../types'
import { formatAge } from '../../../types'
import { FileCode, X, Activity, Shield, Info, History, Key } from 'lucide-react'
import YAMLViewer from '../../common/YAMLViewer'
import { useYAMLEditor } from '../../../hooks/useYAMLEditor'

const VERB_COLORS: Record<string, string> = {
  get: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20',
  list: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20',
  watch: 'bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20',
  create: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  update: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  patch: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  delete: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
  deletecollection: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
  '*': 'bg-white/10 text-slate-300 ring-1 ring-white/10',
}

function VerbChip({ verb }: { verb: string }) {
  const cls = VERB_COLORS[verb.toLowerCase()] ?? 'bg-slate-100/5 text-slate-400 ring-1 ring-white/5'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${cls}`}>
      {verb}
    </span>
  )
}

interface Props {
  role: KubeRole | KubeClusterRole
  clusterScoped?: boolean
}

export default function RoleDetail({ role, clusterScoped = false }: Props): JSX.Element {
  const { selectedContext } = useAppStore()
  const { yaml, loading: yamlLoading, error: yamlError, open: openYAML, apply: applyYAML, close: closeYAML } = useYAMLEditor()
  const [events, setEvents] = useState<KubeEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [tab, setTab] = useState<'rules' | 'events'>('rules')

  const rules: PolicyRule[] = role.rules ?? []

  useEffect(() => {
    if (!selectedContext || tab !== 'events') return
    setEventsLoading(true)
    const ns = role.metadata.namespace ?? 'default'
    const kind = clusterScoped ? 'ClusterRole' : 'Role'
    window.kubectl.getResourceEvents(selectedContext, ns, kind, role.metadata.name)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false))
  }, [tab, role.metadata.uid, selectedContext])

  return (
    <div className="flex flex-col w-full h-full relative font-sans">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{role.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
              {role.metadata.namespace ? `${role.metadata.namespace} · ` : ''}{clusterScoped ? 'CLUSTER ROLE' : 'ROLE'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openYAML(clusterScoped ? 'clusterrole' : 'role', role.metadata.name, false, role.metadata.namespace)}
              disabled={yamlLoading}
              className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2 group disabled:opacity-50"
            >
              <FileCode size={14} className="group-hover:text-blue-400 transition-colors" />
              {yamlLoading ? 'Loading...' : 'YAML'}
            </button>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 ${clusterScoped ? 'bg-purple-500/10 text-purple-400 outline-purple-500/20' : 'bg-indigo-500/10 text-indigo-400 outline-indigo-500/20'}`}>
              {clusterScoped ? 'CLUSTER SCOPED' : 'NAMESPACE SCOPED'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white/[0.02]">
        {(['rules', 'events'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-6 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all relative ${tab === t
              ? 'text-blue-400'
              : 'text-slate-500 hover:text-slate-300'
              }`}>
            {t === 'rules' ? `Rules (${rules.length})` : 'Events'}
            {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        {tab === 'rules' ? (
          <div className="space-y-8">
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Info size={12} /> Metadata
              </h4>
              <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4 space-y-3">
                <InfoRow label="Rules Count" value={String(rules.length)} />
                <InfoRow label="Created" value={formatAge(role.metadata.creationTimestamp) + ' ago'} />
                {(role as KubeClusterRole).aggregationRule && (
                  <InfoRow label="Aggregation" value="Aggregated Rule" />
                )}
              </div>
            </section>

            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Shield size={12} /> Policy Rules
              </h4>
              <div className="space-y-4">
                {rules.map((rule, i) => (
                  <div key={i} className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-5 space-y-4 transition-all hover:bg-white/[0.04]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div>
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.15em] mb-1.5 px-0.5">API Groups</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(rule.apiGroups ?? []).length === 0 ? (
                              <span className="text-[10px] font-bold text-slate-500 italic">core</span>
                            ) : (
                              rule.apiGroups!.map((g, gi) => (
                                <span key={gi} className="text-[10px] font-mono font-bold text-slate-300 bg-white/5 border border-white/10 px-2 py-0.5 rounded-lg">
                                  {g === '' ? 'core' : g}
                                </span>
                              ))
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.15em] mb-1.5 px-0.5">Resources</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(rule.resources ?? []).map((r, ri) => (
                              <span key={ri} className="text-[10px] font-mono font-black text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg">
                                {r}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.15em] mb-1.5 px-0.5">Verbs</p>
                          <div className="flex flex-wrap gap-1.5">
                            {rule.verbs.map((v, vi) => <VerbChip key={vi} verb={v} />)}
                          </div>
                        </div>

                        {rule.resourceNames && rule.resourceNames.length > 0 && (
                          <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.15em] mb-1.5 px-0.5">Resource Names</p>
                            <div className="flex flex-wrap gap-1.5">
                              {rule.resourceNames.map((n, ni) => (
                                <span key={ni} className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">{n}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {rules.length === 0 && (
                  <div className="text-center py-12 bg-slate-50 dark:bg-white/[0.01] rounded-3xl border border-dashed border-slate-200 dark:border-white/10">
                    <p className="text-sm text-slate-500 font-medium italic">No rules defined</p>
                  </div>
                )}
              </div>
            </section>

            {/* Labels */}
            {role.metadata.labels && (
              <section>
                <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4">Labels</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(role.metadata.labels).map(([k, v]) => (
                    <span key={k} className="px-3 py-1.5 bg-white/[0.02] border border-white/5 rounded-xl text-[10px] font-bold font-mono text-slate-400">
                      <span className="text-blue-400/70">{k}</span>={v}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {eventsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : events.map((e, i) => (
              <div key={e.metadata.uid || i} className={`p-4 rounded-2xl border transition-all ${e.type === 'Warning' ? 'bg-amber-500/5 border-amber-500/10' : 'bg-slate-50 dark:bg-white/[0.02] border-slate-100 dark:border-white/5'}`}>
                <div className="flex items-center justify-between gap-4 mb-2">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${e.type === 'Warning' ? 'text-amber-400' : 'text-blue-400'}`}>{e.reason}</span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">{formatAge(e.lastTimestamp || e.metadata.creationTimestamp)} ago</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">{e.message}</p>
              </div>
            ))}
            {!eventsLoading && events.length === 0 && (
              <div className="text-center py-20 bg-slate-50 dark:bg-white/[0.01] rounded-3xl border border-dashed border-slate-200 dark:border-white/10 mt-4">
                <History size={32} className="mx-auto text-slate-700 mb-4 opacity-20" />
                <p className="text-sm text-slate-500 font-medium">No recent events found</p>
              </div>
            )}
          </div>
        )}
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
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${role.metadata.name}`}
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

function InfoRow({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      <span className="text-[11px] font-bold text-slate-300">{value || '—'}</span>
    </div>
  )
}
