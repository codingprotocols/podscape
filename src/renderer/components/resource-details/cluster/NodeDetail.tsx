import React, { useState, useMemo } from 'react'
import type { KubeNode } from '../../../types'
import { formatAge, getNodeReady, parseMemoryMiB, parseCpuMillicores } from '../../../types'
import { useAppStore } from '../../../store'
import { canVerb } from '../../../store/slices/clusterSlice'
import YAMLViewer from '../../common/YAMLViewer'
import TimeSeriesChart, { PrometheusTimeRangeBar } from '../../advanced/TimeSeriesChart'
import { nodeCpuQuery, nodeMemoryQuery } from '../../../utils/prometheusQueries'

interface Props { node: KubeNode }

export default function NodeDetail({ node }: Props): JSX.Element {
  const { getYAML, applyYAML, pods, nodeMetrics, selectResource, prometheusAvailable, selectedContext } = useAppStore()
  const allowedVerbs = useAppStore(s => s.allowedVerbs)
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<'cordon' | 'uncordon' | 'drain' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const nodeName = node.metadata.name
  const promCpuQueries    = useMemo(() => [nodeCpuQuery(nodeName)],    [nodeName])
  const promMemoryQueries = useMemo(() => [nodeMemoryQuery(nodeName)], [nodeName])

  const nodePods = pods.filter(p => p.spec.nodeName === node.metadata.name)
  const metrics = nodeMetrics.find(m => m.metadata.name === node.metadata.name)

  const ready = getNodeReady(node)
  const internalIP = (node.status.addresses ?? []).find(a => a.type === 'InternalIP')?.address ?? '—'
  const externalIP = (node.status.addresses ?? []).find(a => a.type === 'ExternalIP')?.address ?? '—'
  const ni = node.status.nodeInfo

  const labels = node.metadata.labels ?? {}
  const roles = Object.keys(labels)
    .filter(k => k.startsWith('node-role.kubernetes.io/'))
    .map(k => k.replace('node-role.kubernetes.io/', ''))
    .concat(labels['kubernetes.io/role'] ? [labels['kubernetes.io/role']] : [])
    .join(', ') || 'worker'

  const cpuCap = parseCpuMillicores(node.status.capacity?.cpu ?? '0')
  const cpuAlloc = parseCpuMillicores(node.status.allocatable?.cpu ?? '0')
  const memCapMiB = parseMemoryMiB(node.status.capacity?.memory ?? '0Ki')
  const memAllocMiB = parseMemoryMiB(node.status.allocatable?.memory ?? '0Ki')

  const handleViewYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    try {
      const content = await getYAML('node', node.metadata.name, true)
      setYaml(content)
    } catch (err) {
      setYamlError((err as Error).message ?? 'Failed to fetch YAML')
    } finally {
      setYamlLoading(false)
    }
  }

  const handleApplyYAML = async (updated: string) => {
    await applyYAML(updated)
    const refreshed = await getYAML('node', node.metadata.name, true)
    setYaml(refreshed)
  }

  const isCordonned = !!node.spec.unschedulable

  const handleCordon = async () => {
    const action = isCordonned ? 'uncordon' : 'cordon'
    setActionLoading(action); setActionError(null)
    try {
      await window.kubectl.cordonNode(selectedContext!, node.metadata.name, !isCordonned)
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDrain = async () => {
    setActionLoading('drain'); setActionError(null)
    try {
      await window.kubectl.drainNode(selectedContext!, node.metadata.name)
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      <div className="px-6 py-6 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600/10 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600 dark:text-blue-400">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{node.metadata.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ring-1 ring-inset ${ready ? 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/20' : 'bg-red-500/10 text-red-500 ring-red-500/20'}`}>
                {ready ? 'Ready' : 'NotReady'}
              </span>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{formatAge(node.metadata.creationTimestamp)} old</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={handleViewYAML} disabled={yamlLoading}
            className="text-[11px] font-bold px-4 py-1.5 rounded-xl bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-white/5 hover:bg-white/10 transition-all disabled:opacity-50 uppercase tracking-wider">
            {yamlLoading ? 'Loading…' : 'YAML'}
          </button>
          {(canVerb(allowedVerbs, 'nodes', 'update') || canVerb(allowedVerbs, 'nodes', 'patch')) && (
            <button
              onClick={handleCordon}
              disabled={actionLoading !== null}
              className={`text-[11px] font-bold px-4 py-1.5 rounded-xl border transition-all disabled:opacity-50 uppercase tracking-wider ${
                isCordonned
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
              }`}
            >
              {actionLoading === 'cordon' || actionLoading === 'uncordon'
                ? (isCordonned ? 'Uncordoning…' : 'Cordoning…')
                : (isCordonned ? 'Uncordon' : 'Cordon')}
            </button>
          )}
          {(canVerb(allowedVerbs, 'nodes', 'update') || canVerb(allowedVerbs, 'nodes', 'patch')) && (
            <button
              onClick={handleDrain}
              disabled={actionLoading !== null}
              className="text-[11px] font-bold px-4 py-1.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-50 uppercase tracking-wider"
            >
              {actionLoading === 'drain' ? 'Draining…' : 'Drain'}
            </button>
          )}
        </div>
        {actionError && (
          <p className="mt-2 text-[10px] text-red-500 font-mono break-all">{actionError}</p>
        )}
      </div>

      {/* Resource usage — live metrics if available, allocatable otherwise */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
            Resources
          </h4>
          {metrics ? (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-blue-500 uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Live
            </span>
          ) : (
            <span
              className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest cursor-default"
              title="Install metrics-server to see live CPU and memory usage"
            >
              Allocatable only
            </span>
          )}
        </div>
        <div className="space-y-4 px-1">
          <CombinedResourceBar
            label="CPU"
            liveUsed={metrics ? parseCpuMillicores(metrics.usage.cpu) : null}
            allocatable={cpuAlloc}
            capacity={cpuCap}
            format={v => `${Math.round(v)}m`}
          />
          <CombinedResourceBar
            label="Memory"
            liveUsed={metrics ? parseMemoryMiB(metrics.usage.memory) : null}
            allocatable={memAllocMiB}
            capacity={memCapMiB}
            format={v => v >= 1024 ? `${(v / 1024).toFixed(1)} Gi` : `${Math.round(v)} Mi`}
          />
          {node.status.capacity?.pods && (
            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 w-28 shrink-0">Max Pods</span>
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">{node.status.capacity.pods}</span>
            </div>
          )}
        </div>
      </div>

      {/* Prometheus time-series */}
      {prometheusAvailable && (
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Metrics History</span>
            <PrometheusTimeRangeBar />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TimeSeriesChart queries={promCpuQueries}    title="CPU"    unit="%" />
            <TimeSeriesChart queries={promMemoryQueries} title="Memory" unit="%" />
          </div>
        </div>
      )}

      {/* Addresses */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5">
        <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Addresses</h4>
        <dl className="space-y-1.5 px-1">
          <Row label="Internal IP" value={internalIP} mono />
          <Row label="External IP" value={externalIP} mono />
          <Row label="Pod CIDR" value={node.spec.podCIDR ?? '—'} mono />
        </dl>
      </div>


      {/* System info */}
      {ni && (
        <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">System</h4>
          <dl className="space-y-1.5 px-1">
            <Row label="Roles" value={roles} />
            <Row label="Kubelet" value={ni.kubeletVersion} mono />
            <Row label="OS" value={ni.osImage} />
            <Row label="Kernel" value={ni.kernelVersion} mono />
            <Row label="Arch" value={ni.architecture} />
            <Row label="Runtime" value={ni.containerRuntimeVersion} mono />
          </dl>
        </div>
      )}

      {/* Taints */}
      {node.spec.taints && node.spec.taints.length > 0 && (
        <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Taints</h4>
          <div className="flex flex-wrap gap-1 px-1">
            {node.spec.taints.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-lg font-mono">
                  {t.key}{t.value ? `=${t.value}` : ''}:{t.effect}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Labels */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5">
        <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Labels</h4>
        <LabelGroup kv={node.metadata.labels} />
      </div>

      {/* Annotations */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5">
        <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Annotations</h4>
        <LabelGroup kv={node.metadata.annotations} />
      </div>

      {/* Status Values */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5">
        <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Status Values</h4>
        <dl className="space-y-1.5 px-1">
          <Row label="Unschedulable" value={node.spec.unschedulable ? 'Yes' : 'No'} />
          <Row label="Phase" value={node.status.nodeInfo?.operatingSystem ?? '—'} />
          <Row label="Host IP" value={(node.status.addresses ?? []).find(a => a.type === 'Hostname')?.address ?? '—'} />
          {node.spec.podCIDRs && node.spec.podCIDRs.length > 0 && (
            <Row label="Pod CIDRs" value={node.spec.podCIDRs.join(', ')} mono />
          )}
        </dl>
      </div>


      {/* Running Pods */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Pods on Node</h4>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-500">{nodePods.length}</span>
        </div>
        
        {nodePods.length > 0 ? (
          <div className="space-y-2 px-1">
            {nodePods.map(pod => (
              <div key={pod.metadata.uid} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer group"
                onClick={() => selectResource(pod)}>
                <div className="min-w-0 pr-2">
                  <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate font-mono">{pod.metadata.name}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{pod.metadata.namespace}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[9px] font-black uppercase tracking-widest ${
                    pod.status.phase === 'Running' ? 'text-emerald-500' : 
                    pod.status.phase === 'Succeeded' ? 'text-blue-500' : 'text-amber-500'
                  }`}>
                    {pod.status.phase}
                  </span>
                  <span className="text-[10px] text-slate-400 group-hover:text-blue-500 transition-colors">→</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 italic px-1">No pods found on this node.</p>
        )}
      </div>

      {/* Conditions */}
      {node.status.conditions && (
        <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Conditions</h4>
          <div className="space-y-1">
            {node.status.conditions.map(c => (
              <div key={c.type} className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${(c.type === 'Ready' && c.status === 'True') ||
                  (c.type !== 'Ready' && c.status === 'False')
                  ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{c.type}</span>
                {c.reason && <span className="text-xs text-slate-500 dark:text-slate-400 truncate">— {c.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* YAML viewer modal */}
      {(yamlLoading || yaml !== null || yamlError !== null) && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">{yamlLoading ? 'Loading YAML…' : `YAML — ${node.metadata.name}`}</h3>
              <button onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 transition-colors">✕</button>
            </div>
            <div className="flex-1 min-h-0">
              {yamlError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                  <p className="text-sm font-bold text-red-400">Failed to load YAML</p>
                  <pre className="text-xs text-slate-400 dark:text-slate-500 text-center max-w-lg break-words whitespace-pre-wrap">{yamlError}</pre>
                </div>
              ) : yamlLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : yaml !== null ? (
                <YAMLViewer content={yaml} editable onSave={handleApplyYAML} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 w-28 shrink-0">{label}</dt>
      <dd className={`text-[11px] text-slate-700 dark:text-slate-200 truncate ${mono ? 'font-mono' : 'font-medium'}`}>{value}</dd>
    </div>
  )
}

function LabelGroup({ kv }: { kv?: Record<string, string> }) {
  if (!kv || Object.keys(kv).length === 0) return <p className="text-[11px] text-slate-500 italic px-1">None</p>
  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {Object.entries(kv).map(([k, v]) => (
        <div key={k} className="flex items-center text-[10px] leading-none rounded-lg overflow-hidden border border-slate-200 dark:border-white/10 shadow-sm transition-all hover:border-blue-500/30">
          <span className="px-2 py-1 bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-white/10 font-bold">{k}</span>
          <span className="px-2 py-1 bg-white dark:bg-transparent text-slate-700 dark:text-slate-300 font-mono">{v}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Shows live usage (if metrics-server is available) or allocatable vs capacity.
 * When live data is present, a secondary allocatable marker is drawn on the bar.
 */
function CombinedResourceBar({ label, liveUsed, allocatable, capacity, format }: {
  label: string
  liveUsed: number | null   // null = metrics-server not available
  allocatable: number
  capacity: number
  format: (v: number) => string
}) {
  const hasLive = liveUsed !== null
  const primaryUsed = hasLive ? liveUsed! : allocatable
  const pct = capacity > 0 ? Math.min(100, (primaryUsed / capacity) * 100) : 0
  const allocPct = capacity > 0 ? Math.min(100, (allocatable / capacity) * 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</span>
        <div className="flex items-center gap-2 text-[11px]">
          {hasLive ? (
            <>
              <span className="font-bold text-slate-700 dark:text-slate-200">{format(liveUsed!)} used</span>
              <span className="text-slate-400 dark:text-slate-500">of {format(capacity)}</span>
            </>
          ) : (
            <>
              <span className="font-bold text-slate-700 dark:text-slate-200">{format(allocatable)} allocatable</span>
              <span className="text-slate-400 dark:text-slate-500">of {format(capacity)}</span>
            </>
          )}
        </div>
      </div>

      {/* Bar — overflow-hidden only on the fill track, not the marker wrapper */}
      <div className="relative h-2.5">
        <div className="absolute inset-0 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              pct > 80 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
              : pct > 60 ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
              : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Allocatable boundary marker — sits outside overflow-hidden so it never gets clipped */}
        {hasLive && (
          <div
            className="absolute top-0 h-full w-px bg-slate-500/60 dark:bg-white/30"
            style={{ left: `${Math.min(allocPct, 99)}%` }}
            title={`Allocatable: ${format(allocatable)}`}
          />
        )}
      </div>

      {/* Sub-labels when live is available */}
      {hasLive && (
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 rounded bg-blue-500 inline-block" />
            Live {Math.round(pct)}%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-0.5 rounded bg-slate-400/50 dark:bg-white/20 inline-block" />
            Allocatable {Math.round(allocPct)}%
          </span>
        </div>
      )}
    </div>
  )
}
