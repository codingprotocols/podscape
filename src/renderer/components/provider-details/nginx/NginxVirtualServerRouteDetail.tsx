import React, { useState } from 'react'
import * as yaml from 'js-yaml'

interface Props { item: any }

type Tab = 'routes' | 'yaml'

function InfoRow({ label, value, mono }: { label: string; value?: string | number; mono?: boolean }) {
    if (value === undefined || value === null || value === '') return null
    return (
        <div className="flex items-start justify-between gap-4 py-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">{label}</span>
            <span className={`text-[11px] font-bold text-slate-300 text-right ${mono ? 'font-mono' : ''}`}>{String(value)}</span>
        </div>
    )
}

function upstreamSummary(upstream: any): string {
    if (!upstream) return '—'
    const svc = upstream.service ?? ''
    const port = upstream.port ?? ''
    return svc ? `${svc}:${port}` : '—'
}

export default function NginxVirtualServerRouteDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('routes')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}

    const host: string = spec.host ?? ''
    const upstreams: any[] = spec.upstreams ?? []
    const subroutes: any[] = spec.subroutes ?? []

    const rawYaml = yaml.dump(item, { indent: 2 })

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · VIRTUAL SERVER ROUTE
                        </p>
                        {host && (
                            <p className="text-xs font-mono text-cyan-400 mt-1">{host}</p>
                        )}
                    </div>
                    <span className="shrink-0 text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg uppercase tracking-tight">
                        NGINX
                    </span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
                {(['routes', 'yaml'] as Tab[]).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
                            tab === t
                                ? 'text-blue-400 border-b-2 border-blue-500'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                        }`}
                    >
                        {t === 'routes' ? 'Routes' : 'YAML'}
                    </button>
                ))}
            </div>

            {/* Routes tab */}
            {tab === 'routes' && (
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

                    {/* Upstreams */}
                    {upstreams.length > 0 && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">
                                Upstreams ({upstreams.length})
                            </span>
                            <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                                            <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Name</th>
                                            <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Service:Port</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                        {upstreams.map((up: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                <td className="px-3 py-2.5 font-mono text-cyan-400 font-semibold">{up.name ?? '—'}</td>
                                                <td className="px-3 py-2.5 font-mono text-slate-300">{upstreamSummary(up)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Subroutes */}
                    {subroutes.length > 0 && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">
                                Subroutes ({subroutes.length})
                            </span>
                            <div className="space-y-2">
                                {subroutes.map((route: any, i: number) => {
                                    const pass = route.action?.pass ?? route.action?.proxy?.upstream ?? null
                                    return (
                                        <div key={i} className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-xl px-4 py-3">
                                            <div className="font-mono text-slate-300 text-[11px] font-semibold mb-1">{route.path ?? '—'}</div>
                                            {pass && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">→</span>
                                                    <span className="font-mono text-cyan-400 text-[11px]">{pass}</span>
                                                </div>
                                            )}
                                            {route.policies && route.policies.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                    {route.policies.map((p: any, j: number) => (
                                                        <span key={j} className="text-[9px] font-black bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded uppercase">
                                                            {p.name ?? p}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {upstreams.length === 0 && subroutes.length === 0 && (
                        <p className="text-xs text-slate-500 text-center py-8 italic">No routes configured</p>
                    )}
                </div>
            )}

            {/* YAML tab */}
            {tab === 'yaml' && (
                <div className="flex-1 overflow-auto bg-slate-950">
                    <pre className="text-xs font-mono p-4 text-slate-300 leading-relaxed overflow-auto whitespace-pre">
                        {rawYaml}
                    </pre>
                </div>
            )}
        </div>
    )
}
