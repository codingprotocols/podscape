import React, { useEffect, useMemo } from 'react'
import { useAppStore } from '../store'
import type { KubeNode, KubeEvent, NodeMetrics } from '../types'
import {
  getNodeReady, formatAge,
  parseCpuMillicores, parseMemoryMiB
} from '../types'
import LoadingAnimation from './LoadingAnimation'

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
          className="text-slate-100 dark:text-white/5"
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
        <span className="text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700 shadow-[0_0_8px_rgba(0,0,0,0.1)]`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent
}: {
  label: string
  value: string | number
  sub?: string
  accent?: 'green' | 'yellow' | 'red' | 'blue' | 'gray'
}) {
  const accentMap = {
    green: 'text-emerald-500',
    yellow: 'text-amber-500',
    red: 'text-rose-500',
    blue: 'text-blue-500',
    gray: 'text-slate-500'
  }
  const color = accent ? accentMap[accent] : 'text-slate-900 dark:text-white'

  return (
    <div className="flex flex-col gap-2 card-solid px-6 py-5 min-w-0 group hover:scale-[1.02] hover:border-slate-300 dark:hover:border-slate-700 shadow-sm">
      <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">{label}</span>
      <span className={`text-3xl font-black tabular-nums leading-none tracking-tighter ${color}`}>{value}</span>
      {sub && <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-600 truncate">{sub}</span>}
    </div>
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
      flex flex-col gap-6 glass-card glass-light p-6 scale-in
      ${!ready && 'border-rose-500/30 bg-rose-500/5'}
    `}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[15px] font-black text-slate-900 dark:text-white font-mono truncate tracking-tight">{node.metadata.name}</p>
          {internalIP && (
            <p className="text-[10px] font-black text-slate-500 dark:text-slate-600 font-mono mt-1 tracking-widest">{internalIP}</p>
          )}
        </div>
        <span className={`
          shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest outline outline-1
          ${ready
            ? 'bg-emerald-500/10 text-emerald-500 outline-emerald-500/20'
            : 'bg-rose-500/10 text-rose-500 outline-rose-500/20'
          }
        `}>
          <span className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-rose-500'}`} />
          {ready ? 'Active' : 'Down'}
        </span>
      </div>

      {/* Ring charts */}
      {(cpuPct !== null || memPct !== null) && (
        <div className="flex items-center justify-around py-1 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl py-3 border border-slate-100 dark:border-slate-800/50">
          {cpuPct !== null && <RingChart pct={cpuPct} label="CPU" />}
          {memPct !== null && <RingChart pct={memPct} label="MEM" />}
        </div>
      )}

      {/* Capacity bars */}
      <div className="space-y-3">
        {cpuPct !== null && cpuUsedM !== null ? (
          <UsageBar label="CPU" pct={cpuPct} value={`${fmtCpu(cpuUsedM)} / ${fmtCpu(cpuCapM)}`} />
        ) : (
          <UsageBar label="CPU (ALLOC)" pct={0} value={`${fmtCpu(cpuCapM)} total`} />
        )}
        {memPct !== null && memUsedMiB !== null ? (
          <UsageBar label="MEMORY" pct={memPct} value={`${fmtMem(memUsedMiB)} / ${fmtMem(memCapMiB)}`} />
        ) : (
          <UsageBar label="MEM (ALLOC)" pct={0} value={`${fmtMem(memCapMiB)} total`} />
        )}
      </div>

      {/* System info */}
      <div className="space-y-1.5 border-t border-slate-100 dark:border-slate-800/50 pt-4">
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
      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600 w-16 shrink-0 uppercase tracking-tighter">{k}</span>
      <span className={`text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate ${mono ? 'font-mono' : ''}`}>{v}</span>
    </div>
  )
}

// ─── Event row ────────────────────────────────────────────────────────────────

function EventRow({ event: e }: { event: KubeEvent }) {
  const isWarning = e.type === 'Warning'
  const ts = e.lastTimestamp ?? e.firstTimestamp ?? e.eventTime ?? ''

  return (
    <div className={`
      flex items-start gap-4 px-8 py-5 hover:bg-white/5 transition-all
      ${isWarning ? 'bg-rose-500/[0.03]' : ''}
    `}>
      {/* Type indicator */}
      <div className={`shrink-0 mt-1.5 w-2 h-2 rounded-full ${isWarning ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : 'bg-slate-700'}`} />

      <div className="flex-1 min-w-0 pl-1">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-sm font-black text-slate-900 dark:text-white tracking-tight">{e.reason ?? '—'}</span>
          <span className="text-[10px] font-black text-slate-500 dark:text-slate-600 font-mono uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded border border-white/5">
            {e.involvedObject.kind}
          </span>
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 font-mono truncate max-w-[150px]">
            {e.involvedObject.name}
          </span>
          {e.metadata.namespace && (
            <span className="text-[9px] font-black text-blue-500/60 uppercase tracking-widest">
              {e.metadata.namespace}
            </span>
          )}
        </div>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed tracking-tight font-medium">{e.message ?? ''}</p>
      </div>

      {/* Age & Count */}
      <div className="shrink-0 text-right">
        {ts && <span className="text-[10px] font-black text-slate-500 dark:text-slate-600 uppercase tracking-tighter">{formatAge(ts)} ago</span>}
        {e.count && e.count > 1 && (
          <div className="mt-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[10px] font-black tracking-tighter">
            ×{e.count}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard(): JSX.Element {
  const {
    loadDashboard, loadingResources, refresh,
    pods, deployments, namespaces,
    nodes, nodeMetrics, events,
    selectedContext
  } = useAppStore()

  useEffect(() => { loadDashboard() }, [selectedContext])

  // Pre-calculate timestamps and derive stats memoized
  const { 
    runningPods, readyNodes, warnEvents, readyDeploys, 
    recentEvents, processedEvents, metricsById 
  } = useMemo(() => {
    // Stats calculation
    const runningPods = pods.filter(p => p.status.phase === 'Running').length
    const readyNodes = nodes.filter(getNodeReady).length
    const warnEvents = events.filter(e => e.type === 'Warning').length
    const readyDeploys = deployments.filter(
      d => (d.status.readyReplicas ?? 0) >= (d.spec.replicas ?? 0) && (d.spec.replicas ?? 0) > 0
    ).length

    // Map metrics for O(1) lookup
    const safeNodeMetrics = Array.isArray(nodeMetrics) ? nodeMetrics : []
    const metricsById = new Map(safeNodeMetrics.map(m => [m.metadata.name, m]))

    // Sorted and pre-parsed events
    const safeEvents = Array.isArray(events) ? events : []
    const processedEvents = safeEvents.map(e => ({
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

    return { runningPods, readyNodes, warnEvents, readyDeploys, recentEvents: sortedEvents, processedEvents, metricsById }
  }, [pods, deployments, nodes, events, nodeMetrics])

  return (
    <div className="flex flex-col flex-1 h-full overflow-auto bg-slate-50 dark:bg-[hsl(var(--bg-dark))] transition-colors duration-200">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-8 border-b border-slate-200 dark:border-white/5 shrink-0 bg-white/5 backdrop-blur-md">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">Dashboard</h1>
          {selectedContext && (
            <p className="text-[10px] font-black text-slate-500 dark:text-slate-600 mt-2.5 font-mono uppercase tracking-[0.25em] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
              {selectedContext}
            </p>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loadingResources}
          className="flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300
                     glass-panel hover:bg-white/10 dark:hover:bg-white/5 rounded-xl shadow-sm
                     disabled:opacity-50 active:scale-95"
        >
          <span className={`transition-transform duration-700 ${loadingResources ? 'animate-spin' : ''}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6m12 6a9 9 0 0 1-15-6.7L3 16" /></svg>
          </span>
          Sync
        </button>
      </div>

      <div className="flex-1 px-8 py-8 space-y-10 min-h-0">
        {loadingResources ? (
          <div className="h-full flex items-center justify-center py-24">
            <LoadingAnimation />
          </div>
        ) : (
          <>
            {/* ── Cluster stats ───────────────────────────────────────────────── */}
            <section>
              <h2 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-4">
                Cluster Overview
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <StatCard
                  label="Pods"
                  value={pods.length}
                  sub={`${runningPods} running`}
                  accent={runningPods < pods.length ? 'yellow' : 'green'}
                />
                <StatCard
                  label="Deployments"
                  value={deployments.length}
                  sub={`${readyDeploys} ready`}
                  accent={readyDeploys < deployments.length ? 'yellow' : 'green'}
                />
                <StatCard
                  label="Nodes"
                  value={nodes.length}
                  sub={`${readyNodes} ready`}
                  accent={readyNodes < nodes.length ? 'red' : 'green'}
                />
                <StatCard
                  label="Namespaces"
                  value={namespaces.length}
                  accent="blue"
                />
                <StatCard
                  label="Warnings"
                  value={warnEvents}
                  sub={warnEvents > 0 ? 'across all ns' : 'none'}
                  accent={warnEvents > 0 ? 'red' : 'gray'}
                />
              </div>
            </section>

            {/* ── Nodes ───────────────────────────────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em]">
                  Cluster Nodes
                  {nodeMetrics.length === 0 && (
                    <span className="ml-3 text-slate-400/50 normal-case font-medium tracking-tight">
                      · metrics-server disabled
                    </span>
                  )}
                </h2>
              </div>

              {nodes.length === 0 && !loadingResources ? (
                <EmptySection message="No nodes discovered" />
              ) : (
                <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {nodes.map(node => (
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
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em]">
                  Timeline & Events
                </h2>
                <div className="flex items-center gap-3">
                  {warnEvents > 0 && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 px-2.5 py-0.5 rounded-full font-bold">
                      {warnEvents} WARNINGS
                    </span>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <EventTimeline events={processedEvents} />
              </div>

              {recentEvents.length === 0 && !loadingResources ? (
                <EmptySection message="No recent events" />
              ) : (
                <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/50">
                  {recentEvents.map(event => (
                      <EventRow key={event.metadata.uid} event={event} />
                    ))
                  }
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function EventTimeline({ events }: { events: (KubeEvent & { _ts: number })[] }) {
  const buckets = useMemo(() => {
    const now = Date.now()
    const buckets = Array(60).fill(0).map((_, i) => ({
      timestamp: now - (59 - i) * 60000,
      count: 0,
      warnings: 0
    }))

    // Iterate through pre-parsed events
    events.forEach(e => {
      const diffMins = Math.floor((now - e._ts) / 60000)
      if (diffMins >= 0 && diffMins < 60) {
        const idx = 59 - diffMins
        buckets[idx].count++
        if (e.type === 'Warning') buckets[idx].warnings++
      }
    })
    return buckets
  }, [events])

  return (
    <div className="glass-card glass-light p-4">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Event Density (Last 60m)</span>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="text-[8px] font-bold text-slate-400 uppercase">Normal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span className="text-[8px] font-bold text-slate-400 uppercase">Warning</span>
          </div>
        </div>
      </div>
      <div className="flex gap-[2px] h-10 items-end">
        {buckets.map((b, i) => {
          const total = b.count
          const height = total === 0 ? '2px' : `${Math.min(100, (total / 5) * 100)}%`
          const color = b.warnings > 0 ? 'bg-rose-500' : total > 0 ? 'bg-blue-500' : 'bg-slate-200 dark:bg-white/5'
          return (
            <div
              key={i}
              className={`flex-1 rounded-t-[1px] transition-all duration-500 ${color}`}
              style={{ height }}
              title={`${total} events (${b.warnings} warnings) at ${new Date(b.timestamp).toLocaleTimeString()}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between mt-2 px-1 text-[8px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-tighter">
        <span>60m ago</span>
        <span>Now</span>
      </div>
    </div>
  )
}

function EmptySection({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 bg-white dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl gap-3">
      <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-300 dark:text-slate-700">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
      </div>
      <p className="text-[11px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">{message}</p>
    </div>
  )
}
