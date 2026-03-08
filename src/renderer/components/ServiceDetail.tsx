import React, { useState } from 'react'
import type { KubeService } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import YAMLViewer from './YAMLViewer'

interface Props { service: KubeService }

export default function ServiceDetail({ service: svc }: Props): JSX.Element {
  const { getYAML } = useAppStore()
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const lbIps = svc.status.loadBalancer?.ingress ?? []

  const handleViewYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    try {
      const content = await getYAML('service', svc.metadata.name, false, svc.metadata.namespace)
      setYaml(content)
    } catch (err) {
      setYamlError((err as Error).message ?? 'Failed to fetch YAML')
    } finally {
      setYamlLoading(false)
    }
  }

  return (
    <div className="flex flex-col w-[440px] min-w-[340px] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 h-full overflow-y-auto">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono truncate">{svc.metadata.name}</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{svc.metadata.namespace}</p>
        <div className="flex gap-2 mt-2.5">
          <button onClick={handleViewYAML} disabled={yamlLoading}
            className="text-xs px-3 py-1 rounded bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800 hover:bg-white/10 transition-colors disabled:opacity-50">
            {yamlLoading ? 'Loading…' : 'YAML'}
          </button>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Spec</h4>
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
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Ports</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400">
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
                  <td className="py-1 text-slate-600 dark:text-slate-300">{p.name ?? '—'}</td>
                  <td className="py-1 font-mono text-slate-900 dark:text-white">{p.port}</td>
                  <td className="py-1 font-mono text-slate-600 dark:text-slate-300">{String(p.targetPort ?? '—')}</td>
                  <td className="py-1 text-slate-400 dark:text-slate-500">{p.protocol ?? 'TCP'}</td>
                  {svc.spec.type === 'NodePort' && <td className="py-1 font-mono text-yellow-400">{p.nodePort ?? '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {svc.spec.selector && Object.keys(svc.spec.selector).length > 0 && (
        <div className="px-4 py-3">
          <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Selector</h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(svc.spec.selector).map(([k, v]) => (
              <span key={k} className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded font-mono">
                {k}={v}
              </span>
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
                {yamlLoading ? 'Loading YAML…' : `YAML — ${svc.metadata.name}`}
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
      <dt className="text-xs text-slate-500 dark:text-slate-400 w-28 shrink-0">{label}</dt>
      <dd className={`text-xs text-slate-700 dark:text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
