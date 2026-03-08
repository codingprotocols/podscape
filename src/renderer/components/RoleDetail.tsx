import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { KubeRole, KubeClusterRole, PolicyRule, KubeEvent } from '../types'
import { formatAge } from '../types'

const VERB_COLORS: Record<string, string> = {
  get:              'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  list:             'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  watch:            'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  create:           'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  update:           'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  patch:            'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  delete:           'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  deletecollection: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  '*':              'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
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
    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 w-28">{label}</span>
      <span className="text-xs font-medium text-slate-800 dark:text-slate-200 text-right break-all">{value}</span>
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
    <div className="flex flex-col w-[560px] min-w-[440px] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 h-full shadow-2xl transition-colors duration-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono truncate">{role.metadata.name}</h3>
            {role.metadata.namespace && (
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5 uppercase tracking-wider">{role.metadata.namespace}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
              clusterScoped
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            }`}>
              {clusterScoped ? 'ClusterRole' : 'Role'}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              Age: {formatAge(role.metadata.creationTimestamp)}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-px">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
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
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 uppercase">Aggregated</span>
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
                    <div key={i} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-2">
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
                  <div key={i} className={`rounded-lg px-3 py-2 text-xs ${
                    ev.type === 'Warning'
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
