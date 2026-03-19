import React, { useState } from 'react'
import * as yaml from 'js-yaml'
import { Shield } from 'lucide-react'

interface Props { item: any }

type Tab = 'config' | 'yaml'

function InfoRow({ label, value, mono }: { label: string; value?: string | number | boolean; mono?: boolean }) {
    if (value === undefined || value === null || value === '') return null
    return (
        <div className="flex items-start justify-between gap-4 py-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">{label}</span>
            <span className={`text-[11px] font-bold text-slate-300 text-right ${mono ? 'font-mono' : ''}`}>{String(value)}</span>
        </div>
    )
}

export default function TraefikServersTransportTCPDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('config')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}

    const tls          = spec.tls ?? null
    const dialTimeout  = spec.dialTimeout
    const dialKeepAlive = spec.dialKeepAlive
    const terminationDelay = spec.terminationDelay

    const certRefs: any[]   = tls?.certificates ?? []
    const rootCAs: string[] = tls?.rootCAs ?? []
    const insecureSkipVerify: boolean = tls?.insecureSkipVerify ?? false

    const rawYaml = yaml.dump(item, { indent: 2 })

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · SERVERS TRANSPORT TCP
                        </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg uppercase tracking-tight">
                        Traefik
                    </span>
                </div>
            </div>

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

                    {/* Dial settings */}
                    {(dialTimeout || dialKeepAlive || terminationDelay) && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Connection Settings</span>
                            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl px-4 py-3 space-y-1">
                                <InfoRow label="Dial Timeout"       value={dialTimeout}       mono />
                                <InfoRow label="Keep-Alive"         value={dialKeepAlive}     mono />
                                <InfoRow label="Termination Delay"  value={terminationDelay}  mono />
                            </div>
                        </div>
                    )}

                    {/* TLS config */}
                    {tls && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Shield size={12} className="text-yellow-500" />
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">TLS Configuration</span>
                            </div>
                            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl px-4 py-3 space-y-3">
                                {tls.serverName && (
                                    <InfoRow label="Server Name" value={tls.serverName} mono />
                                )}
                                {insecureSkipVerify && (
                                    <div className="flex items-center justify-between gap-4 py-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Skip Verify</span>
                                        <span className="text-[9px] font-black border px-2 py-0.5 rounded uppercase tracking-wider bg-red-500/10 text-red-400 border-red-500/20">
                                            true
                                        </span>
                                    </div>
                                )}

                                {rootCAs.length > 0 && (
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Root CAs</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {rootCAs.map((ca, i) => (
                                                <span key={i} className="text-[10px] font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded">
                                                    {ca}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {certRefs.length > 0 && (
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Client Certificates</span>
                                        <div className="space-y-1.5">
                                            {certRefs.map((cert: any, i: number) => (
                                                <div key={i} className="font-mono text-yellow-300 text-[11px]">
                                                    {cert.secretName ?? cert}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {!tls && !dialTimeout && !dialKeepAlive && !terminationDelay && (
                        <p className="text-xs text-slate-500 text-center py-8 italic">Default transport settings (no overrides)</p>
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
