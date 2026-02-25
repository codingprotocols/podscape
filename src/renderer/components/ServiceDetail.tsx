import React from 'react'
import type { KubeService } from '../types'
import { formatAge } from '../types'

interface Props { service: KubeService }

export default function ServiceDetail({ service: svc }: Props): JSX.Element {
  const lbIps = svc.status.loadBalancer?.ingress ?? []

  return (
    <div className="flex flex-col w-[440px] min-w-[340px] border-l border-white/10 bg-gray-900/70 h-full overflow-y-auto">
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <h3 className="text-sm font-semibold text-white font-mono truncate">{svc.metadata.name}</h3>
        <p className="text-xs text-gray-400 mt-0.5">{svc.metadata.namespace}</p>
      </div>

      <div className="px-4 py-3 border-b border-white/10">
        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Spec</h4>
        <dl className="space-y-1.5">
          <Row label="Type" value={svc.spec.type ?? 'ClusterIP'} />
          <Row label="Cluster IP" value={svc.spec.clusterIP ?? '—'} mono />
          {svc.spec.externalIPs?.length && <Row label="External IPs" value={svc.spec.externalIPs.join(', ')} mono />}
          {lbIps.length > 0 && (
            <Row label="Load Balancer" value={lbIps.map(i => i.ip ?? i.hostname ?? '?').join(', ')} mono />
          )}
          <Row label="Session Affinity" value={svc.spec.sessionAffinity ?? 'None'} />
          <Row label="Created" value={formatAge(svc.metadata.creationTimestamp) + ' ago'} />
        </dl>
      </div>

      {svc.spec.ports && svc.spec.ports.length > 0 && (
        <div className="px-4 py-3 border-b border-white/10">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Ports</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500">
                <th className="text-left pb-1">Name</th>
                <th className="text-left pb-1">Port</th>
                <th className="text-left pb-1">Target</th>
                <th className="text-left pb-1">Protocol</th>
                {svc.spec.type === 'NodePort' && <th className="text-left pb-1">NodePort</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {svc.spec.ports.map((p, i) => (
                <tr key={i}>
                  <td className="py-1 text-gray-300">{p.name ?? '—'}</td>
                  <td className="py-1 font-mono text-white">{p.port}</td>
                  <td className="py-1 font-mono text-gray-300">{String(p.targetPort ?? '—')}</td>
                  <td className="py-1 text-gray-400">{p.protocol ?? 'TCP'}</td>
                  {svc.spec.type === 'NodePort' && <td className="py-1 font-mono text-yellow-400">{p.nodePort ?? '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {svc.spec.selector && Object.keys(svc.spec.selector).length > 0 && (
        <div className="px-4 py-3">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Selector</h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(svc.spec.selector).map(([k, v]) => (
              <span key={k} className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded font-mono">
                {k}={v}
              </span>
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
      <dt className="text-xs text-gray-500 w-28 shrink-0">{label}</dt>
      <dd className={`text-xs text-gray-200 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
