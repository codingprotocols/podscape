import React from 'react'
import type { KubeNode } from '../types'
import { formatAge, getNodeReady, parseMemoryMiB, parseCpuMillicores } from '../types'

interface Props { node: KubeNode }

export default function NodeDetail({ node }: Props): JSX.Element {
  const ready = getNodeReady(node)
  const internalIP = (node.status.addresses ?? []).find(a => a.type === 'InternalIP')?.address ?? '—'
  const externalIP = (node.status.addresses ?? []).find(a => a.type === 'ExternalIP')?.address ?? '—'
  const ni = node.status.nodeInfo

  const cpuCap = parseCpuMillicores(node.status.capacity?.cpu ?? '0')
  const cpuAlloc = parseCpuMillicores(node.status.allocatable?.cpu ?? '0')
  const memCapMiB = parseMemoryMiB(node.status.capacity?.memory ?? '0Ki')
  const memAllocMiB = parseMemoryMiB(node.status.allocatable?.memory ?? '0Ki')

  return (
    <div className="flex flex-col w-[440px] min-w-[340px] border-l border-white/10 bg-gray-900/70 h-full overflow-y-auto">
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white font-mono flex-1 truncate">{node.metadata.name}</h3>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${
            ready ? 'bg-green-500/20 text-green-300 ring-green-500/30' : 'bg-red-500/20 text-red-300 ring-red-500/30'
          }`}>
            {ready ? 'Ready' : 'NotReady'}
          </span>
        </div>
      </div>

      {/* Addresses */}
      <div className="px-4 py-3 border-b border-white/10">
        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Addresses</h4>
        <dl className="space-y-1.5">
          <Row label="Internal IP" value={internalIP} mono />
          <Row label="External IP" value={externalIP} mono />
          <Row label="Pod CIDR" value={node.spec.podCIDR ?? '—'} mono />
          <Row label="Created" value={formatAge(node.metadata.creationTimestamp) + ' ago'} />
        </dl>
      </div>

      {/* Capacity */}
      <div className="px-4 py-3 border-b border-white/10">
        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2.5">Capacity</h4>
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
        <div className="px-4 py-3 border-b border-white/10">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">System</h4>
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
        <div className="px-4 py-3 border-b border-white/10">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Taints</h4>
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
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Conditions</h4>
          <div className="space-y-1">
            {node.status.conditions.map(c => (
              <div key={c.type} className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  (c.type === 'Ready' && c.status === 'True') ||
                  (c.type !== 'Ready' && c.status === 'False')
                    ? 'bg-green-400' : 'bg-red-400'
                }`} />
                <span className="text-xs text-gray-300 font-medium">{c.type}</span>
                {c.reason && <span className="text-xs text-gray-500 truncate">— {c.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-xs text-gray-500 w-24 shrink-0">{label}</dt>
      <dd className={`text-xs text-gray-200 truncate ${mono ? 'font-mono' : ''}`}>{value}</dd>
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
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs text-gray-300">{format(used)} / {format(total)}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
