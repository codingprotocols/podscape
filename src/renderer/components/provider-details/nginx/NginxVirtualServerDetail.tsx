import React, { useState } from 'react'
import * as yaml from 'js-yaml'
import { Shield, Lock } from 'lucide-react'

interface Props { item: any }

type Tab = 'upstreams' | 'routes' | 'yaml'

const LB_METHOD_LABELS: Record<string, string> = {
    round_robin: 'Round Robin',
    least_conn:  'Least Conn',
    ip_hash:     'IP Hash',
    hash:        'Hash',
    random:      'Random',
}

export default function NginxVirtualServerDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('upstreams')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}
    const host: string = spec.host ?? ''
    const tls       = spec.tls ?? null
    const upstreams: any[] = spec.upstreams ?? []
    const routes: any[]    = spec.routes ?? []

    const rawYaml = yaml.dump(item, { indent: 2 })

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · VIRTUAL SERVER
                        </p>
                    </div>
                    {host && (
                        <span className="shrink-0 text-[10px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-lg font-mono">
                            {host}
                        </span>
                    )}
                </div>
            </div>

            {/* TLS card */}
            {tls && (
                <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-yellow-500/5 shrink-0">
                    <div className="flex items-center gap-2 mb-2">
                        <Shield size={12} className="text-yellow-500" />
                        <span className="text-[10px] font-black text-yellow-500/70 uppercase tracking-[0.2em]">TLS</span>
                    </div>
                    <div className="space-y-1.5 pl-1">
                        {tls.secret && (
                            <div className="flex items-center gap-2 text-[11px]">
                                <span className="text-slate-500 dark:text-slate-600 uppercase tracking-wider text-[9px] font-bold w-20 shrink-0">Secret</span>
                                <span className="font-mono text-yellow-300">{tls.secret}</span>
                            </div>
                        )}
                        {tls.redirect !== undefined && (
                            <div className="flex items-center gap-2 text-[11px]">
                                <span className="text-slate-500 dark:text-slate-600 uppercase tracking-wider text-[9px] font-bold w-20 shrink-0">Redirect</span>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${
                                    tls.redirect?.enable
                                        ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                        : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                }`}>
                                    {tls.redirect?.enable ? `Enabled${tls.redirect.code ? ` (${tls.redirect.code})` : ''}` : 'Disabled'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
                <button
                    onClick={() => setTab('upstreams')}
                    className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
                        tab === 'upstreams'
                            ? 'text-blue-400 border-b-2 border-blue-500'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                >
                    Upstreams ({upstreams.length})
                </button>
                <button
                    onClick={() => setTab('routes')}
                    className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
                        tab === 'routes'
                            ? 'text-blue-400 border-b-2 border-blue-500'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                >
                    Routes ({routes.length})
                </button>
                <button
                    onClick={() => setTab('yaml')}
                    className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
                        tab === 'yaml'
                            ? 'text-blue-400 border-b-2 border-blue-500'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                >
                    YAML
                </button>
            </div>

            {/* Upstreams tab */}
            {tab === 'upstreams' && (
                <div className="flex-1 overflow-y-auto">
                    {upstreams.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No upstreams defined</p>
                    ) : (
                        <div className="rounded-xl overflow-hidden">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Name</th>
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Service:Port</th>
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">LB Method</th>
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Health</th>
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">TLS</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                    {upstreams.map((up: any, i: number) => {
                                        const lbMethod = up['lb-method'] ?? ''
                                        const lbLabel = LB_METHOD_LABELS[lbMethod] ?? 'Round Robin'
                                        const healthEnabled = up.healthCheck?.enable === true
                                        const tlsEnabled = up.tls?.enable === true
                                        const cookieEnabled = up.sessionCookie?.enable === true
                                        return (
                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                <td className="px-3 py-2.5">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="font-mono text-cyan-400 font-semibold">{up.name ?? '—'}</span>
                                                        {cookieEnabled && (
                                                            <span className="text-[9px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded w-fit">
                                                                cookie: {up.sessionCookie?.name ?? 'session'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 font-mono text-slate-300">
                                                    {up.service ?? '—'}:{up.port ?? '—'}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-400">{lbLabel}</td>
                                                <td className="px-3 py-2.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className={`w-2 h-2 rounded-full ${healthEnabled ? 'bg-green-400' : 'bg-slate-600'}`} />
                                                        {healthEnabled && up.healthCheck?.path && (
                                                            <span className="text-[10px] font-mono text-slate-500 truncate max-w-[60px]" title={up.healthCheck.path}>
                                                                {up.healthCheck.path}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    {tlsEnabled ? (
                                                        <Lock size={11} className="text-yellow-400" />
                                                    ) : (
                                                        <span className="text-slate-600">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Routes tab */}
            {tab === 'routes' && (
                <div className="flex-1 overflow-y-auto">
                    {routes.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No routes defined</p>
                    ) : (
                        <div className="rounded-xl overflow-hidden">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Path</th>
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Action</th>
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Policies</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                    {routes.map((route: any, i: number) => {
                                        const policies: any[] = route.policies ?? []

                                        let actionCell: React.ReactNode
                                        if (route.action?.pass) {
                                            actionCell = (
                                                <span className="font-mono text-cyan-400">
                                                    → {route.action.pass}
                                                </span>
                                            )
                                        } else if (route.splits && route.splits.length > 0) {
                                            const parts = (route.splits as any[]).map((s: any) => `${s.weight ?? '?'}% ${s.action?.pass ?? '?'}`)
                                            actionCell = (
                                                <div className="flex flex-wrap gap-1">
                                                    {parts.map((p, pi) => (
                                                        <span key={pi} className="text-[9px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
                                                            {p}
                                                        </span>
                                                    ))}
                                                </div>
                                            )
                                        } else if (route.matches && route.matches.length > 0) {
                                            actionCell = (
                                                <span className="text-slate-400">{route.matches.length} match rule{route.matches.length !== 1 ? 's' : ''}</span>
                                            )
                                        } else {
                                            actionCell = <span className="text-slate-600">—</span>
                                        }

                                        return (
                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                <td className="px-3 py-2.5 font-mono text-slate-300">{route.path ?? '—'}</td>
                                                <td className="px-3 py-2.5">{actionCell}</td>
                                                <td className="px-3 py-2.5">
                                                    {policies.length === 0 ? (
                                                        <span className="text-slate-600">—</span>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-1">
                                                            {policies.map((p: any, pi: number) => (
                                                                <span key={pi} className="text-[9px] font-bold bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded">
                                                                    {p.name ?? String(p)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
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
