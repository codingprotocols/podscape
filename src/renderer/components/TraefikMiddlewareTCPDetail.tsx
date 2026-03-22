import React, { useState } from 'react'
import * as yaml from 'js-yaml'

interface Props { item: any }

type Tab = 'config' | 'yaml'

export default function TraefikMiddlewareTCPDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('config')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}

    const ipAllowList = spec.ipAllowList ?? null
    const sourceRange: string[] = ipAllowList?.sourceRange ?? []

    const rawYaml = yaml.dump(item, { indent: 2 })

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · MIDDLEWARE TCP
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
                    {ipAllowList && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-3 block">
                                IP Allow List ({sourceRange.length} CIDRs)
                            </span>
                            {sourceRange.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {sourceRange.map((cidr, i) => (
                                        <span key={i} className="text-[10px] font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2.5 py-1 rounded">
                                            {cidr}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-500 italic">No CIDRs defined (blocks all)</p>
                            )}
                        </div>
                    )}

                    {!ipAllowList && (
                        <p className="text-xs text-slate-500 text-center py-8 italic">No middleware configuration found in spec</p>
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
