import React, { useState, useEffect } from 'react'
import type { KubeIngress, KubeEvent } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import YAMLViewer from './YAMLViewer'

interface Props { ingress: KubeIngress }

type Tab = 'rules' | 'events'

export default function IngressDetail({ ingress: ing }: Props): JSX.Element {
  const { getYAML, selectedContext, selectedNamespace } = useAppStore()
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

  const loadEvents = async () => {
    if (!selectedContext) return
    setEventsLoading(true)
    try {
      const evts = await window.kubectl.getResourceEvents(selectedContext, ns, 'Ingress', ing.metadata.name)
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
    <div className="flex flex-col w-[480px] min-w-[380px] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono truncate">{ing.metadata.name}</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{ing.metadata.namespace}</p>
          </div>
          {ing.spec.ingressClassName && (
            <span className="shrink-0 text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded font-mono">
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

        <div className="flex gap-2 mt-2.5">
          <button onClick={handleViewYAML} disabled={yamlLoading}
            className="text-xs px-3 py-1 rounded bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800 hover:bg-white/10 transition-colors disabled:opacity-50">
            {yamlLoading ? 'Loading…' : 'YAML'}
          </button>
        </div>
        <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          Created {formatAge(ing.metadata.creationTimestamp)} ago
        </div>
      </div>

      {/* TLS section */}
      {ing.spec.tls && ing.spec.tls.length > 0 && (
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-yellow-500/5 shrink-0">
          <div className="flex items-center gap-2 mb-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-400">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            <span className="text-xs font-medium text-yellow-400 uppercase tracking-wider">TLS</span>
          </div>
          {ing.spec.tls.map((tls, i) => (
            <div key={i} className="text-xs space-y-0.5">
              {tls.hosts?.map(h => (
                <div key={h} className="flex items-center gap-2">
                  <span className="text-slate-400 dark:text-slate-500 font-mono">{h}</span>
                  {tls.secretName && <span className="text-slate-500 dark:text-slate-400">→ {tls.secretName}</span>}
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
            className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:text-slate-300'
            }`}>
            {t}
          </button>
        ))}
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
                <div key={e.metadata.uid || i} className={`rounded p-2 text-xs ${
                  e.type === 'Warning' ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-white/5 border border-slate-100 dark:border-slate-800'
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

      {/* YAML viewer */}
      {(yamlLoading || yaml !== null || yamlError !== null) && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{yamlLoading ? 'Loading YAML…' : `YAML — ${ing.metadata.name}`}</h3>
              <button onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }} className="text-slate-400 dark:text-slate-500 hover:text-white">✕</button>
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
              ) : yaml !== null ? <YAMLViewer content={yaml} /> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
