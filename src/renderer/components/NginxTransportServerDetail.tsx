import React, { useState } from 'react'
import * as yaml from 'js-yaml'
import { Shield } from 'lucide-react'

interface Props { item: any }

type Tab = 'config' | 'yaml'

function protocolBadgeClass(protocol?: string): string {
    switch ((protocol ?? '').toUpperCase()) {
        case 'TCP': return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        case 'UDP': return 'bg-green-500/10 text-green-400 border-green-500/20'
        default:    return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
}

function InfoRow({ label, value, mono }: { label: string; value?: string | number; mono?: boolean }) {
    if (value === undefined || value === null || value === '') return null
    return (
        <div className="flex items-start justify-between gap-4 py-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">{label}</span>
            <span className={`text-[11px] font-bold text-slate-300 text-right ${mono ? 'font-mono' : ''}`}>{String(value)}</span>
        </div>
    )
}

export default function NginxTransportServerDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('config')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}

    const listener         = spec.listener ?? null
    const protocol: string = listener?.protocol ?? ''
    const tls              = spec.tls ?? null
    const upstreams: any[] = spec.upstreams ?? []
    const upstreamParams   = spec.upstreamParameters ?? null
    const action           = spec.action ?? null
    const sessionParams    = spec.sessionParameters ?? null

    const rawYaml = yaml.dump(item, { indent: 2 })

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · TRANSPORT SERVER
                        </p>
                    </div>
                    {protocol && (
                        <span className={`shrink-0 text-[10px] font-black border px-2.5 py-1 rounded-lg uppercase tracking-tight ${protocolBadgeClass(protocol)}`}>
                            {protocol}
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
                                <span className="text-slate-500 dark:text-slate-600 uppercase tracking-wider text-[9px] font-bold w-24 shrink-0">Secret</span>
                                <span className="font-mono text-yellow-300">{tls.secret}</span>
                            </div>
                        )}
                        {tls.enable !== undefined && (
                            <div className="flex items-center gap-2 text-[11px]">
                                <span className="text-slate-500 dark:text-slate-600 uppercase tracking-wider text-[9px] font-bold w-24 shrink-0">Enabled</span>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${
                                    tls.enable
                                        ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                        : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                }`}>
                                    {tls.enable ? 'true' : 'false'}
                                </span>
                            </div>
                        )}
                        {tls.passthrough?.upstreamName && (
                            <div className="flex items-center gap-2 text-[11px]">
                                <span className="text-slate-500 dark:text-slate-600 uppercase tracking-wider text-[9px] font-bold w-24 shrink-0">Passthrough</span>
                                <span className="font-mono text-cyan-400">{tls.passthrough.upstreamName}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
                {(['config', 'yaml'] as Tab[]).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
                            tab === t
                                ? 'text-blue-400 border-b-2 border-blue-500'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                        }`}
                    >
                        {t === 'config' ? 'Config' : 'YAML'}
                    </button>
                ))}
            </div>

            {/* Config tab */}
            {tab === 'config' && (
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

                    {/* Listener */}
                    {listener && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Listener</span>
                            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl px-4 py-3 flex items-center gap-3">
                                <span className="text-sm font-mono font-bold text-slate-300">{listener.name ?? '—'}</span>
                                {protocol && (
                                    <span className={`text-[9px] font-black border px-2 py-0.5 rounded uppercase tracking-wider ${protocolBadgeClass(protocol)}`}>
                                        {protocol}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Upstreams table */}
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
                                            <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">MaxFails</th>
                                            <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">MaxConns</th>
                                            <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">FailTimeout</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                        {upstreams.map((up: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                <td className="px-3 py-2.5 font-mono text-cyan-400 font-semibold">{up.name ?? '—'}</td>
                                                <td className="px-3 py-2.5 font-mono text-slate-300">{up.service ?? '—'}:{up.port ?? '—'}</td>
                                                <td className="px-3 py-2.5 text-slate-400">{up.maxFails ?? '—'}</td>
                                                <td className="px-3 py-2.5 text-slate-400">{up.maxConns ?? '—'}</td>
                                                <td className="px-3 py-2.5 text-slate-400 font-mono">{up.failTimeout ?? '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Upstream parameters */}
                    {upstreamParams && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Upstream Parameters</span>
                            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl px-4 py-3 space-y-1.5">
                                <InfoRow label="Connect Timeout"       value={upstreamParams.connectTimeout}       mono />
                                <InfoRow label="Next Upstream Timeout" value={upstreamParams.nextUpstreamTimeout}  mono />
                                <InfoRow label="Next Upstream Tries"   value={upstreamParams.nextUpstreamTries}    />
                                {upstreamParams.nextUpstream !== undefined && (
                                    <div className="flex items-start justify-between gap-4 py-1.5">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">Next Upstream</span>
                                        <span className={`text-[9px] font-black border px-2 py-0.5 rounded uppercase tracking-wider ${
                                            upstreamParams.nextUpstream
                                                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                                : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                        }`}>
                                            {upstreamParams.nextUpstream ? 'true' : 'false'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Action card */}
                    {action?.pass && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Action</span>
                            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl px-4 py-3 flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Pass →</span>
                                <span className="font-mono text-cyan-400 font-bold">{action.pass}</span>
                            </div>
                        </div>
                    )}

                    {/* Session parameters */}
                    {sessionParams?.timeout && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Session</span>
                            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl px-4 py-3">
                                <InfoRow label="Timeout" value={sessionParams.timeout} mono />
                            </div>
                        </div>
                    )}

                    {upstreams.length === 0 && !action && !listener && (
                        <p className="text-xs text-slate-500 text-center py-8 italic">No configuration found in spec</p>
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
