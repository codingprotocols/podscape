import React from 'react'
import { useAppStore } from '../../../store'
import { FileCode, X, Activity } from 'lucide-react'
import YAMLViewer from '../../common/YAMLViewer'
import { useYAMLEditor } from '../../../hooks/useYAMLEditor'

interface Props {
  resource: Record<string, unknown>
}

// ─── Trigger colour map ────────────────────────────────────────────────────────

const TRIGGER_COLORS: Record<string, string> = {
  kafka:      'bg-teal-500/15 text-teal-400',
  prometheus: 'bg-orange-500/15 text-orange-400',
  rabbitmq:   'bg-rose-500/15 text-rose-400',
  redis:      'bg-red-500/15 text-red-400',
  aws:        'bg-amber-500/15 text-amber-400',
  azure:      'bg-blue-500/15 text-blue-400',
  gcp:        'bg-emerald-500/15 text-emerald-400',
}

function triggerColor(type: string): string {
  const lower = type.toLowerCase()
  for (const [key, cls] of Object.entries(TRIGGER_COLORS)) {
    if (lower.startsWith(key)) return cls
  }
  return 'bg-blue-500/15 text-blue-400'
}

// ─── Trigger identifier helper ─────────────────────────────────────────────────

const IDENTIFIER_KEYS = ['topic', 'queueName', 'query', 'serverAddress']

function triggerIdentifier(trigger: Record<string, unknown>): string {
  const meta = (trigger.metadata as Record<string, unknown> | undefined) ?? {}
  if (trigger.name && typeof trigger.name === 'string') return trigger.name
  for (const key of IDENTIFIER_KEYS) {
    if (meta[key] != null) return String(meta[key])
  }
  return '—'
}

function triggerThreshold(trigger: Record<string, unknown>): string {
  const meta = (trigger.metadata as Record<string, unknown> | undefined) ?? {}
  if (meta.threshold != null) return String(meta.threshold)
  if (meta.lagThreshold != null) return String(meta.lagThreshold)
  return '—'
}

// ─── Status condition badge ────────────────────────────────────────────────────

interface Condition {
  type: string
  status: string
}

function findCondition(conditions: Condition[], type: string): string | undefined {
  return conditions.find(c => c.type === type)?.status
}

interface BadgeProps {
  label: string
  testId: string
  status: string | undefined
  trueClass: string
  falseClass: string
}

function ConditionBadge({ label, testId, status, trueClass, falseClass }: BadgeProps) {
  const cls = status === 'True' ? trueClass : status === 'False' ? falseClass : 'bg-slate-500/10 text-slate-500'
  return (
    <span
      data-testid={testId}
      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${cls}`}
    >
      {label}
    </span>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ScaledObjectDetail({ resource }: Props): JSX.Element {
  const { selectedContext: ctx } = useAppStore()
  const { yaml, loading: yamlLoading, error: yamlError, open: openYAML, apply: applyYAML, close: closeYAML } = useYAMLEditor()

  const meta = (resource.metadata as Record<string, unknown>) ?? {}
  const spec = (resource.spec as Record<string, unknown>) ?? {}
  const status = (resource.status as Record<string, unknown>) ?? {}
  const conditions = (status.conditions as Condition[]) ?? []

  const name = (meta.name as string) ?? '—'
  const namespace = (meta.namespace as string) ?? ''
  const targetRef = (spec.scaleTargetRef as Record<string, unknown>) ?? {}
  const targetKind = (targetRef.kind as string) ?? '—'
  const targetName = (targetRef.name as string) ?? '—'

  const minReplicas: number = (spec.minReplicaCount as number | undefined) ?? 0
  const maxReplicas: string = (spec.maxReplicaCount as number | undefined) !== undefined
    ? String(spec.maxReplicaCount)
    : '—'
  const currentReplicas: string = (status.currentReplicas as number | undefined) !== undefined
    ? String(status.currentReplicas)
    : '—'

  const triggers = (spec.triggers as Record<string, unknown>[]) ?? []

  const readyStatus   = findCondition(conditions, 'Ready')
  const activeStatus  = findCondition(conditions, 'Active')
  const pausedStatus  = findCondition(conditions, 'Paused')

  return (
    <div className="flex flex-col w-full h-full relative">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
              {namespace} · ScaledObject → {targetKind}/{targetName}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => openYAML('customresource', name, true, namespace)}
              disabled={yamlLoading}
              className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2 group disabled:opacity-50"
            >
              <FileCode size={14} className="group-hover:text-blue-400 transition-colors" />
              {yamlLoading ? 'Loading...' : 'YAML'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <div className="space-y-8">

          {/* Status condition badges */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4">
              Status
            </h4>
            <div className="flex items-center gap-3 flex-wrap">
              <ConditionBadge
                label="Ready"
                testId="badge-ready"
                status={readyStatus}
                trueClass="bg-emerald-500/15 text-emerald-400"
                falseClass="bg-red-500/15 text-red-400"
              />
              <ConditionBadge
                label="Active"
                testId="badge-active"
                status={activeStatus}
                trueClass="bg-emerald-500/15 text-emerald-400"
                falseClass="bg-slate-500/10 text-slate-500"
              />
              <ConditionBadge
                label="Paused"
                testId="badge-paused"
                status={pausedStatus}
                trueClass="bg-amber-500/15 text-amber-400"
                falseClass="bg-slate-500/10 text-slate-500"
              />
            </div>
          </section>

          {/* Replica gauge */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4">
              Replicas
            </h4>
            <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 rounded-2xl p-6">
              <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-white/5 text-center">
                <div className="pr-6">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Min</p>
                  <p data-testid="replica-min" className="text-3xl font-black text-slate-400 tabular-nums">{minReplicas}</p>
                </div>
                <div className="px-6">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Current</p>
                  <p data-testid="replica-current" className="text-3xl font-black text-purple-400 tabular-nums">{currentReplicas}</p>
                </div>
                <div className="pl-6">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Max</p>
                  <p data-testid="replica-max" className="text-3xl font-black text-slate-400 tabular-nums">{maxReplicas}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Triggers table */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4">
              Triggers
            </h4>
            {triggers.length === 0 ? (
              <div className="flex items-center justify-center h-24 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.01] text-slate-500 text-sm font-medium">
                No triggers defined
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.01] overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                      <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Type</th>
                      <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Identifier</th>
                      <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Threshold</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {triggers.map((t, i) => {
                      const type = (t.type as string) ?? '—'
                      return (
                        <tr key={i} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${triggerColor(type)}`}>
                              {type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-300">{triggerIdentifier(t)}</td>
                          <td className="px-4 py-3 text-xs font-black text-slate-400 tabular-nums text-right">{triggerThreshold(t)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      </div>

      {/* YAML Modal */}
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
                  {yamlLoading ? 'Loading YAML…' : `YAML — ${name}`}
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
                  <Activity size={20} className="text-red-400" />
                  <p className="text-sm font-bold text-red-400 uppercase tracking-widest">Failed to load manifest</p>
                  <pre className="text-xs text-slate-400 max-w-lg break-words whitespace-pre-wrap font-mono bg-white/5 p-4 rounded-xl border border-white/5">{yamlError}</pre>
                </div>
              ) : yamlLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : yaml !== null ? (
                <YAMLViewer editable content={yaml} onSave={applyYAML} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
