import React, { useState } from 'react'
import * as yaml from 'js-yaml'

interface Props { item: any }

type Tab = 'servers' | 'yaml'

function protocolBadgeClass(protocol: string): string {
    switch ((protocol ?? '').toUpperCase()) {
        case 'HTTP':   return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        case 'HTTPS':  return 'bg-green-500/10 text-green-400 border-green-500/20'
        case 'TCP':    return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
        case 'TLS':    return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
        case 'GRPC':   return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
        case 'HTTP2':  return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
        default:       return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
}

function tlsModeBadgeClass(mode: string): string {
    switch ((mode ?? '').toUpperCase()) {
        case 'PASSTHROUGH':      return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
        case 'SIMPLE':           return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
        case 'MUTUAL':           return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
        case 'AUTO_PASSTHROUGH': return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        case 'ISTIO_MUTUAL':     return 'bg-green-500/10 text-green-400 border-green-500/20'
        default:                 return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
}

export default function IstioGatewayDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('servers')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}
    const selector: Record<string, string> = spec.selector ?? {}
    const servers: any[] = spec.servers ?? []

    const rawYaml = yaml.dump(item, { indent: 2 })

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · GATEWAY
                        </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-lg uppercase tracking-tight">
                        Istio
                    </span>
                </div>
            </div>

            {/* Selector chips */}
            {Object.keys(selector).length > 0 && (
                <div className="px-6 py-3 border-b border-slate-100 dark:border-white/5 shrink-0">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Selector</span>
                    <div className="flex flex-wrap gap-1.5">
                        {Object.entries(selector).map(([k, v]) => (
                            <span key={k} className="text-[10px] font-mono bg-slate-800 text-slate-300 border border-white/5 px-2 py-0.5 rounded">
                                {k}={v}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
                <button
                    onClick={() => setTab('servers')}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                        tab === 'servers'
                            ? 'text-blue-400 border-b-2 border-blue-500'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                >
                    Servers ({servers.length})
                </button>
                <button
                    onClick={() => setTab('yaml')}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                        tab === 'yaml'
                            ? 'text-blue-400 border-b-2 border-blue-500'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                >
                    YAML
                </button>
            </div>

            {/* Servers tab */}
            {tab === 'servers' && (
                <div className="flex-1 overflow-y-auto">
                    {servers.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No servers defined</p>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-white/5">
                            {servers.map((srv: any, si: number) => {
                                const port     = srv.port ?? {}
                                const hosts: string[] = srv.hosts ?? []
                                const tls      = srv.tls ?? null
                                const protocol = (port.protocol ?? '').toUpperCase()

                                return (
                                    <div key={si} className="px-5 py-4 space-y-3">
                                        {/* Port badge row */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[11px] font-black font-mono text-slate-300">
                                                :{port.number ?? '?'}
                                            </span>
                                            {port.name && (
                                                <span className="text-[10px] text-slate-500 font-mono">{port.name}</span>
                                            )}
                                            {protocol && (
                                                <span className={`text-[10px] font-black border px-2 py-0.5 rounded uppercase tracking-wider ${protocolBadgeClass(protocol)}`}>
                                                    {protocol}
                                                </span>
                                            )}
                                        </div>

                                        {/* Hosts */}
                                        {hosts.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {hosts.map((h, hi) => (
                                                    <span key={hi} className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded">
                                                        {h}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* TLS */}
                                        {tls && (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">TLS:</span>
                                                <span className={`text-[10px] font-black border px-2 py-0.5 rounded uppercase tracking-wider ${tlsModeBadgeClass(tls.mode ?? '')}`}>
                                                    {tls.mode ?? 'UNSET'}
                                                </span>
                                                {tls.credentialName && (
                                                    <span className="text-[10px] font-mono text-slate-400">{tls.credentialName}</span>
                                                )}
                                                {tls.minProtocolVersion && (
                                                    <span className="text-[10px] font-mono text-slate-500">{tls.minProtocolVersion}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
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
