import React, { useState } from 'react'
import type { KubeService } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import { FileCode, X, Activity, Info, Link as LinkIcon, Share2, Copy, Check } from 'lucide-react'
import YAMLViewer from './YAMLViewer'

interface Props { service: KubeService }

export default function ServiceDetail({ service: svc }: Props): JSX.Element {
  const { getYAML, applyYAML, refresh } = useAppStore()
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const lbIps = svc.status.loadBalancer?.ingress ?? []

  const ns = svc.metadata.namespace ?? 'default'
  const dnsBase = `${svc.metadata.name}.${ns}.svc.cluster.local`

  const inClusterUrls = (svc.spec.ports ?? []).map(p => {
    const scheme = p.name?.includes('https') || p.port === 443 ? 'https' : 'http'
    return { label: p.name || String(p.port), url: `${scheme}://${dnsBase}:${p.port}` }
  })

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(null), 2000)
  }

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

  const handleApplyYAML = async (newYaml: string) => {
    try {
      await applyYAML(newYaml)
      refresh()
      setYaml(null)
    } catch (err) {
      throw err
    }
  }

  return (
    <div className="flex flex-col w-full h-full relative font-sans">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{svc.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{svc.metadata.namespace} · SERVICE</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleViewYAML}
              disabled={yamlLoading}
              className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2 group disabled:opacity-50"
            >
              <FileCode size={14} className="group-hover:text-blue-400 transition-colors" />
              {yamlLoading ? 'Loading...' : 'YAML'}
            </button>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 bg-blue-500/10 text-blue-500 outline-blue-500/20">
              {svc.spec.type?.toUpperCase() || 'CLUSTERIP'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <div className="space-y-8">
          {/* Spec Info */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Info size={12} /> Service Specification
            </h4>
            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4 space-y-3">
              <InfoRow label="Type" value={svc.spec.type ?? 'ClusterIP'} />
              <InfoRow label="Cluster IP" value={svc.spec.clusterIP ?? '—'} mono />
              {svc.spec.externalIPs?.length && <InfoRow label="External IPs" value={svc.spec.externalIPs.join(', ')} mono />}
              {lbIps.length > 0 && (
                <InfoRow label="Load Balancer" value={lbIps.map(i => i.ip ?? i.hostname ?? '?').join(', ')} mono />
              )}
              <InfoRow label="Session Affinity" value={svc.spec.sessionAffinity ?? 'None'} />
              <InfoRow label="Created" value={formatAge(svc.metadata.creationTimestamp) + ' ago'} />
            </div>
          </section>

          {/* In-Cluster URLs */}
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
              <LinkIcon size={12} /> In-Cluster Access
            </h4>
            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4 space-y-3">
              {/* DNS hostname */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">DNS</span>
                <span className="flex-1 text-[11px] font-bold font-mono text-slate-300 truncate text-right">{dnsBase}</span>
                <button onClick={() => handleCopy(dnsBase)} className="shrink-0 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors" title="Copy">
                  {copiedUrl === dnsBase ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </div>
              {/* Per-port URLs */}
              {inClusterUrls.map(({ label, url }) => (
                <div key={url} className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0 w-10 truncate">{label}</span>
                  <span className="flex-1 text-[11px] font-bold font-mono text-emerald-400 truncate">{url}</span>
                  <button onClick={() => handleCopy(url)} className="shrink-0 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors" title="Copy">
                    {copiedUrl === url ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              ))}
              {/* Short form hint */}
              <p className="text-[9px] text-slate-500 pt-1 border-t border-white/5">
                Short: <span className="font-mono text-slate-400">{svc.metadata.name}.{ns}</span>
                {inClusterUrls[0] && <span className="ml-1 font-mono text-slate-500">:{(svc.spec.ports ?? [])[0]?.port}</span>}
              </p>
            </div>
          </section>

          {/* Ports */}
          {svc.spec.ports && svc.spec.ports.length > 0 && (
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Share2 size={12} /> Resource Mapping
              </h4>
              <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                      <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Name</th>
                      <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Internal</th>
                      <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Target</th>
                      <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Protocol</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {svc.spec.ports.map((p, i) => (
                      <tr key={i} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-[11px] font-bold text-slate-300 font-mono">{p.name || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] font-black text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20">{p.port}</span>
                        </td>
                        <td className="px-4 py-3 text-[11px] font-bold text-slate-400 font-mono italic">{p.targetPort || '-'}</td>
                        <td className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">{p.protocol || 'TCP'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Selector */}
          {svc.spec.selector && (
            <section>
              <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                <LinkIcon size={12} /> Target Selectors
              </h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(svc.spec.selector).map(([k, v]) => (
                  <span key={k} className="px-3 py-1.5 bg-blue-500/5 border border-blue-500/10 rounded-xl text-[10px] font-bold font-mono text-blue-400/80">
                    {k}={v}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Premium YAML Modal */}
      {(yamlLoading || yaml !== null || yamlError !== null) && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                  {yamlLoading
                    ? <div className="w-4 h-4 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin" />
                    : <FileCode size={18} className="text-blue-500" />
                  }
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${svc.metadata.name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors focus:outline-none"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 min-h-0 bg-slate-950">
              {yamlError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                    <Activity size={20} className="text-red-400" />
                  </div>
                  <p className="text-sm font-bold text-red-400 uppercase tracking-widest">Failed to load manifest</p>
                  <pre className="text-xs text-slate-400 max-w-lg break-words whitespace-pre-wrap font-mono bg-white/5 p-4 rounded-xl border border-white/5">{yamlError}</pre>
                </div>
              ) : yamlLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : yaml !== null ? (
                <YAMLViewer editable
                  content={yaml}
                  onSave={handleApplyYAML}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string, value: string, mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</span>
      <span className={`text-[11px] font-bold text-slate-300 ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}
