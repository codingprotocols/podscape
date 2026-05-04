import React, { useState } from 'react'
import type { KubeResourceQuota } from '../../../types'
import { formatAge } from '../../../types'
import { useAppStore } from '../../../store'
import YAMLViewer from '../../common/YAMLViewer'
import { Layers, FileCode, X } from 'lucide-react'

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start gap-4 py-2 border-b border-slate-100 dark:border-white/[0.02] last:border-0">
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest w-40 shrink-0 pt-0.5">{label}</span>
            <span className="text-xs text-slate-700 dark:text-slate-200 font-bold break-all">{value}</span>
        </div>
    )
}

function QuotaTable({ hard, used }: { hard: Record<string, string>; used: Record<string, string> }) {
    const keys = Object.keys(hard)
    if (keys.length === 0) return <p className="text-xs text-slate-400">—</p>
    return (
        <table className="w-full text-xs font-mono">
            <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5">
                    <th className="text-left pb-2 pr-4">Resource</th>
                    <th className="text-right pb-2 pr-4">Used</th>
                    <th className="text-right pb-2">Hard Limit</th>
                </tr>
            </thead>
            <tbody>
                {keys.map(k => {
                    const hardVal = hard[k]
                    const usedVal = used[k] ?? '0'
                    return (
                        <tr key={k} className="border-b border-white/[0.03] last:border-0">
                            <td className="py-1.5 pr-4 text-slate-500 dark:text-slate-400">{k}</td>
                            <td className="py-1.5 pr-4 text-right text-slate-700 dark:text-slate-300">{usedVal}</td>
                            <td className="py-1.5 text-right text-slate-900 dark:text-white font-bold">{hardVal}</td>
                        </tr>
                    )
                })}
            </tbody>
        </table>
    )
}

export default function ResourceQuotaDetail({ quota }: { quota: KubeResourceQuota }) {
    const { getYAML, applyYAML, refresh } = useAppStore()
    const [yaml, setYaml] = useState<string | null>(null)
    const [yamlLoading, setYamlLoading] = useState(false)
    const [yamlError, setYamlError] = useState<string | null>(null)

    const handleViewYAML = async () => {
        setYaml(null); setYamlError(null); setYamlLoading(true)
        try {
            const content = await getYAML('resourcequota', quota.metadata.name, false, quota.metadata.namespace)
            setYaml(content)
        } catch (err) {
            setYamlError((err as Error).message ?? 'Failed to fetch YAML')
        } finally {
            setYamlLoading(false)
        }
    }

    const hard = quota.spec?.hard ?? {}
    const used = quota.status?.used ?? {}
    const scopes = quota.spec?.scopes ?? []

    return (
        <div className="flex flex-col w-full h-full overflow-hidden">
            <div className="px-8 py-7 border-b border-slate-200 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center shrink-0 border border-violet-500/20 ring-4 ring-violet-500/5">
                            <Layers className="w-6 h-6 text-violet-500" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white font-mono truncate tracking-tight">{quota.metadata.name}</h3>
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-[0.2em] flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                                {quota.metadata.namespace} · ResourceQuota · {formatAge(quota.metadata.creationTimestamp)} age
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleViewYAML}
                        disabled={yamlLoading}
                        className="flex items-center gap-2 text-[11px] font-bold px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all disabled:opacity-50 uppercase tracking-wider shadow-lg shadow-black/20"
                    >
                        <FileCode className="w-3.5 h-3.5" />
                        {yamlLoading ? 'Loading…' : 'YAML'}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hide">
                <div className="px-8 py-6 space-y-8">
                    {scopes.length > 0 && (
                        <div>
                            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-4">Scopes</h4>
                            <div className="flex flex-wrap gap-2">
                                {scopes.map(s => (
                                    <span key={s} className="px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 text-[11px] font-bold border border-violet-500/20">{s}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-4">Quota Usage</h4>
                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl px-6 py-4 shadow-sm">
                            <QuotaTable hard={hard} used={used} />
                        </div>
                    </div>

                    <div>
                        <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-4">Metadata</h4>
                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl px-6 py-2 shadow-sm">
                            <InfoRow label="Namespace" value={quota.metadata.namespace} />
                            <InfoRow label="Created" value={quota.metadata.creationTimestamp} />
                            <InfoRow label="UID" value={<span className="font-mono text-[10px]">{quota.metadata.uid}</span>} />
                        </div>
                    </div>
                </div>
            </div>

            {(yamlLoading || yaml !== null || yamlError !== null) && (
                <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200" role="dialog" aria-modal="true">
                    <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                                    {yamlLoading
                                        ? <div className="w-4 h-4 border-2 border-slate-400 border-t-violet-500 rounded-full animate-spin" />
                                        : <FileCode className="w-4 h-4 text-slate-500" />
                                    }
                                </div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">
                                    {yamlLoading ? 'Loading YAML…' : `YAML — ${quota.metadata.name}`}
                                </h3>
                            </div>
                            <button type="button" onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors" aria-label="Close">
                                <X className="w-4.5 h-4.5" />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 bg-slate-950">
                            {yamlError ? (
                                <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                                    <p className="text-sm font-bold text-red-400 text-center">Failed to load YAML</p>
                                    <pre className="text-xs text-slate-400 text-center max-w-lg break-words whitespace-pre-wrap">{yamlError}</pre>
                                </div>
                            ) : yamlLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="w-8 h-8 border-2 border-slate-700 border-t-violet-500 rounded-full animate-spin" />
                                </div>
                            ) : yaml !== null ? (
                                <YAMLViewer editable content={yaml}
                                    onSave={async (updated) => {
                                        await applyYAML(updated)
                                        refresh()
                                        const next = await getYAML('resourcequota', quota.metadata.name, false, quota.metadata.namespace)
                                        setYaml(next)
                                    }}
                                />
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
