import React, { useState } from 'react'
import * as yaml from 'js-yaml'

interface Props { item: any }

type Tab = 'rules' | 'yaml'

function actionBadgeClass(action: string): string {
    switch ((action ?? '').toUpperCase()) {
        case 'ALLOW':  return 'bg-green-500/10 text-green-400 border-green-500/20'
        case 'DENY':   return 'bg-red-500/10 text-red-400 border-red-500/20'
        case 'AUDIT':  return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
        case 'CUSTOM': return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
        default:       return 'bg-green-500/10 text-green-400 border-green-500/20'
    }
}

function ChipGroup({
    label,
    items,
    not = false,
}: {
    label: string
    items: string[]
    not?: boolean
}) {
    if (!items || items.length === 0) return null
    return (
        <div className="mb-2">
            <span className={`text-[9px] font-black uppercase tracking-wider block mb-1.5 ${not ? 'text-red-500/70' : 'text-slate-500'}`}>
                {not ? `Not ${label}` : label}
            </span>
            <div className="flex flex-wrap gap-1">
                {items.map((v, i) => (
                    <span
                        key={i}
                        className={`text-[10px] font-mono border px-2 py-0.5 rounded ${
                            not
                                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                : 'bg-slate-800 text-slate-300 border-white/5'
                        }`}
                    >
                        {not ? `!${v}` : v}
                    </span>
                ))}
            </div>
        </div>
    )
}

function FromSection({ frm }: { frm: any }) {
    const src = frm?.source ?? {}
    return (
        <div className="space-y-1">
            <ChipGroup label="Principals"         items={src.principals ?? []} />
            <ChipGroup label="Request Principals" items={src.requestPrincipals ?? []} />
            <ChipGroup label="Namespaces"         items={src.namespaces ?? []} />
            <ChipGroup label="IP Blocks"          items={src.ipBlocks ?? []} />
            <ChipGroup label="Remote IP Blocks"   items={src.remoteIpBlocks ?? []} />
            <ChipGroup label="Principals"         items={src.notPrincipals ?? []} not />
            <ChipGroup label="Namespaces"         items={src.notNamespaces ?? []} not />
            <ChipGroup label="IP Blocks"          items={src.notIpBlocks ?? []} not />
        </div>
    )
}

function ToSection({ to }: { to: any }) {
    const op = to?.operation ?? {}
    return (
        <div className="space-y-1">
            <ChipGroup label="Hosts"   items={op.hosts ?? []} />
            <ChipGroup label="Methods" items={op.methods ?? []} />
            <ChipGroup label="Paths"   items={op.paths ?? []} />
            <ChipGroup label="Ports"   items={op.ports ?? []} />
            <ChipGroup label="Hosts"   items={op.notHosts ?? []} not />
            <ChipGroup label="Methods" items={op.notMethods ?? []} not />
            <ChipGroup label="Paths"   items={op.notPaths ?? []} not />
            <ChipGroup label="Ports"   items={op.notPorts ?? []} not />
        </div>
    )
}

function WhenSection({ when }: { when: any[] }) {
    if (!when || when.length === 0) return null
    return (
        <div>
            {when.map((cond: any, ci: number) => (
                <div key={ci} className="flex items-start gap-2 py-1">
                    <span className="font-mono text-[10px] text-blue-400 shrink-0">{cond.key}</span>
                    <span className="text-slate-600 text-[10px]">:</span>
                    <div className="flex flex-wrap gap-1">
                        {(cond.values ?? []).map((v: string, vi: number) => (
                            <span key={vi} className="text-[10px] font-mono bg-slate-800 text-slate-300 border border-white/5 px-2 py-0.5 rounded">{v}</span>
                        ))}
                        {(cond.notValues ?? []).map((v: string, vi: number) => (
                            <span key={`not-${vi}`} className="text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded">!{v}</span>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}

export default function IstioAuthPolicyDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('rules')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}
    const action: string  = spec.action ?? 'ALLOW'
    const selector        = spec.selector?.matchLabels ?? null
    const rules: any[]    = spec.rules ?? []
    const provider        = spec.provider ?? null

    const rawYaml = yaml.dump(item, { indent: 2 })

    const isNamespaceWide = !selector || Object.keys(selector).length === 0

    const allEmpty = rules.length === 0

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · AUTHORIZATION POLICY
                        </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-black bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-lg uppercase tracking-tight">
                        Istio
                    </span>
                </div>
            </div>

            {/* Action hero badge */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 shrink-0 flex items-center gap-3 flex-wrap">
                <span className={`inline-block text-[13px] font-black border px-4 py-1.5 rounded-xl uppercase tracking-widest ${actionBadgeClass(action)}`}>
                    {action || 'ALLOW'}
                </span>
                {action === 'CUSTOM' && provider?.name && (
                    <span className="text-[11px] font-mono text-slate-400">
                        Provider: <span className="text-purple-400">{provider.name}</span>
                    </span>
                )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
                {(['rules', 'yaml'] as Tab[]).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
                            tab === t
                                ? 'text-blue-400 border-b-2 border-blue-500'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                        }`}
                    >
                        {t === 'rules' ? `Rules (${rules.length})` : 'YAML'}
                    </button>
                ))}
            </div>

            {/* Rules tab */}
            {tab === 'rules' && (
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
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

                    {/* Empty rules notice */}
                    {allEmpty && (
                        <div className={`rounded-2xl border px-5 py-4 text-sm font-semibold ${
                            (action || 'ALLOW') === 'DENY'
                                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                : 'bg-green-500/10 text-green-400 border-green-500/20'
                        }`}>
                            {(action || 'ALLOW') === 'DENY' ? 'Deny all traffic' : 'Allow all traffic'}
                        </div>
                    )}

                    {/* Rules */}
                    {rules.map((rule: any, ri: number) => {
                        const froms: any[]  = rule.from ?? []
                        const tos: any[]    = rule.to ?? []
                        const whens: any[]  = rule.when ?? []
                        const isEmpty = froms.length === 0 && tos.length === 0 && whens.length === 0

                        return (
                            <div key={ri} className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4 space-y-3">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Rule {ri + 1}</span>

                                {isEmpty && (
                                    <p className="text-[11px] text-slate-400 italic">Unconditional match</p>
                                )}

                                {froms.length > 0 && (
                                    <div>
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">From</span>
                                        <div className="space-y-1">
                                            {froms.map((f: any, fi: number) => (
                                                <FromSection key={fi} frm={f} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {tos.length > 0 && (
                                    <div>
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">To</span>
                                        <div className="space-y-1">
                                            {tos.map((t: any, ti: number) => (
                                                <ToSection key={ti} to={t} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {whens.length > 0 && (
                                    <div>
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">When</span>
                                        <WhenSection when={whens} />
                                    </div>
                                )}
                            </div>
                        )
                    })}
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
