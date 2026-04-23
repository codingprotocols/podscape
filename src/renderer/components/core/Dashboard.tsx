import React, { useMemo, useState, useEffect } from 'react'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import type { KubeNode, KubeEvent, NodeMetrics, KubePod, KubeDeployment } from '../../types'
import {
  getNodeReady, formatAge,
  parseCpuMillicores, parseMemoryMiB
} from '../../types'
import LoadingAnimation from './LoadingAnimation'
import TimeSeriesChart, { PrometheusTimeRangeBar } from '../advanced/TimeSeriesChart'
import { clusterCpuQuery, clusterMemoryQuery } from '../../utils/prometheusQueries'
import {
  Box,
  Layers,
  Database,
  AlertTriangle,
  LayoutGrid,
  Cpu,
  CheckCircle2
} from 'lucide-react'
import { RefreshButton } from '../common'

// ─── Ring chart (SVG donut) ───────────────────────────────────────────────────

function RingChart({
  pct,
  size = 68,
  stroke = 7,
  label
}: {
  pct: number
  size?: number
  stroke?: number
  label: string
}) {
  const r = (size - stroke * 2) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const filled = Math.min(1, pct / 100) * circumference

  const color =
    pct >= 85 ? 'var(--danger)' :
      pct >= 65 ? 'var(--warning)' :
        pct >= 45 ? 'hsl(38, 92%, 60%)' :
          'var(--primary)'

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="currentColor"
          className="text-slate-200 dark:text-white/5"
          strokeWidth={stroke}
        />
        {/* Fill */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
        {/* Percentage */}
        <text
          x={cx} y={cy + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="currentColor"
          className="text-slate-900 dark:text-white"
          fontSize={size < 60 ? 10 : 13}
          fontWeight="900"
          fontFamily="monospace"
        >
          {Math.round(pct)}%
        </text>
      </svg>
      <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em]">{label}</span>
    </div>
  )
}

// ─── Mini usage bar (for capacity display) ────────────────────────────────────

function UsageBar({ pct, label, value }: { pct: number; label: string; value: string }) {
  const color =
    pct >= 85 ? 'bg-red-500' :
      pct >= 65 ? 'bg-orange-500' :
        pct >= 45 ? 'bg-yellow-500' :
          'bg-blue-500'

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">{label}</span>
        <span className="text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300 font-mono tracking-tight">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800/50 overflow-hidden shadow-inner">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700 shadow-[0_0_8px_rgba(0,0,0,0.1)]`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}

function StatCard({
  label, value, sub, accent = 'blue', icon: Icon, onClick
}: {
  label: string
  value: string | number
  sub?: string
  accent?: 'green' | 'yellow' | 'red' | 'blue' | 'gray'
  icon?: React.ElementType
  onClick?: () => void
}) {
  const accentStyles = {
    green:  'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/5',
    yellow: 'text-amber-400 bg-amber-500/10 border-amber-500/20 shadow-amber-500/5',
    red:    'text-rose-400 bg-rose-500/10 border-rose-500/20 shadow-rose-500/5',
    blue:   'text-blue-400 bg-blue-500/10 border-blue-500/20 shadow-blue-500/5',
    gray:   'text-slate-400 bg-slate-500/10 border-slate-500/20 shadow-slate-500/5',
  }
  const style = accentStyles[accent]

  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      onClick={onClick}
      className={`flex flex-col gap-4 p-6 rounded-3xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06] shadow-xl group hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:border-slate-300 dark:hover:border-white/[0.1] transition-all duration-300 relative overflow-hidden text-left w-full ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{label}</span>
        {Icon && (
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-transform group-hover:scale-110 ${style}`}>
            <Icon size={16} />
          </div>
        )}
      </div>
      <div>
        <span className="text-3xl font-black tabular-nums leading-none tracking-tighter text-slate-900 dark:text-white">{value}</span>
        {sub && (
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-2.5 truncate max-w-full uppercase tracking-widest">
            {sub}
          </p>
        )}
      </div>
      {/* Subtle background glow */}
      <div className={`absolute -right-4 -bottom-4 w-12 h-12 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700 ${style.split(' ')[1]}`} />
    </Tag>
  )
}

// ─── Node card ────────────────────────────────────────────────────────────────

function NodeCard({ node, metrics }: { node: KubeNode; metrics: NodeMetrics | undefined }) {
  const ready = getNodeReady(node)
  const ni = node.status.nodeInfo

  const cpuCapM = parseCpuMillicores(node.status.allocatable?.cpu ?? node.status.capacity?.cpu ?? '0')
  const memCapMiB = parseMemoryMiB(node.status.allocatable?.memory ?? node.status.capacity?.memory ?? '0Ki')
  const cpuUsedM = metrics ? parseCpuMillicores(metrics.usage.cpu) : null
  const memUsedMiB = metrics ? parseMemoryMiB(metrics.usage.memory) : null

  const cpuPct = (cpuUsedM !== null && cpuCapM > 0) ? (cpuUsedM / cpuCapM) * 100 : null
  const memPct = (memUsedMiB !== null && memCapMiB > 0) ? (memUsedMiB / memCapMiB) * 100 : null

  const fmtCpu = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)}` : `${Math.round(m)}m`
  const fmtMem = (mib: number) => mib >= 1024 ? `${(mib / 1024).toFixed(1)} Gi` : `${Math.round(mib)} Mi`

  const internalIP = (node.status.addresses ?? []).find(a => a.type === 'InternalIP')?.address

  return (
    <div className={`
      flex flex-col gap-6 glass-card glass-light p-6 scale-in hover:scale-[1.02] transition-all
      ${!ready && 'border-rose-500/30 bg-rose-500/5'}
    `}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 overflow-hidden">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900 dark:text-white font-mono truncate tracking-tight">{node.metadata.name}</p>
          {internalIP && (
            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 font-mono mt-1 tracking-widest uppercase">{internalIP}</p>
          )}
        </div>
        <span className={`
          shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border
          ${ready
            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
            : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
          }
        `}>
          <span className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'}`} />
          {ready ? 'Ready' : 'Not Ready'}
        </span>
      </div>

      {/* Ring charts */}
      {(cpuPct !== null || memPct !== null) && (
        <div className="flex items-center justify-around py-4 bg-slate-50/50 dark:bg-white/[0.02] rounded-2xl border border-slate-100 dark:border-white/5 shadow-inner">
          {cpuPct !== null && <RingChart pct={cpuPct} label="CPU" />}
          {memPct !== null && <RingChart pct={memPct} label="MEM" />}
        </div>
      )}

      {/* Capacity bars */}
      <div className="space-y-4">
        {cpuPct !== null && cpuUsedM !== null ? (
          <UsageBar label="CPU Load" pct={cpuPct} value={`${fmtCpu(cpuUsedM)} / ${fmtCpu(cpuCapM)}`} />
        ) : (
          <UsageBar label="CPU total" pct={0} value={`${fmtCpu(cpuCapM)} total`} />
        )}
        {memPct !== null && memUsedMiB !== null ? (
          <UsageBar label="Memory Load" pct={memPct} value={`${fmtMem(memUsedMiB)} / ${fmtMem(memCapMiB)}`} />
        ) : (
          <UsageBar label="Memory total" pct={0} value={`${fmtMem(memCapMiB)} total`} />
        )}
      </div>

      {/* System info */}
      <div className="space-y-1.5 border-t border-slate-100 dark:border-white/5 pt-4">
        {ni && (
          <>
            <InfoRow k="Kubelet" v={ni.kubeletVersion} mono />
            <InfoRow k="OS/Arch" v={`${ni.operatingSystem}/${ni.architecture}`} />
            <InfoRow k="Runtime" v={ni.containerRuntimeVersion.split('://')[1]?.split(' ')[0] ?? ni.containerRuntimeVersion} mono />
          </>
        )}
        {node.status.capacity?.pods && (
          <InfoRow k="Max Pods" v={node.status.capacity.pods} />
        )}
        {node.metadata.creationTimestamp && (
          <InfoRow k="Age" v={formatAge(node.metadata.creationTimestamp)} />
        )}
      </div>
    </div>
  )
}

function InfoRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 w-16 shrink-0 uppercase tracking-tighter">{k}</span>
      <span className={`text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate tracking-tight ${mono ? 'font-mono' : ''}`}>{v}</span>
    </div>
  )
}

// ─── Event row ────────────────────────────────────────────────────────────────

function EventRow({ event: e }: { event: KubeEvent }) {
  const isWarning = e.type === 'Warning'
  const ts = e.lastTimestamp ?? e.firstTimestamp ?? e.eventTime ?? ''

  return (
    <div className={`
      flex items-start gap-5 px-8 py-5 hover:bg-slate-100 dark:hover:bg-white/[0.02] transition-all relative group
      ${isWarning ? 'bg-rose-500/5 dark:bg-rose-500/[0.02]' : ''}
    `}>
      {isWarning && <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500/40" />}

      {/* Type indicator */}
      <div className={`shrink-0 mt-2 w-2 h-2 rounded-full ${isWarning ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-slate-700 dark:bg-slate-400'}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-sm font-black text-slate-900 dark:text-white tracking-tight">{e.reason ?? '—'}</span>
          <span className="text-[10px] font-black text-slate-500 dark:text-slate-500 font-mono uppercase tracking-[0.2em] bg-slate-100 dark:bg-white/[0.02] px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-white/5">
            {e.involvedObject.kind}
          </span>
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 font-mono truncate max-w-[200px]">
            {e.involvedObject.name}
          </span>
          {e.metadata.namespace && (
            <span className="text-[9px] font-black text-blue-500/50 dark:text-blue-500/50 uppercase tracking-[0.2em]">
              {e.metadata.namespace}
            </span>
          )}
        </div>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed tracking-tight font-medium group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{e.message ?? ''}</p>
      </div>

      {/* Age & Count */}
      <div className="shrink-0 text-right">
        {ts && <span className="text-[10px] font-black text-slate-500 dark:text-slate-600 uppercase tracking-widest">{formatAge(ts)} ago</span>}
        {e.count && e.count > 1 && (
          <div className="mt-2 inline-flex items-center justify-center px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-black tracking-tighter border border-blue-500/10">
            ×{e.count}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Health helpers ───────────────────────────────────────────────────────────

interface PodHealthRow {
  pod: KubePod
  restarts: number
  crashLooping: boolean
  notReady: boolean
  failed: boolean
}

function podTotalRestarts(pod: KubePod): number {
  return (pod.status.containerStatuses ?? []).reduce((s, cs) => s + cs.restartCount, 0)
}

function derivedHealth(pods: KubePod[], deployments: KubeDeployment[]) {
  const problemPods: PodHealthRow[] = []
  let running = 0

  for (const pod of pods) {
    if (pod.status.phase === 'Running' && !pod.metadata.deletionTimestamp) running++
    const restarts = podTotalRestarts(pod)
    const crashLooping = (pod.status.containerStatuses ?? []).some(
      cs => cs.state.waiting?.reason === 'CrashLoopBackOff'
    )
    const notReady =
      pod.status.phase === 'Running' &&
      (pod.status.containerStatuses ?? []).some(cs => !cs.ready)
    const failed = pod.status.phase === 'Failed'

    if (crashLooping || failed || notReady) {
      problemPods.push({ pod, restarts, crashLooping, notReady, failed })
    }
  }

  problemPods.sort((a, b) => {
    const score = (r: PodHealthRow) =>
      (r.crashLooping ? 1000 : 0) + (r.failed ? 500 : 0) + (r.notReady ? 100 : 0) + r.restarts
    return score(b) - score(a)
  })

  const degradedDeployments = deployments.filter(
    d => (d.status.readyReplicas ?? 0) < (d.spec.replicas ?? 0)
  )

  const totalProblemPods = problemPods.length
  return { problemPods: problemPods.slice(0, 20), totalProblemPods, degradedDeployments }
}

function PodStatusBadge({ row }: { row: PodHealthRow }) {
  if (row.crashLooping) return <span className="px-1.5 py-0.5 text-[9px] font-black rounded-full bg-red-500/15 text-red-500 uppercase tracking-wider">CrashLoop</span>
  if (row.failed)       return <span className="px-1.5 py-0.5 text-[9px] font-black rounded-full bg-orange-500/15 text-orange-500 uppercase tracking-wider">Failed</span>
  if (row.notReady)     return <span className="px-1.5 py-0.5 text-[9px] font-black rounded-full bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">Not Ready</span>
  return <span className="px-1.5 py-0.5 text-[9px] font-black rounded-full bg-slate-500/10 text-slate-500 uppercase tracking-wider">High Restarts</span>
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard(): JSX.Element {
  const {
    loadingResources, selectedContext,
    pods, deployments, namespaces,
    nodes, nodeMetrics, events,
    prometheusAvailable, navigateToResource, refresh, setSection,
  } = useAppStore(useShallow(s => ({
    loadingResources: s.loadingResources,
    selectedContext: s.selectedContext,
    pods: s.pods,
    deployments: s.deployments,
    namespaces: s.namespaces,
    nodes: s.nodes,
    nodeMetrics: s.nodeMetrics,
    events: s.events,
    prometheusAvailable: s.prometheusAvailable,
    navigateToResource: s.navigateToResource,
    refresh: s.refresh,
    setSection: s.setSection,
  })))

  const [warningDismissed, setWarningDismissed] = useState(false)
  useEffect(() => { setWarningDismissed(false) }, [selectedContext])

  // ── Derived health data ───────────────────────────────────────────────────
  const { problemPods, totalProblemPods, degradedDeployments } = useMemo(
    () => derivedHealth(pods, deployments),
    [pods, deployments]
  )

  // Pre-calculate timestamps and derive stats memoized
  const {
    runningPods, readyNodes, readyDeploys,
    recentEvents, processedEvents, metricsById, warningCount
  } = useMemo(() => {
    // Stats calculation
    const runningPods = pods.filter(p => p.status.phase === 'Running' && !p.metadata.deletionTimestamp).length
    const readyNodes = nodes.filter(getNodeReady).length
    const readyDeploys = deployments.filter(
      d => (d.status.readyReplicas ?? 0) >= (d.spec.replicas ?? 0) && (d.spec.replicas ?? 0) > 0
    ).length

    // Map metrics for O(1) lookup
    const safeNodeMetrics = Array.isArray(nodeMetrics) ? nodeMetrics : []
    const metricsById = new Map<string, NodeMetrics>(
      safeNodeMetrics
        .filter(m => m && m.metadata && m.metadata.name)
        .map(m => [m.metadata.name, m] as [string, NodeMetrics])
    )

    // Sorted and pre-parsed events
    const safeEvents = Array.isArray(events) ? events : []
    const processedEvents = safeEvents.filter(e => e && (e.lastTimestamp || e.firstTimestamp || e.eventTime)).map(e => ({
      ...e,
      _ts: new Date(e.lastTimestamp ?? e.firstTimestamp ?? e.eventTime ?? 0).getTime()
    }))

    const recentEvents = [...processedEvents]
      .sort((a, b) => b._ts - a._ts)
      .slice(0, 15)

    // Secondary sort for UI: Warnings first
    const sortedEvents = [...recentEvents].sort((a, b) => {
      if (a.type === 'Warning' && b.type !== 'Warning') return -1
      if (a.type !== 'Warning' && b.type === 'Warning') return 1
      return 0
    })

    const warningCount = safeEvents.filter(e => e.type === 'Warning').length

    return { runningPods, readyNodes, readyDeploys, recentEvents: sortedEvents, processedEvents, metricsById, warningCount }
  }, [pods, deployments, nodes, events, nodeMetrics])

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-[hsl(var(--bg-dark))] overflow-hidden relative h-full transition-colors duration-200">
      {/* Invisible drag strip at top — no layout impact, allows window dragging */}
      <div
        className="absolute top-0 left-0 right-0 h-8 z-40"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      {/* Scrollable Content (No PageHeader) */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {loadingResources && pods.length === 0 ? (
          <div className="h-full flex items-center justify-center py-32">
            <LoadingAnimation />
          </div>
        ) : (
          <div className="px-8 py-10 space-y-16 text-slate-900 dark:text-slate-100">
            {/* ── Warning event banner ─────────────────────────────────────────── */}
            {warningCount > 0 && !warningDismissed && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 -mb-8">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                    {warningCount} Warning event{warningCount !== 1 ? 's' : ''} in this namespace
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSection('events')}
                    className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
                  >
                    View Events →
                  </button>
                  <button
                    onClick={() => setWarningDismissed(true)}
                    className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-200 transition-colors text-xs"
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
            {/* ── Cluster stats ───────────────────────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-3">
                  <span className="w-6 h-px bg-slate-200 dark:bg-white/5" />
                  Cluster Overview
                </h2>
                <RefreshButton
                  onClick={refresh}
                  loading={loadingResources}
                  label="Refresh"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  label="Pods active"
                  value={pods.length}
                  sub={`${runningPods} running`}
                  accent={runningPods < pods.length ? 'yellow' : 'green'}
                  icon={Box}
                />
                <StatCard
                  label="Deployments"
                  value={deployments.length}
                  sub={`${readyDeploys} ready state`}
                  accent={readyDeploys < deployments.length ? 'yellow' : 'green'}
                  icon={Layers}
                />
                <StatCard
                  label="Available Nodes"
                  value={nodes.length}
                  sub={`${readyNodes} health state`}
                  accent={readyNodes < nodes.length ? 'red' : 'green'}
                  icon={Database}
                />
                <StatCard
                  label="Namespaces"
                  value={namespaces.length}
                  sub="Active environments"
                  accent="blue"
                  icon={LayoutGrid}
                />
              </div>
            </section>

            {/* ── Cluster utilisation charts (Prometheus) ─────────────────────── */}
            {prometheusAvailable && (
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-3">
                    <span className="w-6 h-px bg-slate-200 dark:bg-white/5" />
                    Live Infrastructure Metrics
                  </h2>
                  <PrometheusTimeRangeBar />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white dark:bg-white/[0.02] p-8 rounded-[32px] border border-slate-100 dark:border-white/5 shadow-inner">
                    <div className="flex items-center gap-3 mb-6">
                       <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500"><Cpu size={16} /></div>
                       <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Cluster CPU Demand</span>
                    </div>
                    <TimeSeriesChart queries={[clusterCpuQuery()]} title="" unit="m" />
                  </div>
                  <div className="bg-white dark:bg-white/[0.02] p-8 rounded-[32px] border border-slate-100 dark:border-white/5 shadow-inner">
                    <div className="flex items-center gap-3 mb-6">
                       <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500"><Database size={16} /></div>
                       <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Memory Allocation</span>
                    </div>
                    <TimeSeriesChart queries={[clusterMemoryQuery()]} title="" unit=" GiB" />
                  </div>
                </div>
              </section>
            )}

            {/* ── Pod health problems ─────────────────────────────────────────── */}
            {(problemPods.length > 0 || degradedDeployments.length > 0) && (
              <section>
                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                  <span className="w-6 h-px bg-slate-200 dark:bg-white/5" />
                  Cluster Health Issues
                </h2>
                <div className={`grid gap-6 ${degradedDeployments.length > 0 && problemPods.length > 0 ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'}`}>

                  {/* Problem pods table */}
                  {problemPods.length > 0 && (
                    <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-[28px] overflow-hidden shadow-xl">
                      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-white/5">
                        <AlertTriangle size={14} className="text-rose-500" />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Pods with Restarts or Problems</span>
                        <span className="ml-auto px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 text-[9px] font-black">{totalProblemPods > 20 ? '20+' : totalProblemPods}</span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-white/5">
                        {problemPods.map(row => (
                          <button
                            key={row.pod.metadata.uid}
                            onClick={() => navigateToResource('Pod', row.pod.metadata.name, row.pod.metadata.namespace ?? '')}
                            className="w-full flex items-center gap-4 px-6 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors text-left"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-800 dark:text-white font-mono truncate">{row.pod.metadata.name}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{row.pod.metadata.namespace}</p>
                            </div>
                            <PodStatusBadge row={row} />
                            {row.restarts > 0 && (
                              <span className="text-[10px] font-black text-red-500 tabular-nums shrink-0">
                                ×{row.restarts}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Degraded deployments table */}
                  {degradedDeployments.length > 0 && (
                    <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-[28px] overflow-hidden shadow-xl">
                      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-white/5">
                        <Layers size={14} className="text-amber-500" />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Degraded Deployments</span>
                        <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 text-[9px] font-black">{degradedDeployments.length}</span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-white/5">
                        {degradedDeployments.map(d => (
                          <button
                            key={d.metadata.uid}
                            onClick={() => navigateToResource('Deployment', d.metadata.name, d.metadata.namespace ?? '')}
                            className="w-full flex items-center gap-4 px-6 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors text-left"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-800 dark:text-white font-mono truncate">{d.metadata.name}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{d.metadata.namespace}</p>
                            </div>
                            <span className="text-[11px] font-black tabular-nums shrink-0">
                              <span className="text-amber-500">{d.status.readyReplicas ?? 0}</span>
                              <span className="text-slate-400"> / {d.spec.replicas ?? 0}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── All-healthy banner ───────────────────────────────────────────── */}
            {problemPods.length === 0 && degradedDeployments.length === 0 && pods.length > 0 && (
              <section>
                <div className="flex items-center gap-4 px-8 py-5 bg-emerald-500/5 border border-emerald-500/20 rounded-[28px]">
                  <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    All pods and deployments are healthy — no restarts or degraded workloads detected.
                  </span>
                </div>
              </section>
            )}

            {/* ── Nodes ───────────────────────────────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-3">
                  <span className="w-6 h-px bg-slate-200 dark:bg-white/5" />
                  Compute Resources
                  {nodeMetrics.length === 0 && (
                    <span className="ml-3 text-slate-600 normal-case font-bold tracking-tight">
                      (metrics-server not detected)
                    </span>
                  )}
                </h2>
              </div>

              {nodes.length === 0 && !loadingResources ? (
                <EmptySection message="No compute nodes discovered" />
              ) : (
                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {[...nodes].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)).map(node => (
                    <NodeCard
                      key={node.metadata.uid}
                      node={node}
                      metrics={metricsById.get(node.metadata.name)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ── Cluster Events ──────────────────────────────────────────────── */}
            <section className="pb-20">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-3">
                  <span className="w-6 h-px bg-slate-200 dark:bg-white/5" />
                  Real-time Activity Timeline
                </h2>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]" />
                    <span className="text-[9px] font-black uppercase text-slate-500 whitespace-nowrap">Normal</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]" />
                    <span className="text-[9px] font-black uppercase text-slate-500 whitespace-nowrap">Warning</span>
                  </div>
                </div>
              </div>

              <div className="mb-10">
                <EventTimeline events={processedEvents} />
              </div>

              {recentEvents.length === 0 && !loadingResources ? (
                <EmptySection message="No recent cluster activity recorded" />
              ) : (
                <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 shadow-2xl rounded-[32px] overflow-hidden divide-y divide-slate-100 dark:divide-white/5">
                  {recentEvents.map(event => {
                    if (!event || !event.metadata) return null
                    return <EventRow key={event.metadata.uid + (event.count || 1)} event={event} />
                  })}
                  {processedEvents.length > 15 && (
                    <button
                      onClick={() => setSection('events')}
                      className="w-full py-3 text-[10px] font-bold text-slate-400 hover:text-blue-400 transition-colors text-center border-t border-slate-100 dark:border-white/5"
                    >
                      +{processedEvents.length - 15} more — View all events →
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function EventTimeline({ events }: { events: (KubeEvent & { _ts: number })[] }) {
  const buckets = useMemo(() => {
    const now = Date.now()
    const b = Array(60).fill(0).map((_, i) => ({
      timestamp: now - (59 - i) * 60000,
      count: 0,
      warnings: 0
    }))

    events.forEach(e => {
      const diffMins = Math.floor((now - e._ts) / 60000)
      if (diffMins >= 0 && diffMins < 60) {
        const idx = 59 - diffMins
        b[idx].count++
        if (e.type === 'Warning') b[idx].warnings++
      }
    })
    return b
  }, [events])

  return (
    <div className="bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-[28px] p-8 shadow-inner">
      <div className="flex items-center justify-between mb-8 px-2">
        <span className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.3em]">Event Stream Density (Last Hour)</span>
        <div className="flex items-center gap-1.5 p-1 px-3 rounded-xl bg-slate-100 dark:bg-black/20 border border-slate-200/50 dark:border-white/5">
           <span className="text-[10px] font-black text-slate-700 dark:text-slate-300 tabular-nums">{events.length}</span>
           <span className="text-[9px] font-bold text-slate-500 uppercase">Records tracked</span>
        </div>
      </div>
      <div className="flex gap-1 h-12 items-end">
        {buckets.map((b, i) => {
          const total = b.count
          const height = total === 0 ? '4px' : `${Math.min(100, (total / 5) * 100)}%`
          const color = b.warnings > 0 ? 'bg-rose-500' : total > 0 ? 'bg-blue-500' : 'bg-slate-200 dark:bg-white/5'
          return (
            <div
              key={i}
              className={`flex-1 rounded-full transition-all duration-1000 ${color} shadow-sm`}
              style={{ height }}
              title={`${total} events (${b.warnings} warnings) at ${new Date(b.timestamp).toLocaleTimeString()}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between mt-4 px-2 text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.4em]">
        <span>Ancient history (60m)</span>
        <span>Realtime</span>
      </div>
    </div>
  )
}

function EmptySection({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-white/[0.01] border border-dashed border-slate-200 dark:border-white/10 rounded-[40px] gap-5">
      <div className="w-16 h-16 rounded-[24px] bg-slate-50 dark:bg-white/[0.03] flex items-center justify-center text-slate-300 dark:text-slate-700 shadow-inner">
        <LayoutGrid size={32} />
      </div>
      <p className="text-[11px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.4em]">{message}</p>
    </div>
  )
}
