import React, { useState, useEffect } from 'react'
import type { KubeIngress, KubeEvent } from '../../../types'
import { formatAge } from '../../../types'
import { useAppStore } from '../../../store'
import YAMLViewer from '../../common/YAMLViewer'

interface Props { ingress: KubeIngress }

const NGINX_ANNOTATION_GROUPS: Record<string, string[]> = {
  'SSL / TLS': [
    'nginx.ingress.kubernetes.io/ssl-redirect',
    'nginx.ingress.kubernetes.io/force-ssl-redirect',
    'nginx.ingress.kubernetes.io/ssl-passthrough',
    'nginx.ingress.kubernetes.io/backend-protocol',
    'nginx.ingress.kubernetes.io/secure-backends',
  ],
  'Proxy': [
    'nginx.ingress.kubernetes.io/proxy-body-size',
    'nginx.ingress.kubernetes.io/proxy-connect-timeout',
    'nginx.ingress.kubernetes.io/proxy-read-timeout',
    'nginx.ingress.kubernetes.io/proxy-send-timeout',
    'nginx.ingress.kubernetes.io/proxy-buffer-size',
    'nginx.ingress.kubernetes.io/proxy-buffering',
    'nginx.ingress.kubernetes.io/proxy-next-upstream',
  ],
  'Rate Limiting': [
    'nginx.ingress.kubernetes.io/limit-rps',
    'nginx.ingress.kubernetes.io/limit-rpm',
    'nginx.ingress.kubernetes.io/limit-connections',
    'nginx.ingress.kubernetes.io/limit-burst-multiplier',
    'nginx.ingress.kubernetes.io/limit-whitelist',
  ],
  'Auth': [
    'nginx.ingress.kubernetes.io/auth-type',
    'nginx.ingress.kubernetes.io/auth-secret',
    'nginx.ingress.kubernetes.io/auth-realm',
    'nginx.ingress.kubernetes.io/auth-url',
    'nginx.ingress.kubernetes.io/auth-method',
    'nginx.ingress.kubernetes.io/auth-response-headers',
  ],
  'CORS': [
    'nginx.ingress.kubernetes.io/enable-cors',
    'nginx.ingress.kubernetes.io/cors-allow-origin',
    'nginx.ingress.kubernetes.io/cors-allow-methods',
    'nginx.ingress.kubernetes.io/cors-allow-headers',
    'nginx.ingress.kubernetes.io/cors-allow-credentials',
    'nginx.ingress.kubernetes.io/cors-max-age',
  ],
  'Rewrites': [
    'nginx.ingress.kubernetes.io/rewrite-target',
    'nginx.ingress.kubernetes.io/use-regex',
    'nginx.ingress.kubernetes.io/app-root',
    'nginx.ingress.kubernetes.io/permanent-redirect',
    'nginx.ingress.kubernetes.io/temporal-redirect',
  ],
  'Load Balancing': [
    'nginx.ingress.kubernetes.io/load-balance',
    'nginx.ingress.kubernetes.io/upstream-hash-by',
    'nginx.ingress.kubernetes.io/affinity',
    'nginx.ingress.kubernetes.io/session-cookie-name',
    'nginx.ingress.kubernetes.io/session-cookie-path',
  ],
  'Snippets': [
    'nginx.ingress.kubernetes.io/configuration-snippet',
    'nginx.ingress.kubernetes.io/server-snippet',
  ],
}

function NginxAnnotationsView({ annotations }: { annotations: Record<string, string> }) {
  const nginxAnnotations = Object.entries(annotations).filter(
    ([k]) => k.startsWith('nginx.ingress.kubernetes.io/') || k.startsWith('ingress.kubernetes.io/')
  )

  if (nginxAnnotations.length === 0) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">
        No nginx annotations on this Ingress
      </p>
    )
  }

  const shown = new Set<string>()
  const grouped: Array<{ group: string; entries: [string, string][] }> = []

  for (const [group, keys] of Object.entries(NGINX_ANNOTATION_GROUPS)) {
    const entries = keys
      .map(k => [k, annotations[k]] as [string, string])
      .filter(([, v]) => v !== undefined)
    if (entries.length > 0) {
      grouped.push({ group, entries })
      entries.forEach(([k]) => shown.add(k))
    }
  }

  const other = nginxAnnotations.filter(([k]) => !shown.has(k))
  if (other.length > 0) grouped.push({ group: 'Other', entries: other })

  return (
    <div className="space-y-5">
      {grouped.map(({ group, entries }) => (
        <div key={group}>
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">{group}</h4>
          <div className="rounded-xl border border-slate-100 dark:border-white/[0.06] overflow-hidden">
            {entries.map(([key, value], i) => {
              const shortKey = key
                .replace('nginx.ingress.kubernetes.io/', '')
                .replace('ingress.kubernetes.io/', '')
              const isLast = i === entries.length - 1
              return (
                <div
                  key={key}
                  className={`flex items-start gap-3 px-4 py-2.5 text-xs ${isLast ? '' : 'border-b border-slate-100 dark:border-white/[0.04]'}`}
                >
                  <span
                    className="w-48 shrink-0 text-slate-500 font-medium truncate"
                    title={key}
                  >
                    {shortKey}
                  </span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 break-all">{value}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

type Tab = 'rules' | 'events' | 'nginx'

export default function IngressDetail({ ingress: ing }: Props): JSX.Element {
  const { getYAML, applyYAML, selectedContext, selectedNamespace, providers } = useAppStore()
  const [tab, setTab] = useState<Tab>('rules')
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [events, setEvents] = useState<KubeEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  const ns = selectedNamespace === '_all'
    ? (ing.metadata.namespace ?? '')
    : (selectedNamespace ?? ing.metadata.namespace ?? '')

  // Gather LB addresses
  const lbAddresses = (ing.status.loadBalancer?.ingress ?? [])
    .map(a => a.hostname ?? a.ip ?? '')
    .filter(Boolean)

  const handleViewYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    try {
      const content = await getYAML('ingress', ing.metadata.name, false, ing.metadata.namespace)
      setYaml(content)
    } catch (err) {
      setYamlError((err as Error).message ?? 'Failed to fetch YAML')
    } finally {
      setYamlLoading(false)
    }
  }

  const handleApplyYAML = async (updated: string) => {
    await applyYAML(updated)
    const refreshed = await getYAML('ingress', ing.metadata.name, false, ing.metadata.namespace)
    setYaml(refreshed)
  }

  const loadEvents = async () => {
    const uid = ing.metadata.uid
    if (!selectedContext || !uid) return
    setEventsLoading(true)
    try {
      const evts = await window.kubectl.getResourceEvents(selectedContext, ns, uid)
      setEvents(evts)
    } catch {
      setEvents([])
    } finally {
      setEventsLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'events') loadEvents()
  }, [tab, ing.metadata.uid])

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-6 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{ing.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{ing.metadata.namespace} · INGRESS</p>
          </div>
          {ing.spec.ingressClassName && (
            <span className="shrink-0 text-[10px] font-black bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2.5 py-1 rounded-lg font-mono uppercase tracking-tight">
              {ing.spec.ingressClassName}
            </span>
          )}
        </div>

        {/* LB addresses */}
        {lbAddresses.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {lbAddresses.map(addr => (
              <span key={addr} className="text-xs bg-green-500/10 text-green-300 border border-green-500/20 px-2 py-0.5 rounded font-mono">
                {addr}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-3.5">
          <button onClick={handleViewYAML} disabled={yamlLoading}
            className="text-[11px] font-bold px-4 py-1.5 rounded-xl bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-white/5 hover:bg-white/10 transition-all disabled:opacity-50 uppercase tracking-wider">
            {yamlLoading ? 'Loading…' : 'YAML'}
          </button>
        </div>
        <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          Created {formatAge(ing.metadata.creationTimestamp)} ago
        </div>
      </div>

      {/* TLS section */}
      {ing.spec.tls && ing.spec.tls.length > 0 && (
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-yellow-500/5 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-yellow-500">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <span className="text-[10px] font-black text-yellow-500/60 uppercase tracking-[0.2em]">TLS SECURITY</span>
          </div>
          {ing.spec.tls.map((tls, i) => (
            <div key={i} className="text-[11px] space-y-1 px-1">
              {tls.hosts?.map(h => (
                <div key={h} className="flex items-center gap-2">
                  <span className="text-slate-400 dark:text-slate-400 font-bold font-mono">{h}</span>
                  {tls.secretName && <span className="text-slate-500 dark:text-slate-600 font-bold">→ {tls.secretName}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
        {(['rules', 'events'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${tab === t ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:text-slate-300'
              }`}>
            {t}
          </button>
        ))}
        {providers.nginxCommunity && (
          <button key="nginx" onClick={() => setTab('nginx')}
            className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${tab === 'nginx' ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:text-slate-300'
              }`}>
            NGINX Config
          </button>
        )}
      </div>

      {tab === 'rules' && (
        <div className="flex-1 overflow-y-auto">
          {(!ing.spec.rules || ing.spec.rules.length === 0) ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No rules defined</p>
          ) : (
            <div className="divide-y divide-white/5">
              {ing.spec.rules.map((rule, ri) => (
                <div key={ri} className="px-4 py-3">
                  {/* Host header */}
                  <div className="flex items-center gap-2 mb-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-400 shrink-0">
                      <circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                    </svg>
                    <span className="text-xs font-semibold text-blue-300 font-mono">{rule.host ?? '*'}</span>
                  </div>

                  {/* Paths table */}
                  {rule.http?.paths && rule.http.paths.length > 0 && (
                    <div className="rounded overflow-hidden border border-slate-100 dark:border-slate-800">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-white/5 border-b border-slate-100 dark:border-slate-800">
                            <th className="px-3 py-1.5 text-left text-slate-500 dark:text-slate-400 font-medium w-16">Type</th>
                            <th className="px-3 py-1.5 text-left text-slate-500 dark:text-slate-400 font-medium">Path</th>
                            <th className="px-3 py-1.5 text-left text-slate-500 dark:text-slate-400 font-medium">Backend</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {rule.http.paths.map((p, pi) => (
                            <tr key={pi} className="hover:bg-white/5 transition-colors">
                              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{p.pathType ?? 'Prefix'}</td>
                              <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">{p.path ?? '/'}</td>
                              <td className="px-3 py-2">
                                {p.backend.service ? (
                                  <span className="text-cyan-400 font-mono">
                                    {p.backend.service.name}:{p.backend.service.port.number ?? p.backend.service.port.name}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 dark:text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'events' && (
        <div className="px-4 py-3 flex-1">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Events</h4>
            <button onClick={loadEvents} disabled={eventsLoading}
              className="text-xs px-2 py-1 rounded bg-white/5 text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-800 hover:bg-white/10 disabled:opacity-50">
              {eventsLoading ? '…' : 'Refresh'}
            </button>
          </div>
          {eventsLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="w-5 h-5 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No events found</p>
          ) : (
            <div className="space-y-2">
              {events.map((e, i) => (
                <div key={e.metadata.uid || i} className={`rounded p-2 text-xs ${e.type === 'Warning' ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-white/5 border border-slate-100 dark:border-slate-800'
                  }`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`font-medium ${e.type === 'Warning' ? 'text-yellow-300' : 'text-slate-600 dark:text-slate-300'}`}>{e.reason}</span>
                    <span className="text-slate-500 dark:text-slate-400 text-[10px]">{e.count ? `×${e.count}` : ''}</span>
                  </div>
                  <p className="text-slate-400 dark:text-slate-500 leading-relaxed">{e.message}</p>
                  {e.lastTimestamp && <p className="text-slate-500 dark:text-slate-400 mt-1">{formatAge(e.lastTimestamp)} ago</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'nginx' && (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <NginxAnnotationsView annotations={ing.metadata.annotations ?? {}} />
        </div>
      )}

      {(yamlLoading || yaml !== null || yamlError !== null) && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">{yamlLoading ? 'Loading YAML…' : `YAML — ${ing.metadata.name}`}</h3>
              <button onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 transition-colors">✕</button>
            </div>
            <div className="flex-1 min-h-0">
              {yamlError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                  <p className="text-sm font-bold text-red-400">Failed to load YAML</p>
                  <pre className="text-xs text-slate-400 dark:text-slate-500 whitespace-pre-wrap">{yamlError}</pre>
                </div>
              ) : yamlLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : yaml !== null ? <YAMLViewer content={yaml} editable onSave={handleApplyYAML} /> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
