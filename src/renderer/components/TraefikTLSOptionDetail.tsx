import React, { useState } from 'react'
import * as yaml from 'js-yaml'
import { Shield } from 'lucide-react'

interface Props { item: any }

type Tab = 'config' | 'yaml'

// Display-friendly TLS version labels
const TLS_VERSION_LABELS: Record<string, string> = {
    VersionTLS10: 'TLS 1.0',
    VersionTLS11: 'TLS 1.1',
    VersionTLS12: 'TLS 1.2',
    VersionTLS13: 'TLS 1.3',
}

const TLS_VERSION_ORDER: Record<string, number> = {
    VersionTLS10: 10,
    VersionTLS11: 11,
    VersionTLS12: 12,
    VersionTLS13: 13,
}

// Color per TLS version
function tlsVersionBadgeClass(v: string): string {
    switch (v) {
        case 'VersionTLS13': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        case 'VersionTLS12': return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        case 'VersionTLS11': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
        case 'VersionTLS10': return 'bg-red-500/10 text-red-400 border-red-500/20'
        default:             return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
}

function clientAuthTypeBadgeClass(t: string): string {
    switch (t) {
        case 'NoClientCert':                return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
        case 'RequestClientCert':           return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        case 'RequireAnyClientCert':        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
        case 'VerifyClientCertIfGiven':     return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
        case 'RequireAndVerifyClientCert':  return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        default:                            return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
}

function MonoChipList({ items, chipClass }: { items: string[]; chipClass: string }) {
    if (items.length === 0) return <p className="text-xs text-slate-500 italic">None</p>
    return (
        <div className="flex flex-wrap gap-1.5">
            {items.map((v, i) => (
                <span key={i} className={`text-[10px] font-mono border px-2 py-0.5 rounded ${chipClass}`}>
                    {v}
                </span>
            ))}
        </div>
    )
}

export default function TraefikTLSOptionDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('config')

    const name = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec = item?.spec ?? {}

    const minVersion: string = spec.minVersion ?? ''
    const maxVersion: string = spec.maxVersion ?? ''
    const cipherSuites: string[] = spec.cipherSuites ?? []
    const curvePreferences: string[] = spec.curvePreferences ?? []
    const alpnProtocols: string[] = spec.alpnProtocols ?? []
    const clientAuth = spec.clientAuth ?? null
    const sniStrict: boolean | undefined = spec.sniStrict

    const rawYaml = yaml.dump(item, { indent: 2 })

    // Build ordered version range display
    const minOrder = TLS_VERSION_ORDER[minVersion] ?? 0
    const maxOrder = TLS_VERSION_ORDER[maxVersion] ?? 99
    const allVersionKeys = Object.keys(TLS_VERSION_ORDER)
    const rangeVersions = minVersion || maxVersion
        ? allVersionKeys.filter(v => {
            const o = TLS_VERSION_ORDER[v]
            return (!minVersion || o >= minOrder) && (!maxVersion || o <= maxOrder)
        })
        : []

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · TLS OPTION
                        </p>
                    </div>
                    <Shield size={16} className="shrink-0 text-slate-400 mt-0.5" />
                </div>

                {/* SNI strict badge */}
                <div className="flex items-center gap-2 mt-3">
                    {sniStrict === true && (
                        <span className="text-[9px] font-black bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                            SNI Strict
                        </span>
                    )}
                    {sniStrict === false && (
                        <span className="text-[9px] font-black bg-slate-500/10 text-slate-400 border border-slate-500/20 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                            SNI Lenient
                        </span>
                    )}
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
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

                    {/* TLS version range */}
                    {(minVersion || maxVersion) && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-3 block">TLS Version Range</span>
                            <div className="flex items-center gap-2 flex-wrap">
                                {allVersionKeys.map((v, i) => {
                                    const inRange = rangeVersions.includes(v)
                                    const isMin = v === minVersion
                                    const isMax = v === maxVersion
                                    const label = TLS_VERSION_LABELS[v] ?? v
                                    return (
                                        <React.Fragment key={v}>
                                            <span className={`text-[10px] font-black border px-2.5 py-1 rounded-lg uppercase tracking-tight transition-opacity ${
                                                inRange
                                                    ? tlsVersionBadgeClass(v)
                                                    : 'bg-slate-500/5 text-slate-600 border-slate-700/30 opacity-40'
                                            }`}>
                                                {label}
                                                {isMin && <span className="ml-1 text-[8px] opacity-60">min</span>}
                                                {isMax && <span className="ml-1 text-[8px] opacity-60">max</span>}
                                            </span>
                                            {i < allVersionKeys.length - 1 && (
                                                <span className={`text-[10px] ${inRange && rangeVersions.includes(allVersionKeys[i + 1]) ? 'text-slate-400' : 'text-slate-700'}`}>
                                                    →
                                                </span>
                                            )}
                                        </React.Fragment>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Client auth */}
                    {clientAuth && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-3 block">Client Authentication</span>
                            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4 space-y-3">
                                {clientAuth.clientAuthType && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Auth Type</span>
                                        <span className={`text-[9px] font-black border px-2.5 py-1 rounded-lg uppercase tracking-wider ${clientAuthTypeBadgeClass(clientAuth.clientAuthType)}`}>
                                            {clientAuth.clientAuthType}
                                        </span>
                                    </div>
                                )}
                                {clientAuth.secretNames && clientAuth.secretNames.length > 0 && (
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">CA Secret Names</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(clientAuth.secretNames as string[]).map((s: string) => (
                                                <span key={s} className="text-[10px] font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2 py-0.5 rounded">
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Cipher suites */}
                    {cipherSuites.length > 0 && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">
                                Cipher Suites ({cipherSuites.length})
                            </span>
                            <MonoChipList
                                items={cipherSuites}
                                chipClass="bg-slate-500/10 text-slate-300 border-slate-500/20"
                            />
                        </div>
                    )}

                    {/* Curve preferences */}
                    {curvePreferences.length > 0 && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">
                                Curve Preferences ({curvePreferences.length})
                            </span>
                            <MonoChipList
                                items={curvePreferences}
                                chipClass="bg-blue-500/10 text-blue-400 border-blue-500/20"
                            />
                        </div>
                    )}

                    {/* ALPN protocols */}
                    {alpnProtocols.length > 0 && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">
                                ALPN Protocols ({alpnProtocols.length})
                            </span>
                            <MonoChipList
                                items={alpnProtocols}
                                chipClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            />
                        </div>
                    )}

                    {!minVersion && !maxVersion && !clientAuth && cipherSuites.length === 0 && curvePreferences.length === 0 && alpnProtocols.length === 0 && (
                        <p className="text-xs text-slate-500 text-center py-6 italic">Default TLS settings (no overrides configured)</p>
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
