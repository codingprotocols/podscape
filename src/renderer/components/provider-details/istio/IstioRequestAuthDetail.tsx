import React, { useState } from 'react'
import * as yaml from 'js-yaml'
import { Shield } from 'lucide-react'

interface Props { item: any }

type Tab = 'config' | 'yaml'

export default function IstioRequestAuthDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('config')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}

    const selector  = spec.selector?.matchLabels ?? null
    const jwtRules: any[] = spec.jwtRules ?? []
    const isNamespaceWide = !selector || Object.keys(selector).length === 0

    const rawYaml = yaml.dump(item, { indent: 2 })

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · REQUEST AUTHENTICATION
                        </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-lg uppercase tracking-tight">
                        Istio
                    </span>
                </div>
            </div>

            {/* JWT Rules count hero */}
            <div className="px-6 py-3 border-b border-slate-100 dark:border-white/5 shrink-0 flex items-center gap-3">
                <Shield size={14} className="text-yellow-400" />
                <span className="text-[11px] font-black text-slate-300 uppercase tracking-widest">
                    {jwtRules.length} JWT Rule{jwtRules.length !== 1 ? 's' : ''}
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

                    {/* JWT Rules */}
                    {jwtRules.map((rule: any, i: number) => {
                        const audiences: string[] = rule.audiences ?? []
                        const fromHeaders: any[]  = rule.fromHeaders ?? []
                        const fromParams: string[] = rule.fromParams ?? []
                        const outputPayloadToHeader: string = rule.outputPayloadToHeader ?? ''
                        return (
                            <div key={i} className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4 space-y-3">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">JWT Rule {i + 1}</span>

                                {rule.issuer && (
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Issuer</span>
                                        <span className="font-mono text-yellow-300 text-[11px] break-all">{rule.issuer}</span>
                                    </div>
                                )}

                                {rule.jwksUri && (
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">JWKS URI</span>
                                        <span className="font-mono text-cyan-400 text-[10px] break-all">{rule.jwksUri}</span>
                                    </div>
                                )}

                                {audiences.length > 0 && (
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Audiences</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {audiences.map((aud, j) => (
                                                <span key={j} className="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded">
                                                    {aud}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {fromHeaders.length > 0 && (
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Token from Headers</span>
                                        <div className="space-y-1">
                                            {fromHeaders.map((h: any, j: number) => (
                                                <div key={j} className="flex items-center gap-2 text-[11px]">
                                                    <span className="font-mono text-slate-400">{h.name}</span>
                                                    {h.prefix && <span className="text-slate-600">prefix: <span className="text-slate-400 font-mono">{h.prefix}</span></span>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {fromParams.length > 0 && (
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Token from Query Params</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {fromParams.map((p, j) => (
                                                <span key={j} className="text-[10px] font-mono bg-slate-800 text-slate-300 border border-white/5 px-2 py-0.5 rounded">
                                                    ?{p}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {outputPayloadToHeader && (
                                    <div className="flex items-center justify-between gap-4 pt-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Output Header</span>
                                        <span className="font-mono text-slate-300 text-[11px]">{outputPayloadToHeader}</span>
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {jwtRules.length === 0 && (
                        <p className="text-xs text-slate-500 text-center py-6 italic">No JWT rules defined</p>
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
