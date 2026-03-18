import React, { useState } from 'react'
import * as yaml from 'js-yaml'
import { X, Shield, Globe } from 'lucide-react'

interface Props { item: any }

type Tab = 'routes' | 'yaml'

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

export default function TraefikIngressRouteDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('routes')

    const name = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const createdAt = item?.metadata?.creationTimestamp
    const spec = item?.spec ?? {}
    const routes: any[] = spec.routes ?? []
    const tls = spec.tls ?? null

    const rawYaml = yaml.dump(item, { indent: 2 })

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · INGRESS ROUTE
                        </p>
                        {createdAt && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-600 mt-1">
                                Age: {age(createdAt)}
                            </p>
                        )}
                    </div>
                    <span className="shrink-0 text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg uppercase tracking-tight">
                        Traefik
                    </span>
                </div>
            </div>

            {/* TLS section */}
            {tls && (
                <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-yellow-500/5 shrink-0">
                    <div className="flex items-center gap-2 mb-2">
                        <Shield size={12} className="text-yellow-500" />
                        <span className="text-[10px] font-black text-yellow-500/70 uppercase tracking-[0.2em]">TLS</span>
                    </div>
                    <div className="space-y-1.5 pl-1">
                        {tls.secretName && (
                            <div className="flex items-center gap-2 text-[11px]">
                                <span className="text-slate-500 dark:text-slate-600 uppercase tracking-wider text-[9px] font-bold w-20 shrink-0">Secret</span>
                                <span className="font-mono text-yellow-300">{tls.secretName}</span>
                            </div>
                        )}
                        {tls.certResolver && (
                            <div className="flex items-center gap-2 text-[11px]">
                                <span className="text-slate-500 dark:text-slate-600 uppercase tracking-wider text-[9px] font-bold w-20 shrink-0">Resolver</span>
                                <span className="font-mono text-slate-300">{tls.certResolver}</span>
                            </div>
                        )}
                        {tls.passthrough === true && (
                            <span className="inline-block text-[9px] font-black bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                                Passthrough
                            </span>
                        )}
                        {tls.options && (
                            <div className="flex items-center gap-2 text-[11px]">
                                <span className="text-slate-500 dark:text-slate-600 uppercase tracking-wider text-[9px] font-bold w-20 shrink-0">Options</span>
                                <span className="font-mono text-slate-400">
                                    {tls.options.namespace ? `${tls.options.namespace}/` : ''}{tls.options.name}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
                {(['routes', 'yaml'] as Tab[]).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
                            tab === t
                                ? 'text-blue-400 border-b-2 border-blue-500'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                        }`}
                    >
                        {t === 'routes' ? `Routes (${routes.length})` : 'YAML'}
                    </button>
                ))}
            </div>

            {/* Routes tab */}
            {tab === 'routes' && (
                <div className="flex-1 overflow-y-auto">
                    {routes.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No routes defined</p>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-white/5">
                            {routes.map((route: any, ri: number) => {
                                const match: string = route?.match ?? '—'
                                const kind: string = route?.kind ?? 'Rule'
                                const priority: number | undefined = route?.priority
                                const services: any[] = route?.services ?? []
                                const middlewares: any[] = route?.middlewares ?? []
                                const totalWeight = services.reduce((acc: number, s: any) => acc + (s.weight ?? 0), 0)
                                const hasWeights = totalWeight > 0 && services.some((s: any) => s.weight !== undefined)

                                return (
                                    <div key={ri} className="px-5 py-4">
                                        {/* Match expression */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <Globe size={11} className="text-emerald-400 shrink-0" />
                                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{kind}</span>
                                            {priority !== undefined && (
                                                <span className="text-[9px] font-black bg-slate-500/10 text-slate-400 border border-slate-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                    priority {priority}
                                                </span>
                                            )}
                                        </div>
                                        <pre className="bg-slate-900 text-green-400 text-[11px] font-mono rounded-lg px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all mb-3">
                                            {match}
                                        </pre>

                                        {/* Services table */}
                                        {services.length > 0 && (
                                            <div className="mb-3">
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Services</span>
                                                <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-white/5">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                                                                <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Service</th>
                                                                <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Port</th>
                                                                {hasWeights && <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Weight</th>}
                                                                <th className="px-3 py-2 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Sticky</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                                            {services.map((svc: any, si: number) => {
                                                                const weight = svc?.weight ?? 0
                                                                const pct = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0
                                                                const cookieName = svc?.sticky?.cookie?.name
                                                                return (
                                                                    <tr key={si} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                                        <td className="px-3 py-2 font-mono text-cyan-400 font-semibold">{svc?.name ?? '—'}</td>
                                                                        <td className="px-3 py-2 font-mono text-slate-400">{svc?.port ?? '—'}</td>
                                                                        {hasWeights && (
                                                                            <td className="px-3 py-2">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="w-16 h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                                                                                        <div
                                                                                            className="h-full bg-emerald-500 rounded-full"
                                                                                            style={{ width: `${pct}%` }}
                                                                                        />
                                                                                    </div>
                                                                                    <span className="text-[10px] text-slate-400">{weight}</span>
                                                                                </div>
                                                                            </td>
                                                                        )}
                                                                        <td className="px-3 py-2">
                                                                            {cookieName ? (
                                                                                <span className="text-[9px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded">
                                                                                    🍪 {cookieName}
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
                                        )}

                                        {/* Middlewares */}
                                        {middlewares.length > 0 && (
                                            <div>
                                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Middlewares</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {middlewares.map((mw: any, mi: number) => {
                                                        const mwName = mw?.name ?? String(mw)
                                                        const mwNs = mw?.namespace
                                                        return (
                                                            <span
                                                                key={mi}
                                                                className="text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded"
                                                            >
                                                                {mwNs ? `${mwNs}/${mwName}` : mwName}
                                                            </span>
                                                        )
                                                    })}
                                                </div>
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
