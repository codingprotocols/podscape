import React, { useState } from 'react'
import * as yaml from 'js-yaml'

interface Props { item: any }

type Tab = 'trafficpolicy' | 'subsets' | 'yaml'

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    if (!value) return null
    return (
        <div className="flex items-start justify-between gap-4 py-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">{label}</span>
            <span className={`text-[11px] font-bold text-slate-300 text-right break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
        </div>
    )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-3">{title}</span>
            {children}
        </div>
    )
}

function lbBadgeClass(mode: string): string {
    switch (mode) {
        case 'ROUND_ROBIN':  return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        case 'LEAST_CONN':   return 'bg-green-500/10 text-green-400 border-green-500/20'
        case 'RANDOM':       return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
        case 'PASSTHROUGH':  return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
        default:             return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
}

function tlsModeBadgeClass(mode: string): string {
    switch (mode) {
        case 'DISABLE':      return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
        case 'SIMPLE':       return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
        case 'MUTUAL':       return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
        case 'ISTIO_MUTUAL': return 'bg-green-500/10 text-green-400 border-green-500/20'
        default:             return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
}

function TrafficPolicyView({ tp }: { tp: any }) {
    if (!tp) {
        return <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8 italic">No default traffic policy</p>
    }
    const lb      = tp.loadBalancer ?? null
    const connTcp = tp.connectionPool?.tcp ?? null
    const connHttp = tp.connectionPool?.http ?? null
    const od      = tp.outlierDetection ?? null
    const tls     = tp.tls ?? null

    return (
        <div className="space-y-4">
            {lb && (
                <SectionCard title="Load Balancer">
                    {lb.simple && (
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[10px] font-black border px-2.5 py-1 rounded-lg uppercase tracking-tight ${lbBadgeClass(lb.simple)}`}>
                                {lb.simple}
                            </span>
                        </div>
                    )}
                    {lb.consistentHash && (
                        <InfoRow label="Consistent Hash" value={JSON.stringify(lb.consistentHash)} mono />
                    )}
                </SectionCard>
            )}

            {(connTcp || connHttp) && (
                <SectionCard title="Connection Pool">
                    {connTcp?.maxConnections !== undefined && (
                        <InfoRow label="TCP Max Connections" value={String(connTcp.maxConnections)} />
                    )}
                    {connTcp?.connectTimeout && (
                        <InfoRow label="TCP Connect Timeout" value={connTcp.connectTimeout} />
                    )}
                    {connHttp?.http1MaxPendingRequests !== undefined && (
                        <InfoRow label="HTTP/1 Max Pending" value={String(connHttp.http1MaxPendingRequests)} />
                    )}
                    {connHttp?.http2MaxRequests !== undefined && (
                        <InfoRow label="HTTP/2 Max Requests" value={String(connHttp.http2MaxRequests)} />
                    )}
                    {connHttp?.maxRequestsPerConnection !== undefined && (
                        <InfoRow label="Max Req / Connection" value={String(connHttp.maxRequestsPerConnection)} />
                    )}
                </SectionCard>
            )}

            {od && (
                <SectionCard title="Outlier Detection">
                    {od.consecutiveGatewayErrors !== undefined && (
                        <InfoRow label="Consec. Gateway Errors" value={String(od.consecutiveGatewayErrors)} />
                    )}
                    {od.consecutive5xxErrors !== undefined && (
                        <InfoRow label="Consec. 5xx Errors" value={String(od.consecutive5xxErrors)} />
                    )}
                    {od.interval && <InfoRow label="Interval" value={od.interval} />}
                    {od.baseEjectionTime && <InfoRow label="Base Ejection Time" value={od.baseEjectionTime} />}
                    {od.maxEjectionPercent !== undefined && (
                        <InfoRow label="Max Ejection %" value={String(od.maxEjectionPercent)} />
                    )}
                </SectionCard>
            )}

            {tls && (
                <SectionCard title="TLS">
                    <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] font-black border px-2.5 py-1 rounded-lg uppercase tracking-tight ${tlsModeBadgeClass(tls.mode ?? '')}`}>
                            {tls.mode ?? 'UNSET'}
                        </span>
                    </div>
                    {tls.mode !== 'ISTIO_MUTUAL' && (
                        <>
                            {tls.clientCertificate && <InfoRow label="Client Cert" value={tls.clientCertificate} mono />}
                            {tls.privateKey && <InfoRow label="Private Key" value={tls.privateKey} mono />}
                            {tls.caCertificates && <InfoRow label="CA Certs" value={tls.caCertificates} mono />}
                        </>
                    )}
                </SectionCard>
            )}
        </div>
    )
}

export default function IstioDestinationRuleDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('trafficpolicy')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}
    const host: string    = spec.host ?? ''
    const tp              = spec.trafficPolicy ?? null
    const subsets: any[]  = spec.subsets ?? []

    const rawYaml = yaml.dump(item, { indent: 2 })

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · DESTINATION RULE
                        </p>
                    </div>
                    {host && (
                        <span className="shrink-0 text-[10px] font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2.5 py-1 rounded-lg font-mono">
                            {host}
                        </span>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
                <button
                    onClick={() => setTab('trafficpolicy')}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                        tab === 'trafficpolicy'
                            ? 'text-blue-400 border-b-2 border-blue-500'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                >
                    Traffic Policy
                </button>
                <button
                    onClick={() => setTab('subsets')}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                        tab === 'subsets'
                            ? 'text-blue-400 border-b-2 border-blue-500'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                >
                    Subsets ({subsets.length})
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

            {/* Traffic Policy tab */}
            {tab === 'trafficpolicy' && (
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {tp && (
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-4">Default Policy</p>
                    )}
                    <TrafficPolicyView tp={tp} />
                </div>
            )}

            {/* Subsets tab */}
            {tab === 'subsets' && (
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {subsets.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No subsets defined</p>
                    ) : (
                        <div className="space-y-4">
                            {subsets.map((sub: any, si: number) => {
                                const subName: string    = sub.name ?? `Subset ${si + 1}`
                                const labels: Record<string, string> = sub.labels ?? {}
                                const subTp = sub.trafficPolicy ?? null
                                return (
                                    <div key={si} className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4">
                                        <div className="flex items-center gap-2 flex-wrap mb-3">
                                            <span className="text-[11px] font-black font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-lg">
                                                {subName}
                                            </span>
                                            {Object.entries(labels).map(([k, v]) => (
                                                <span key={k} className="text-[10px] font-mono bg-slate-800 text-slate-300 border border-white/5 px-2 py-0.5 rounded">
                                                    {k}={v}
                                                </span>
                                            ))}
                                        </div>
                                        {subTp?.loadBalancer?.simple && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">LB:</span>
                                                <span className={`text-[10px] font-black border px-2 py-0.5 rounded uppercase tracking-tight ${lbBadgeClass(subTp.loadBalancer.simple)}`}>
                                                    {subTp.loadBalancer.simple}
                                                </span>
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
