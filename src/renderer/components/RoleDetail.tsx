import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { KubeRole, KubeClusterRole, PolicyRule, KubeEvent } from '../types'
import { formatAge } from '../types'

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
  const cls = VERB_COLORS[verb] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {verb}
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-5 border-b border-white/5">
      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">{title}</p>
      <div className="px-1">
        {children}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/[0.02] last:border-0">
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-500 shrink-0 w-32 uppercase tracking-wider">{label}</span>
      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 text-right break-all">{value}</span>
    </div>
  )
}

interface Props {
  role: KubeRole | KubeClusterRole
  clusterScoped?: boolean
}

export default function RoleDetail({ role, clusterScoped = false }: Props): JSX.Element {
  const { selectedContext } = useAppStore()
  const [events, setEvents] = useState<KubeEvent[]>([])
  const [tab, setTab] = useState<'rules' | 'events'>('rules')

  const rules: PolicyRule[] = role.rules ?? []

  useEffect(() => {
    if (!selectedContext || tab !== 'events') return
    const ns = role.metadata.namespace ?? 'default'
    const kind = clusterScoped ? 'ClusterRole' : 'Role'
    window.kubectl.getResourceEvents(selectedContext, ns, kind, role.metadata.name)
      .then(setEvents).catch(() => setEvents([]))
  }, [tab, role.metadata.uid, selectedContext])

  const tabs = ['rules', 'events'] as const

  return (
    <div className="flex flex-col w-full h-full transition-colors duration-200">
      {/* Header */}
      <div className="px-6 py-6 border-b border-white/5 bg-white/5 shrink-0">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-600 dark:text-indigo-400">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{role.metadata.name}</h3>
              {role.metadata.namespace && (
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{role.metadata.namespace}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ring-1 ring-inset ${clusterScoped
              ? 'bg-purple-500/10 text-purple-400 ring-purple-500/20'
              : 'bg-indigo-500/10 text-indigo-400 ring-indigo-500/20'
              }`}>
              {clusterScoped ? 'ClusterRole' : 'Role'}
            </span>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {formatAge(role.metadata.creationTimestamp)} old
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${tab === t
                ? 'bg-blue-600/10 text-blue-400 shadow-[inset_0_0_12px_rgba(59,130,246,0.1)]'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/5'
                }`}
            >
              {t === 'rules' ? `Rules (${rules.length})` : 'Events'}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'rules' && (
          <>
            {/* Summary */}
            <Section title="Overview">
              <Row label="Rules" value={rules.length} />
              <Row label="Created" value={formatAge(role.metadata.creationTimestamp) + ' ago'} />
              {(role as KubeClusterRole).aggregationRule && (
                <Row label="Aggregation" value={
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 uppercase">Aggregated</span>
                } />
              )}
            </Section>

            {/* Rules Table */}
            <Section title={`Policy Rules (${rules.length})`}>
              {rules.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic">No rules defined</p>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule, i) => (
                    <div key={i} className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3 transition-all hover:bg-white/[0.05] shadow-[inset_0_0_20px_rgba(0,0,0,0.1)]">
                      {/* API Groups */}
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 w-20 shrink-0 pt-0.5">API Groups</span>
                        <div className="flex flex-wrap gap-1">
                          {(rule.apiGroups ?? []).length === 0 ? (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">core</span>
                          ) : (
                            rule.apiGroups!.map((g, gi) => (
                              <span key={gi} className="text-[11px] font-mono text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">
                                {g === '' ? 'core' : g}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                      {/* Resources */}
                      {rule.resources && (
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 w-20 shrink-0 pt-0.5">Resources</span>
                          <div className="flex flex-wrap gap-1">
                            {rule.resources.map((r, ri) => (
                              <span key={ri} className="text-[11px] font-mono text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-900/30 px-1.5 py-0.5 rounded">
                                {r}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Non-resource URLs */}
                      {rule.nonResourceURLs && rule.nonResourceURLs.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 w-20 shrink-0 pt-0.5">URLs</span>
                          <div className="flex flex-wrap gap-1">
                            {rule.nonResourceURLs.map((u, ui) => (
                              <span key={ui} className="text-[11px] font-mono text-slate-600 dark:text-slate-300">{u}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Resource Names */}
                      {rule.resourceNames && rule.resourceNames.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 w-20 shrink-0 pt-0.5">Names</span>
                          <div className="flex flex-wrap gap-1">
                            {rule.resourceNames.map((n, ni) => (
                              <span key={ni} className="text-[11px] font-mono text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">{n}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Verbs */}
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 w-20 shrink-0 pt-0.5">Verbs</span>
                        <div className="flex flex-wrap gap-1">
                          {rule.verbs.map((v, vi) => <VerbChip key={vi} verb={v} />)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Labels */}
            {role.metadata.labels && Object.keys(role.metadata.labels).length > 0 && (
              <Section title="Labels">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(role.metadata.labels).map(([k, v]) => (
                    <span key={k} className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">
                      {k}={v}
                    </span>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {tab === 'events' && (
          <Section title="Events">
            {events.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">No events found</p>
            ) : (
              <div className="space-y-2">
                {events.map((ev, i) => (
                  <div key={i} className={`rounded-lg px-3 py-2 text-xs ${ev.type === 'Warning'
                    ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40'
                    : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800'
                    }`}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={`font-bold text-[10px] uppercase ${ev.type === 'Warning' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                        {ev.reason}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                        {ev.lastTimestamp ? formatAge(ev.lastTimestamp) + ' ago' : ''}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-snug">{ev.message}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}
