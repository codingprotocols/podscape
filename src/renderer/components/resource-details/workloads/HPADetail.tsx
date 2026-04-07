import React from 'react'
import { useAppStore } from '../../../store'
import type { KubeHPA } from '../../../types'
import { formatAge } from '../../../types'
import { FileCode, X, Activity, Cpu, Target, History, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, BarChart2, Zap } from 'lucide-react'
import YAMLViewer from '../../common/YAMLViewer'
import { useYAMLEditor } from '../../../hooks/useYAMLEditor'
import { useResourceEvents } from '../../../hooks/useResourceEvents'

interface Props { hpa: KubeHPA }

// ─── Metric parsing ────────────────────────────────────────────────────────────

interface ParsedMetric {
  name: string        // e.g. "cpu", "memory", or custom metric name
  targetType: string  // "Utilization" | "AverageValue" | "Value"
  target: string      // formatted target value
  current: string | null
  overTarget: boolean | null  // null when we can't compare (string values)
}

function formatMetricValue(value: number | string | undefined, type: string, metricName: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'number') {
    if (type === 'Utilization') return `${value}%`
    return String(value)
  }
  return String(value)
}

function parseMetrics(hpa: KubeHPA): ParsedMetric[] {
  const specMetrics = hpa.spec.metrics ?? []
  const currentMetrics = hpa.status.currentMetrics ?? []
  const results: ParsedMetric[] = []

  for (const m of specMetrics) {
    if (m.type === 'Resource') {
      const res = m['resource'] as { name: string; target: { type: string; averageUtilization?: number; averageValue?: string } } | undefined
      if (!res) continue

      const currM = currentMetrics.find(cm => cm.type === 'Resource' && (cm['resource'] as { name?: string })?.name === res.name)
      const currRes = currM?.['resource'] as { current?: { averageUtilization?: number; averageValue?: string } } | undefined
      const currVal = currRes?.current?.averageUtilization ?? currRes?.current?.averageValue
      const targVal = res.target.averageUtilization ?? res.target.averageValue

      const targetStr = formatMetricValue(targVal, res.target.type, res.name) ?? '—'
      const currentStr = formatMetricValue(currVal, res.target.type, res.name)

      let overTarget: boolean | null = null
      if (typeof targVal === 'number' && typeof currVal === 'number') {
        overTarget = currVal > targVal
      }

      results.push({ name: res.name, targetType: res.target.type, target: targetStr, current: currentStr, overTarget })
    } else if (m.type === 'ContainerResource') {
      const res = m['containerResource'] as { name: string; container: string; target: { type: string; averageUtilization?: number; averageValue?: string } } | undefined
      if (!res) continue
      const targVal = res.target.averageUtilization ?? res.target.averageValue
      results.push({
        name: `${res.name} (${res.container})`,
        targetType: res.target.type,
        target: formatMetricValue(targVal, res.target.type, res.name) ?? '—',
        current: null,
        overTarget: null,
      })
    } else if (m.type === 'Pods') {
      const res = m['pods'] as { metric: { name: string }; target: { type: string; averageValue?: string } } | undefined
      if (!res) continue
      results.push({
        name: res.metric.name,
        targetType: res.target.type,
        target: res.target.averageValue ?? '—',
        current: null,
        overTarget: null,
      })
    } else if (m.type === 'External') {
      const res = m['external'] as { metric: { name: string }; target: { type: string; averageValue?: string; value?: string } } | undefined
      if (!res) continue
      results.push({
        name: res.metric.name,
        targetType: res.target.type,
        target: res.target.averageValue ?? res.target.value ?? '—',
        current: null,
        overTarget: null,
      })
    }
  }

  return results
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function HPADetail({ hpa }: Props): JSX.Element {
  const { selectedContext: ctx } = useAppStore()
  const { yaml, loading: yamlLoading, error: yamlError, open: openYAML, apply: applyYAML, close: closeYAML } = useYAMLEditor()

  const { events, loading: eventsLoading } = useResourceEvents(
    ctx,
    hpa.metadata.name,
    ['HorizontalPodAutoscaler', 'HPA'],
    hpa.metadata.namespace,
    30_000
  )

  const current = hpa.status.currentReplicas
  const desired = hpa.status.desiredReplicas
  const max = hpa.spec.maxReplicas
  const min = hpa.spec.minReplicas ?? 1
  const scalePct = max > min ? Math.round(((current - min) / (max - min)) * 100) : 0

  const metrics = parseMetrics(hpa)

  // Last SuccessfulRescale event explains the most recent scale action
  const lastScaleEvent = events.find(e => e.reason === 'SuccessfulRescale')
  const scaleReason = lastScaleEvent?.message?.replace(/^New size: \d+; reason: /, '') ?? null

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
              onClick={() => openYAML('hpa', hpa.metadata.name, false, hpa.metadata.namespace)}
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
            <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 rounded-2xl p-6 relative overflow-hidden">
              <div className="flex justify-between items-end mb-6">
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
              {/* Last scale reason banner */}
              {scaleReason && (
                <div className="mt-4 flex items-start gap-2 px-3 py-2 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                  <Zap size={12} className="text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-[10px] font-medium text-slate-400 leading-relaxed">
                    <span className="font-black text-blue-400 uppercase tracking-wider">Last scale reason: </span>
                    {scaleReason}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Metrics */}
          {metrics.length > 0 && (
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <BarChart2 size={12} /> Scaling Metrics
              </h4>
              <div className="rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.01] overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                      <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Metric</th>
                      <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Type</th>
                      <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Target</th>
                      <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Current</th>
                      <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {metrics.map((m, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold text-slate-200 font-mono capitalize">{m.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{m.targetType}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-xs font-black text-slate-300 tabular-nums">{m.target}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {m.current !== null ? (
                            <span className={`text-xs font-black tabular-nums ${
                              m.overTarget === true ? 'text-amber-400' :
                              m.overTarget === false ? 'text-emerald-400' :
                              'text-slate-300'
                            }`}>{m.current}</span>
                          ) : (
                            <span className="text-[10px] text-slate-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {m.overTarget === null ? (
                            <Minus size={12} className="mx-auto text-slate-600" />
                          ) : m.overTarget ? (
                            <div className="flex items-center justify-center gap-1">
                              <TrendingUp size={12} className="text-amber-400" />
                              <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Over</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <TrendingDown size={12} className="text-emerald-400" />
                              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">OK</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Target Info + Timing */}
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

          {/* Events */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Activity size={12} /> Events
            </h4>

            {eventsLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 border-2 border-slate-700 border-t-purple-500 rounded-full animate-spin" />
              </div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.01]">
                <CheckCircle size={20} className="text-slate-600" />
                <p className="text-xs text-slate-500 font-medium">No events recorded</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.01] overflow-hidden">
                {events.map((ev, i) => {
                  const ts = ev.lastTimestamp ?? ev.eventTime ?? ev.firstTimestamp
                  const isWarning = ev.type === 'Warning'
                  return (
                    <div key={i} className={`flex gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-b-0 hover:bg-white/5 transition-colors`}>
                      {/* Icon */}
                      <div className="mt-0.5 shrink-0">
                        {isWarning
                          ? <AlertTriangle size={14} className="text-amber-400" />
                          : <CheckCircle size={14} className="text-slate-500" />
                        }
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-black uppercase tracking-widest ${isWarning ? 'text-amber-400' : 'text-slate-400'}`}>
                              {ev.reason ?? 'Unknown'}
                            </span>
                            {ev.count && ev.count > 1 && (
                              <span className="text-[9px] font-black text-slate-600 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded-full">×{ev.count}</span>
                            )}
                          </div>
                          {ts && (
                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter shrink-0">{formatAge(ts)} ago</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed font-medium break-words">{ev.message}</p>
                        {ev.source?.component && (
                          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-1">{ev.source.component}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
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
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${hpa.metadata.name}`}
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
                <YAMLViewer editable content={yaml} onSave={applyYAML} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      <span className={`text-[11px] font-bold text-slate-300 ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}
