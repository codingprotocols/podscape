import React, { useState } from 'react'
import type { KubeNode } from '../types'
import { formatAge, getNodeReady, parseMemoryMiB, parseCpuMillicores } from '../types'
import { useAppStore } from '../store'
import YAMLViewer from './YAMLViewer'

interface Props { node: KubeNode }

export default function NodeDetail({ node }: Props): JSX.Element {
  const { getYAML } = useAppStore()
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)

  const ready = getNodeReady(node)
  const internalIP = (node.status.addresses ?? []).find(a => a.type === 'InternalIP')?.address ?? '—'
  const externalIP = (node.status.addresses ?? []).find(a => a.type === 'ExternalIP')?.address ?? '—'
  const ni = node.status.nodeInfo

  const cpuCap = parseCpuMillicores(node.status.capacity?.cpu ?? '0')
  const cpuAlloc = parseCpuMillicores(node.status.allocatable?.cpu ?? '0')
  const memCapMiB = parseMemoryMiB(node.status.capacity?.memory ?? '0Ki')
  const memAllocMiB = parseMemoryMiB(node.status.allocatable?.memory ?? '0Ki')

  const handleViewYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    try {
      // Nodes are cluster-scoped, so clusterScoped=true
      const content = await getYAML('node', node.metadata.name, true)
      setYaml(content)
    } catch (err) {
      setYamlError((err as Error).message ?? 'Failed to fetch YAML')
    } finally {
      setYamlLoading(false)
    }
  }

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono flex-1 truncate">{node.metadata.name}</h3>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${ready ? 'bg-green-500/20 text-green-300 ring-green-500/30' : 'bg-red-500/20 text-red-300 ring-red-500/30'
            }`}>
            {ready ? 'Ready' : 'NotReady'}
          </span>
        </div>
        <div className="flex gap-2 mt-2.5">
          <button onClick={handleViewYAML} disabled={yamlLoading}
            className="text-xs px-3 py-1 rounded bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800 hover:bg-white/10 transition-colors disabled:opacity-50">
            {yamlLoading ? 'Loading…' : 'YAML'}
          </button>
        </div>
      </div>

      {/* Addresses */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Addresses</h4>
        <dl className="space-y-1.5">
          <Row label="Internal IP" value={internalIP} mono />
          <Row label="External IP" value={externalIP} mono />
          <Row label="Pod CIDR" value={node.spec.podCIDR ?? '—'} mono />
          <Row label="Created" value={formatAge(node.metadata.creationTimestamp) + ' ago'} />
        </dl>
      </div>

      {/* Capacity */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">Capacity</h4>
        <div className="space-y-3">
          <ResourceBar
            label="CPU"
            used={cpuAlloc}
            total={cpuCap}
            format={v => `${Math.round(v)}m`}
          />
          <ResourceBar
            label="Memory"
            used={memAllocMiB}
            total={memCapMiB}
            format={v => v >= 1024 ? `${(v / 1024).toFixed(1)}Gi` : `${Math.round(v)}Mi`}
          />
          {node.status.capacity?.pods && (
            <Row label="Max Pods" value={node.status.capacity.pods} />
          )}
        </div>
      </div>

      {/* System info */}
      {ni && (
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">System</h4>
          <dl className="space-y-1.5">
            <Row label="OS" value={ni.osImage} />
            <Row label="Kernel" value={ni.kernelVersion} mono />
            <Row label="Arch" value={ni.architecture} />
            <Row label="Runtime" value={ni.containerRuntimeVersion} mono />
            <Row label="Kubelet" value={ni.kubeletVersion} mono />
          </dl>
        </div>
      )}

      {/* Taints */}
      {node.spec.taints && node.spec.taints.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Taints</h4>
          <div className="space-y-1">
            {node.spec.taints.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs bg-orange-500/10 text-orange-300 border border-orange-500/20 px-2 py-0.5 rounded font-mono">
                  {t.key}{t.value ? `=${t.value}` : ''}:{t.effect}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conditions */}
      {node.status.conditions && (
        <div className="px-4 py-3">
          <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Conditions</h4>
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
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {yamlLoading ? 'Loading YAML…' : `YAML — ${node.metadata.name}`}
              </h3>
              <button onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }}
                className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-white">✕</button>
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
                <YAMLViewer content={yaml} />
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
      <dt className="text-xs text-slate-500 dark:text-slate-400 w-24 shrink-0">{label}</dt>
      <dd className={`text-xs text-slate-700 dark:text-slate-200 truncate ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function ResourceBar({ label, used, total, format }: {
  label: string; used: number; total: number; format: (v: number) => string
}) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400 dark:text-slate-500">{label}</span>
        <span className="text-xs text-slate-600 dark:text-slate-300">{format(used)} / {format(total)}</span>
      </div>
      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
