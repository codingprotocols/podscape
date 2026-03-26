import React, { useState } from 'react'
import * as yaml from 'js-yaml'

interface Props { item: any }

type Tab = 'http' | 'tcptls' | 'yaml'

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    if (!value) return null
    return (
        <div className="flex items-start justify-between gap-4 py-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">{label}</span>
            <span className={`text-[11px] font-bold text-slate-300 text-right break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
        </div>
    )
}

function uriMatchSummary(uri: any): string {
    if (!uri) return ''
    if (uri.exact !== undefined)  return `exact: ${uri.exact}`
    if (uri.prefix !== undefined) return `prefix: ${uri.prefix}`
    if (uri.regex !== undefined)  return `regex: ${uri.regex}`
    return JSON.stringify(uri)
}

export default function IstioVirtualServiceDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('http')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}
    const hosts: string[]    = spec.hosts ?? []
    const gateways: string[] = spec.gateways ?? []
    const httpRoutes: any[]  = spec.http ?? []
    const tcpRoutes: any[]   = spec.tcp ?? []
    const tlsRoutes: any[]   = spec.tls ?? []

    const rawYaml = yaml.dump(item, { indent: 2 })

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · VIRTUAL SERVICE
                        </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-lg uppercase tracking-tight">
                        Istio
                    </span>
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

            {/* Gateways row */}
            {gateways.length > 0 && (
                <div className="px-6 py-3 border-b border-slate-100 dark:border-white/5 shrink-0">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Gateways</span>
                    <div className="flex flex-wrap gap-1.5">
                        {gateways.map((g, i) => (
                            <span key={i} className="text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded">
                                {g}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
                <button
                    onClick={() => setTab('http')}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                        tab === 'http'
                            ? 'text-blue-400 border-b-2 border-blue-500'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                >
                    HTTP Routes ({httpRoutes.length})
                </button>
                <button
                    onClick={() => setTab('tcptls')}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                        tab === 'tcptls'
                            ? 'text-blue-400 border-b-2 border-blue-500'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                >
                    TCP/TLS ({tcpRoutes.length + tlsRoutes.length})
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

            {/* HTTP Routes tab */}
            {tab === 'http' && (
                <div className="flex-1 overflow-y-auto">
                    {httpRoutes.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No HTTP routes defined</p>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-white/5">
                            {httpRoutes.map((route: any, ri: number) => {
                                const routeName: string = route?.name ?? `Route ${ri + 1}`
                                const matches: any[]   = route?.match ?? []
                                const destinations: any[] = route?.route ?? []
                                const fault    = route?.fault ?? null
                                const retries  = route?.retries ?? null
                                const timeout: string | undefined = route?.timeout
                                const mirror   = route?.mirror ?? null
                                const mirrorPct = route?.mirrorPercentage?.value

                                const totalWeight = destinations.reduce(
                                    (acc: number, d: any) => acc + (d.weight ?? 1),
                                    0
                                )
                                const hasWeights = destinations.length > 1

                                return (
                                    <div key={ri} className="px-5 py-4 space-y-3">
                                        {/* Route title row */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] font-black text-slate-300 font-mono">{routeName}</span>
                                        </div>

                                        {/* Match conditions */}
                                        {matches.length > 0 && (
                                            <div>
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">Match</span>
                                                <div className="space-y-1">
                                                    {matches.map((m: any, mi: number) => {
                                                        const uriStr    = uriMatchSummary(m.uri)
                                                        const methodStr = m.method?.exact ? `method: ${m.method.exact}` : ''
                                                        const hdrCount  = m.headers ? Object.keys(m.headers).length : 0
                                                        const parts     = [uriStr, methodStr, hdrCount > 0 ? `${hdrCount} header(s)` : ''].filter(Boolean)
                                                        return (
                                                            <div key={mi} className="flex flex-wrap gap-1">
                                                                {parts.map((p, pi) => (
                                                                    <span key={pi} className="text-[10px] font-mono bg-slate-800 text-slate-300 border border-white/5 px-2 py-0.5 rounded">
                                                                        {p}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Destinations table */}
                                        {destinations.length > 0 && (
                                            <div>
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">Destinations</span>
                                                <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-white/5">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                                                                <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Host</th>
                                                                {hasWeights && <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Weight</th>}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                                            {destinations.map((d: any, di: number) => {
                                                                const dest    = d.destination ?? {}
                                                                const host    = dest.host ?? '—'
                                                                const subset  = dest.subset ? `/${dest.subset}` : ''
                                                                const port    = dest.port?.number ? `:${dest.port.number}` : ''
                                                                const label   = `${host}${subset}${port}`
                                                                const weight  = d.weight ?? 1
                                                                const pct     = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0
                                                                return (
                                                                    <tr key={di} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                                        <td className="px-3 py-2 font-mono text-cyan-400 font-semibold">{label}</td>
                                                                        {hasWeights && (
                                                                            <td className="px-3 py-2">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="w-16 h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                                                                                        <div
                                                                                            className="h-full bg-blue-500 rounded-full"
                                                                                            style={{ width: `${pct}%` }}
                                                                                        />
                                                                                    </div>
                                                                                    <span className="text-[10px] text-slate-400">{weight}</span>
                                                                                </div>
                                                                            </td>
                                                                        )}
                                                                    </tr>
                                                                )
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* Fault injection */}
                                        {fault && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {fault.delay && (
                                                    <span className="text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded">
                                                        Delay {fault.delay.fixedDelay} @ {fault.delay.percentage?.value ?? '?'}%
                                                    </span>
                                                )}
                                                {fault.abort && (
                                                    <span className="text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded">
                                                        Abort HTTP {fault.abort.httpStatus} @ {fault.abort.percentage?.value ?? '?'}%
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Retries / Timeout / Mirror */}
                                        {(retries || timeout || mirror) && (
                                            <div className="space-y-1 border-t border-slate-100 dark:border-white/5 pt-2">
                                                {retries && (
                                                    <InfoRow
                                                        label="Retries"
                                                        value={`${retries.attempts} attempts${retries.perTryTimeout ? ` / ${retries.perTryTimeout}` : ''}${retries.retryOn ? ` on: ${retries.retryOn}` : ''}`}
                                                    />
                                                )}
                                                {timeout && <InfoRow label="Timeout" value={timeout} />}
                                                {mirror && (
                                                    <InfoRow
                                                        label="Mirror"
                                                        value={`${mirror.host}${mirror.subset ? `/${mirror.subset}` : ''}${mirrorPct !== undefined ? ` @ ${mirrorPct}%` : ''}`}
                                                        mono
                                                    />
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

            {/* TCP/TLS tab */}
            {tab === 'tcptls' && (
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {tcpRoutes.length === 0 && tlsRoutes.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No TCP/TLS routes</p>
                    ) : (
                        <div className="space-y-4">
                            {tcpRoutes.length > 0 && (
                                <div>
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">TCP</span>
                                    <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-white/5">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                                                    <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Host</th>
                                                    <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Port</th>
                                                    <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Weight</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                                {tcpRoutes.map((r: any, ri: number) =>
                                                    (r.route ?? []).map((d: any, di: number) => (
                                                        <tr key={`${ri}-${di}`} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                            <td className="px-3 py-2 font-mono text-cyan-400">{d.destination?.host ?? '—'}</td>
                                                            <td className="px-3 py-2 font-mono text-slate-400">{d.destination?.port?.number ?? '—'}</td>
                                                            <td className="px-3 py-2 text-slate-400">{d.weight ?? '—'}</td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                            {tlsRoutes.length > 0 && (
                                <div>
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">TLS</span>
                                    <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-white/5">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                                                    <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Host</th>
                                                    <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Port</th>
                                                    <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Weight</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                                {tlsRoutes.map((r: any, ri: number) =>
                                                    (r.route ?? []).map((d: any, di: number) => (
                                                        <tr key={`${ri}-${di}`} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                            <td className="px-3 py-2 font-mono text-cyan-400">{d.destination?.host ?? '—'}</td>
                                                            <td className="px-3 py-2 font-mono text-slate-400">{d.destination?.port?.number ?? '—'}</td>
                                                            <td className="px-3 py-2 text-slate-400">{d.weight ?? '—'}</td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
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
