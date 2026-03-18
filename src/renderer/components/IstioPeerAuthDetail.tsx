import React, { useState } from 'react'
import * as yaml from 'js-yaml'

interface Props { item: any }

type Tab = 'config' | 'yaml'

function mtlsBadgeClass(mode: string): string {
    switch ((mode ?? '').toUpperCase()) {
        case 'STRICT':      return 'bg-green-500/10 text-green-400 border-green-500/20'
        case 'PERMISSIVE':  return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
        case 'DISABLE':     return 'bg-red-500/10 text-red-400 border-red-500/20'
        default:            return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
}

function mtlsLabel(mode: string): string {
    switch ((mode ?? '').toUpperCase()) {
        case 'STRICT':      return 'STRICT mTLS'
        case 'PERMISSIVE':  return 'PERMISSIVE'
        case 'DISABLE':     return 'DISABLED'
        default:            return 'UNSET (Inherited)'
    }
}

function portMtlsBadgeClass(mode: string): string {
    return mtlsBadgeClass(mode)
}

export default function IstioPeerAuthDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('config')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}
    const selector  = spec.selector?.matchLabels ?? null
    const mtls      = spec.mtls ?? null
    const portLevelMtls: Record<string, { mode: string }> = spec.portLevelMtls ?? {}
    const portEntries = Object.entries(portLevelMtls)

    const mode = mtls?.mode ?? ''
    const rawYaml = yaml.dump(item, { indent: 2 })

    const isNamespaceWide = !selector || Object.keys(selector).length === 0

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · PEER AUTHENTICATION
                        </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-lg uppercase tracking-tight">
                        Istio
                    </span>
                </div>
            </div>

            {/* mTLS mode hero badge */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
                <span className={`inline-block text-[13px] font-black border px-4 py-1.5 rounded-xl uppercase tracking-widest ${mtlsBadgeClass(mode)}`}>
                    {mtlsLabel(mode)}
                </span>
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
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    {/* Scope */}
                    <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-3">Scope</span>
                        {isNamespaceWide ? (
                            <span className="text-[11px] font-bold text-slate-300">Namespace-wide policy</span>
                        ) : (
                            <div>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Workload Selector</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(selector as Record<string, string>).map(([k, v]) => (
                                        <span key={k} className="text-[10px] font-mono bg-slate-800 text-slate-300 border border-white/5 px-2 py-0.5 rounded">
                                            {k}={v}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Port-level overrides */}
                    {portEntries.length > 0 && (
                        <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-3">Port-level mTLS Overrides</span>
                            <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-white/5">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                                            <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Port</th>
                                            <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Mode</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                        {portEntries.map(([port, cfg]) => (
                                            <tr key={port} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                <td className="px-3 py-2 font-mono text-slate-300 font-semibold">{port}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`text-[10px] font-black border px-2 py-0.5 rounded uppercase tracking-wider ${portMtlsBadgeClass(cfg.mode ?? '')}`}>
                                                        {cfg.mode || 'UNSET'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
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
