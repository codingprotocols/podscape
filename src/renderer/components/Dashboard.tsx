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
          stroke="rgba(255,255,255,0.07)"
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
          fill="white"
          fontSize={size < 60 ? 10 : 12}
          fontWeight="700"
          fontFamily="monospace"
        >
          {Math.round(pct)}%
        </text>
      </svg>
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
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
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-mono text-gray-400">{value}</span>
      </div>
      <div className="h-1 rounded-full bg-white/8 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
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
    green:  'text-green-400',
    yellow: 'text-yellow-400',
    red:    'text-red-400',
    blue:   'text-blue-400',
    gray:   'text-gray-400'
  }
  const color = accent ? accentMap[accent] : 'text-white'

  return (
    <div className="flex flex-col gap-1 bg-white/4 border border-white/8 rounded-xl px-4 py-3 min-w-0">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold tabular-nums leading-none ${color}`}>{value}</span>
      {sub && <span className="text-xs text-gray-600">{sub}</span>}
    </div>
  )
}

// ─── Node card ────────────────────────────────────────────────────────────────

function NodeCard({ node, metrics }: { node: KubeNode; metrics: NodeMetrics | undefined }) {
  const ready = getNodeReady(node)
  const ni = node.status.nodeInfo

  // Capacity
  const cpuCapM  = parseCpuMillicores(node.status.allocatable?.cpu ?? node.status.capacity?.cpu ?? '0')
  const memCapMiB = parseMemoryMiB(node.status.allocatable?.memory ?? node.status.capacity?.memory ?? '0Ki')

  // Usage from metrics-server
  const cpuUsedM   = metrics ? parseCpuMillicores(metrics.usage.cpu) : null
  const memUsedMiB = metrics ? parseMemoryMiB(metrics.usage.memory) : null

  const cpuPct = (cpuUsedM !== null && cpuCapM > 0) ? (cpuUsedM / cpuCapM) * 100 : null
  const memPct = (memUsedMiB !== null && memCapMiB > 0) ? (memUsedMiB / memCapMiB) * 100 : null

  const fmtCpu = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)}` : `${Math.round(m)}m`
  const fmtMem = (mib: number) => mib >= 1024 ? `${(mib / 1024).toFixed(1)} Gi` : `${Math.round(mib)} Mi`

  const internalIP = (node.status.addresses ?? []).find(a => a.type === 'InternalIP')?.address

  return (
    <div className={`
      flex flex-col gap-4 bg-gray-900/80 border rounded-2xl p-4
      transition-shadow hover:shadow-lg hover:shadow-black/30
      ${ready
        ? 'border-white/10 hover:border-white/20'
        : 'border-red-500/30 bg-red-950/20'
      }
    `}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white font-mono truncate">{node.metadata.name}</p>
          {internalIP && (
            <p className="text-xs text-gray-500 font-mono mt-0.5">{internalIP}</p>
          )}
        </div>
        <span className={`
          shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset
          ${ready
            ? 'bg-green-500/15 text-green-300 ring-green-500/25'
            : 'bg-red-500/15 text-red-300 ring-red-500/25'
          }
        `}>
          <span className={`w-1.5 h-1.5 rounded-full ${ready ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          {ready ? 'Ready' : 'NotReady'}
        </span>
      </div>

      {/* Ring charts (only shown when metrics are available) */}
      {(cpuPct !== null || memPct !== null) && (
        <div className="flex items-center justify-around py-1">
          {cpuPct !== null && <RingChart pct={cpuPct} label="CPU" />}
          {memPct !== null && <RingChart pct={memPct} label="Mem" />}
        </div>
      )}

      {/* Capacity bars (always shown) */}
      <div className="space-y-2.5">
        {cpuPct !== null && cpuUsedM !== null ? (
          <UsageBar
            label="CPU"
            pct={cpuPct}
            value={`${fmtCpu(cpuUsedM)} / ${fmtCpu(cpuCapM)}`}
          />
        ) : (
          <UsageBar
            label="CPU (alloc)"
            pct={0}
            value={`${fmtCpu(cpuCapM)} total`}
          />
        )}
        {memPct !== null && memUsedMiB !== null ? (
          <UsageBar
            label="Memory"
            pct={memPct}
            value={`${fmtMem(memUsedMiB)} / ${fmtMem(memCapMiB)}`}
          />
        ) : (
          <UsageBar
            label="Memory (alloc)"
            pct={0}
            value={`${fmtMem(memCapMiB)} total`}
          />
        )}
      </div>

      {/* System info */}
      <div className="space-y-1 border-t border-white/8 pt-3">
        {ni && (
          <>
            <InfoRow k="Kubelet" v={ni.kubeletVersion} mono />
            <InfoRow k="OS" v={`${ni.operatingSystem}/${ni.architecture}`} />
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
      <span className="text-xs text-gray-600 w-16 shrink-0">{k}</span>
      <span className={`text-xs text-gray-400 truncate ${mono ? 'font-mono' : ''}`}>{v}</span>
    </div>
  )
}

// ─── Event row ────────────────────────────────────────────────────────────────

function EventRow({ event: e }: { event: KubeEvent }) {
  const isWarning = e.type === 'Warning'
  const ts = e.lastTimestamp ?? e.firstTimestamp ?? e.eventTime ?? ''

  return (
    <div className={`
      flex items-start gap-3 px-4 py-3 hover:bg-white/3 transition-colors
      ${isWarning ? 'border-l-2 border-orange-500/60' : 'border-l-2 border-transparent'}
    `}>
      {/* Type badge */}
      <span className={`
        shrink-0 mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium
        ${isWarning ? 'bg-orange-500/20 text-orange-300' : 'bg-gray-700/60 text-gray-400'}
      `}>
        {isWarning ? '⚠' : '◉'} {e.type ?? '?'}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-200">{e.reason ?? '—'}</span>
          <span className="text-xs text-gray-500 font-mono truncate">
            {e.involvedObject.kind}/{e.involvedObject.name}
          </span>
          {e.metadata.namespace && (
            <span className="text-xs text-gray-600 font-mono shrink-0">
              ns:{e.metadata.namespace}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{e.message ?? ''}</p>
      </div>

      {/* Age */}
      <div className="shrink-0 text-right">
        {ts && <span className="text-xs text-gray-600">{formatAge(ts)} ago</span>}
        {e.count && e.count > 1 && (
          <p className="text-xs text-gray-700 mt-0.5">×{e.count}</p>
        )}
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard(): JSX.Element {
  const {
    loadDashboard, loadingResources, refresh,
    nodes, nodeMetrics, events,
    pods, deployments, namespaces,
    selectedContext, selectedNamespace
  } = useAppStore()

  useEffect(() => { loadDashboard() }, [selectedContext])

  // Derived stats
  const runningPods   = pods.filter(p => p.status.phase === 'Running').length
  const readyNodes    = nodes.filter(getNodeReady).length
  const warnEvents    = events.filter(e => e.type === 'Warning').length
  const readyDeploys  = deployments.filter(
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
    <div className="flex flex-col flex-1 h-full overflow-auto bg-gray-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
        <div>
          <h1 className="text-base font-bold text-white">Dashboard</h1>
          {selectedContext && (
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{selectedContext}</p>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loadingResources}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 bg-white/5
                     hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 border border-white/10"
        >
          <span className={loadingResources ? 'animate-spin inline-block' : 'inline-block'}>↻</span>
          Refresh
        </button>
      </div>

      <div className="flex-1 px-6 py-5 space-y-8 min-h-0">
        {/* ── Cluster stats ───────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Cluster Overview
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Nodes
              {nodeMetrics.length === 0 && (
                <span className="ml-2 text-gray-700 normal-case font-normal tracking-normal">
                  · install metrics-server for live usage
                </span>
              )}
            </h2>
            {loadingResources && (
              <div className="w-3.5 h-3.5 border-2 border-gray-700 border-t-gray-400 rounded-full animate-spin" />
            )}
          </div>

          {nodes.length === 0 && !loadingResources ? (
            <EmptySection message="No nodes found" />
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Recent Events
            </h2>
            <div className="flex items-center gap-2">
              {warnEvents > 0 && (
                <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full">
                  {warnEvents} warning{warnEvents !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {recentEvents.length === 0 && !loadingResources ? (
            <EmptySection message="No events" />
          ) : (
            <div className="bg-gray-900/60 border border-white/8 rounded-2xl overflow-hidden divide-y divide-white/5">
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
    <div className="flex items-center justify-center py-10 bg-gray-900/40 border border-white/6 rounded-2xl">
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  )
}
