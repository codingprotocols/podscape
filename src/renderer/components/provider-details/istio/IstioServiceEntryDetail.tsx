import React, { useState } from 'react'
import * as yaml from 'js-yaml'

interface Props { item: any }

type Tab = 'ports' | 'endpoints' | 'yaml'

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

function locationBadgeClass(loc: string): string {
    switch ((loc ?? '').toUpperCase()) {
        case 'MESH_EXTERNAL': return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
        case 'MESH_INTERNAL': return 'bg-green-500/10 text-green-400 border-green-500/20'
        default:              return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
}

function resolutionBadgeClass(res: string): string {
    switch ((res ?? '').toUpperCase()) {
        case 'NONE':            return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
        case 'STATIC':          return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        case 'DNS':             return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
        case 'DNS_ROUND_ROBIN': return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
        default:                return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
}

export default function IstioServiceEntryDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('ports')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}
    const hosts: string[]     = spec.hosts ?? []
    const addresses: string[] = spec.addresses ?? []
    const ports: any[]        = spec.ports ?? []
    const location: string    = spec.location ?? ''
    const resolution: string  = spec.resolution ?? ''
    const endpoints: any[]    = spec.endpoints ?? []

    const rawYaml = yaml.dump(item, { indent: 2 })

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · SERVICE ENTRY
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {location && (
                            <span className={`text-[10px] font-black border px-2.5 py-0.5 rounded-lg uppercase tracking-tight ${locationBadgeClass(location)}`}>
                                {location.replace('MESH_', '')}
                            </span>
                        )}
                        {resolution && (
                            <span className={`text-[10px] font-black border px-2.5 py-0.5 rounded-lg uppercase tracking-tight ${resolutionBadgeClass(resolution)}`}>
                                {resolution}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Hosts row */}
            {hosts.length > 0 && (
                <div className="px-6 py-3 border-b border-slate-100 dark:border-white/5 shrink-0">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Hosts</span>
                    <div className="flex flex-wrap gap-1.5">
                        {hosts.map((h, i) => (
                            <span key={i} className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded">
                                {h}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Virtual IPs row */}
            {addresses.length > 0 && (
                <div className="px-6 py-3 border-b border-slate-100 dark:border-white/5 shrink-0">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Virtual IPs</span>
                    <div className="flex flex-wrap gap-1.5">
                        {addresses.map((a, i) => (
                            <span key={i} className="text-[10px] font-mono bg-slate-800 text-slate-300 border border-white/5 px-2 py-0.5 rounded">
                                {a}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
                <button
                    onClick={() => setTab('ports')}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                        tab === 'ports'
                            ? 'text-blue-400 border-b-2 border-blue-500'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                >
                    Ports ({ports.length})
                </button>
                <button
                    onClick={() => setTab('endpoints')}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                        tab === 'endpoints'
                            ? 'text-blue-400 border-b-2 border-blue-500'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                >
                    Endpoints ({endpoints.length})
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

            {/* Ports tab */}
            {tab === 'ports' && (
                <div className="flex-1 overflow-y-auto">
                    {ports.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No ports defined</p>
                    ) : (
                        <div className="rounded-xl overflow-hidden">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Port</th>
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Protocol</th>
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Name</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                    {ports.map((p: any, i: number) => {
                                        const proto = (p.protocol ?? '').toUpperCase()
                                        return (
                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                <td className="px-3 py-2.5 font-mono text-slate-300 font-semibold">{p.number ?? '—'}</td>
                                                <td className="px-3 py-2.5">
                                                    {proto ? (
                                                        <span className={`text-[10px] font-black border px-2 py-0.5 rounded uppercase tracking-wider ${protocolBadgeClass(proto)}`}>
                                                            {proto}
                                                        </span>
                                                    ) : <span className="text-slate-600">—</span>}
                                                </td>
                                                <td className="px-3 py-2.5 font-mono text-slate-400">{p.name ?? '—'}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Endpoints tab */}
            {tab === 'endpoints' && (
                <div className="flex-1 overflow-y-auto">
                    {endpoints.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8 italic">
                            No static endpoints (DNS resolution)
                        </p>
                    ) : (
                        <div className="rounded-xl overflow-hidden">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Address</th>
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Ports</th>
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Locality</th>
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Weight</th>
                                        <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Labels</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                    {endpoints.map((ep: any, i: number) => {
                                        const epPorts = ep.ports ?? {}
                                        const portsStr = Object.entries(epPorts).map(([k, v]) => `${k}:${v}`).join(', ')
                                        const epLabels = ep.labels ?? {}
                                        const labelsStr = Object.entries(epLabels).map(([k, v]) => `${k}=${v}`).join(', ')
                                        return (
                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                <td className="px-3 py-2.5 font-mono text-cyan-400">{ep.address ?? '—'}</td>
                                                <td className="px-3 py-2.5 font-mono text-slate-400">{portsStr || '—'}</td>
                                                <td className="px-3 py-2.5 text-slate-400">{ep.locality ?? '—'}</td>
                                                <td className="px-3 py-2.5 text-slate-400">{ep.weight ?? '—'}</td>
                                                <td className="px-3 py-2.5 text-slate-500 font-mono text-[10px]">{labelsStr || '—'}</td>
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
