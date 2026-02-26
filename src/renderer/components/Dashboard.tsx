import React, { useEffect } from 'react'
import { useAppStore } from '../store'
import type { KubeNode, KubeEvent, NodeMetrics } from '../types'
import {
  getNodeReady, formatAge,
  parseCpuMillicores, parseMemoryMiB
} from '../types'

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
    pct >= 85 ? '#ef4444' :
      pct >= 65 ? '#f97316' :
        pct >= 45 ? '#eab308' :
          '#3b82f6'

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="currentColor"
          className="text-slate-100 dark:text-slate-800"
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
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        {/* Percentage */}
        <text
          x={cx} y={cy + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="currentColor"
          className="text-slate-900 dark:text-white"
          fontSize={size < 60 ? 10 : 12}
          fontWeight="800"
          fontFamily="monospace"
        >
          {Math.round(pct)}%
        </text>
      </svg>
      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</span>
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
    green: 'text-emerald-600 dark:text-emerald-400',
    yellow: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    blue: 'text-blue-600 dark:text-blue-400',
    gray: 'text-slate-400 dark:text-slate-500'
  }
  const color = accent ? accentMap[accent] : 'text-slate-900 dark:text-white'

  return (
    <div className="flex flex-col gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-4 shadow-sm transition-all hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 min-w-0">
      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</span>
      <span className={`text-2xl font-extrabold tabular-nums leading-none tracking-tight ${color}`}>{value}</span>
      {sub && <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600 truncate">{sub}</span>}
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
      flex flex-col gap-5 bg-white dark:bg-slate-900 border rounded-2xl p-5
      transition-all shadow-sm hover:shadow-xl hover:-translate-y-1
      ${ready
        ? 'border-slate-200 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-900/50'
        : 'border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/10'
      }
    `}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono truncate tracking-tight">{node.metadata.name}</p>
          {internalIP && (
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 font-mono mt-0.5 tracking-wider">{internalIP}</p>
          )}
        </div>
        <span className={`
          shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 transition-all
          ${ready
            ? 'bg-emerald-50 text-emerald-700 outline-emerald-500/20 dark:bg-emerald-900/20 dark:text-emerald-400'
            : 'bg-red-50 text-red-700 outline-red-500/20 dark:bg-red-900/20 dark:text-red-400'
          }
        `}>
          <span className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          {ready ? 'READY' : 'OFFLINE'}
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
      flex items-start gap-4 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors
      ${isWarning ? 'border-l-4 border-amber-500/60 bg-amber-50/10' : 'border-l-4 border-transparent'}
    `}>
      {/* Type badge */}
      <span className={`
        shrink-0 mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
        ${isWarning ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}
      `}>
        {isWarning ? '!' : '#'} {e.type ?? '?'}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{e.reason ?? '—'}</span>
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 font-mono truncate tracking-tight bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            {e.involvedObject.kind}/{e.involvedObject.name}
          </span>
          {e.metadata.namespace && (
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600 font-mono shrink-0">
              @{e.metadata.namespace}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed tracking-tight">{e.message ?? ''}</p>
      </div>

      {/* Age */}
      <div className="shrink-0 text-right">
        {ts && <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600">{formatAge(ts)} AGO</span>}
        {e.count && e.count > 1 && (
          <p className="text-[10px] font-extrabold text-blue-500 dark:text-blue-400 mt-1">×{e.count}</p>
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

  // Derived stats
  const runningPods = pods.filter(p => p.status.phase === 'Running').length
  const readyNodes = nodes.filter(getNodeReady).length
  const warnEvents = events.filter(e => e.type === 'Warning').length
  const readyDeploys = deployments.filter(
    d => (d.status.readyReplicas ?? 0) >= (d.spec.replicas ?? 0) && (d.spec.replicas ?? 0) > 0
  ).length

  const metricsById = new Map(nodeMetrics.map(m => [m.metadata.name, m]))

  const recentEvents = [...events]
    .sort((a, b) => {
      const ta = new Date(a.lastTimestamp ?? a.firstTimestamp ?? a.eventTime ?? 0).getTime()
      const tb = new Date(b.lastTimestamp ?? b.firstTimestamp ?? b.eventTime ?? 0).getTime()
      return tb - ta
    })
    .slice(0, 15)

  return (
    <div className="flex flex-col flex-1 h-full overflow-auto bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-6 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-950">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Dashboard</h1>
          {selectedContext && (
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 font-mono uppercase tracking-[0.2em]">{selectedContext}</p>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loadingResources}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300
                     bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg shadow-sm
                     disabled:opacity-50 border border-slate-200 dark:border-slate-800 transition-all active:scale-95"
        >
          <span className={`transition-transform duration-500 ${loadingResources ? 'animate-spin' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6m12 6a9 9 0 0 1-15-6.7L3 16" /></svg>
          </span>
          Refresh
        </button>
      </div>

      <div className="flex-1 px-8 py-8 space-y-10 min-h-0">
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
            {loadingResources && (
              <div className="w-4 h-4 border-2 border-slate-200 dark:border-slate-800 border-t-blue-500 rounded-full animate-spin" />
            )}
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
                <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-2.5 py-0.5 rounded-full font-bold">
                  {warnEvents} WARNINGS
                </span>
              )}
            </div>
          </div>

          {recentEvents.length === 0 && !loadingResources ? (
            <EmptySection message="No recent events" />
          ) : (
            <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 shadow-sm rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/50">
              {/* Warnings first */}
              {recentEvents
                .sort((a, b) => {
                  if (a.type === 'Warning' && b.type !== 'Warning') return -1
                  if (a.type !== 'Warning' && b.type === 'Warning') return 1
                  return 0
                })
                .map(event => (
                  <EventRow key={event.metadata.uid} event={event} />
                ))
              }
            </div>
          )}
        </section>
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
