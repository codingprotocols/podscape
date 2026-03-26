import React, { useState } from 'react'
import * as yaml from 'js-yaml'

interface Props { item: any }

type Tab = 'config' | 'yaml'

function age(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime()
    const s = Math.floor(diff / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
}

export default function TraefikServiceDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('config')

    const name = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const createdAt = item?.metadata?.creationTimestamp
    const spec = item?.spec ?? {}

    const isWeighted = !!spec.weighted
    const isMirroring = !!spec.mirroring
    const typeLabel = isWeighted ? 'Weighted' : isMirroring ? 'Mirroring' : 'Unknown'

    const weightedServices: any[] = spec.weighted?.services ?? []
    const globalStickyCookie: string | undefined = spec.weighted?.sticky?.cookie?.name

    const mirroringMain = spec.mirroring
    const mirrors: any[] = spec.mirroring?.mirrors ?? []

    const totalWeight = weightedServices.reduce((acc: number, s: any) => acc + (s.weight ?? 0), 0)

    const rawYaml = yaml.dump(item, { indent: 2 })

    const typeBadgeClass = isWeighted
        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        : isMirroring
            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · TRAEFIK SERVICE
                        </p>
                        {createdAt && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-600 mt-1">Age: {age(createdAt)}</p>
                        )}
                    </div>
                    <span className={`shrink-0 text-[10px] font-black border px-2.5 py-1 rounded-lg uppercase tracking-tight ${typeBadgeClass}`}>
                        {typeLabel}
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

                    {/* Weighted */}
                    {isWeighted && (
                        <>
                            {globalStickyCookie && (
                                <div className="flex items-center gap-2 px-1">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Global Sticky Cookie</span>
                                    <span className="text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded">
                                        {globalStickyCookie}
                                    </span>
                                </div>
                            )}
                            <div>
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block px-1">Services</span>
                                <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                                                <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Service</th>
                                                <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Port</th>
                                                <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Weight</th>
                                                <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">%</th>
                                                <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Sticky</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                            {weightedServices.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-3 py-4 text-center text-slate-500 text-xs italic">No services configured</td>
                                                </tr>
                                            ) : weightedServices.map((svc: any, i: number) => {
                                                const w = svc?.weight ?? 0
                                                const pct = totalWeight > 0 ? Math.round((w / totalWeight) * 100) : 0
                                                const svcNs = svc?.namespace
                                                const cookieName = svc?.sticky?.cookie?.name
                                                return (
                                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                        <td className="px-3 py-2.5 font-mono text-cyan-400 font-semibold">
                                                            {svcNs ? <span className="text-slate-500">{svcNs}/</span> : null}
                                                            {svc?.name ?? '—'}
                                                        </td>
                                                        <td className="px-3 py-2.5 font-mono text-slate-400">{svc?.port ?? '—'}</td>
                                                        <td className="px-3 py-2.5">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-14 h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-blue-500 rounded-full"
                                                                        style={{ width: `${pct}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-[11px] text-slate-400 font-mono">{w}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-[11px] text-slate-400">{pct}%</td>
                                                        <td className="px-3 py-2.5">
                                                            {cookieName ? (
                                                                <span className="text-[9px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded">
                                                                    {cookieName}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-600">—</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Mirroring */}
                    {isMirroring && (
                        <>
                            {/* Main service card */}
                            <div>
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block px-1">Main Service</span>
                                <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl px-4 py-3 flex items-center gap-3">
                                    <span className="text-sm font-mono font-bold text-cyan-400">
                                        {mirroringMain?.namespace ? <span className="text-slate-500">{mirroringMain.namespace}/</span> : null}
                                        {mirroringMain?.name ?? '—'}
                                    </span>
                                    {mirroringMain?.port && (
                                        <span className="text-[11px] font-black text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20 font-mono">
                                            :{mirroringMain.port}
                                        </span>
                                    )}
                                    {mirroringMain?.maxBodySize !== undefined && (
                                        <span className="ml-auto text-[10px] text-slate-500">
                                            max body: <span className="font-mono text-slate-400">{mirroringMain.maxBodySize}B</span>
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Mirrors table */}
                            {mirrors.length > 0 && (
                                <div>
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block px-1">
                                        Mirrors ({mirrors.length})
                                    </span>
                                    <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                                                    <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Service</th>
                                                    <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Port</th>
                                                    <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Mirror %</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                                {mirrors.map((m: any, i: number) => (
                                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                        <td className="px-3 py-2.5 font-mono text-purple-400 font-semibold">
                                                            {m?.namespace ? <span className="text-slate-500">{m.namespace}/</span> : null}
                                                            {m?.name ?? '—'}
                                                        </td>
                                                        <td className="px-3 py-2.5 font-mono text-slate-400">{m?.port ?? '—'}</td>
                                                        <td className="px-3 py-2.5">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-14 h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-purple-500 rounded-full"
                                                                        style={{ width: `${m?.percent ?? 0}%` }}
                                                                    />
                                                                </div>
                                                                <span className="text-[11px] font-bold text-slate-300">{m?.percent ?? 0}%</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {!isWeighted && !isMirroring && (
                        <p className="text-xs text-slate-500 text-center py-8 italic">
                            Neither weighted nor mirroring spec found
                        </p>
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
