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
    <div className="flex flex-col w-full h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{svc.metadata.name}</h3>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{svc.metadata.namespace} · SERVICE</p>
        <div className="flex gap-2 mt-3.5">
          <button onClick={handleViewYAML} disabled={yamlLoading}
            className="text-[11px] font-bold px-4 py-1.5 rounded-xl bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-white/5 hover:bg-white/10 transition-all disabled:opacity-50 uppercase tracking-wider">
            {yamlLoading ? 'Loading…' : 'YAML'}
          </button>
        </div>
      </div>

      <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5">
        <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">Spec</h4>
        <dl className="space-y-1.5 px-1">
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

      {(yamlLoading || yaml !== null || yamlError !== null) && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">
                {yamlLoading ? 'Loading YAML…' : `YAML — ${svc.metadata.name}`}
              </h3>
              <button onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 transition-colors">✕</button>
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
