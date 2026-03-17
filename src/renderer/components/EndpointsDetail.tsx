import React, { useState } from 'react'
import type { KubeEndpoints } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import YAMLViewer from './YAMLViewer'
import { MapPin, Activity, List, FileCode, X, CheckSquare } from 'lucide-react'

export default function EndpointsDetail({ ep }: { ep: KubeEndpoints }) {
    const { getYAML, applyYAML, refresh } = useAppStore()
    const [yaml, setYaml] = useState<string | null>(null)
    const [yamlLoading, setYamlLoading] = useState(false)
    const [yamlError, setYamlError] = useState<string | null>(null)

    const handleViewYAML = async () => {
        setYaml(null); setYamlError(null); setYamlLoading(true)
        try {
            const content = await getYAML('endpoints', ep.metadata.name, false, ep.metadata.namespace)
            setYaml(content)
        } catch (err) {
            setYamlError((err as Error).message ?? 'Failed to fetch YAML')
        } finally {
            setYamlLoading(false)
        }
    }

    const subsets = ep.subsets ?? []
    const totalAddresses = subsets.reduce((sum, s) => sum + (s.addresses?.length ?? 0), 0)
    const totalNotReady = subsets.reduce((sum, s) => sum + (s.notReadyAddresses?.length ?? 0), 0)

    return (
        <div className="flex flex-col w-full h-full overflow-hidden">
            {/* Header */}
            <div className="px-8 py-7 border-b border-slate-200 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 dark:bg-cyan-500/20 flex items-center justify-center shrink-0 border border-cyan-500/20 ring-4 ring-cyan-500/5">
                            <MapPin className="w-6 h-6 text-cyan-500" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white font-mono truncate tracking-tight">{ep.metadata.name}</h3>
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-[0.2em] flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                                {ep.metadata.namespace} · Endpoints · {formatAge(ep.metadata.creationTimestamp)} age
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
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                                <CheckSquare className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ready</p>
                                <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{totalAddresses}</span>
                            </div>
                        </div>
                        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center">
                                <Activity className="w-5 h-5 rotate-180" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Not Ready</p>
                                <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{totalNotReady}</span>
                            </div>
                        </div>
                    </div>

                    {/* Subsets */}
                    {subsets.length > 0 && (
                        <div>
                            <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                <List className="w-3 h-3" />
                                Connectivity
                            </h4>
                            <div className="space-y-3">
                                {subsets.map((s, si) => (
                                    <div key={si} className="bg-white/[0.02] border border-white/5 rounded-2xl px-6 py-4 shadow-sm">
                                        <div className="flex gap-6 mb-3">
                                            <div>
                                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Ports</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {s.ports?.map((p, pi) => (
                                                        <span key={pi} className="px-2 py-0.5 bg-cyan-500/10 text-cyan-500 text-[10px] font-bold rounded-lg border border-cyan-500/20 font-mono">
                                                            {p.port}/{p.protocol} {p.name && `(${p.name})`}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Ready IPs</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {s.addresses?.map((a, ai) => (
                                                    <span key={ai} className="px-2 py-0.5 bg-slate-100 dark:bg-white/5 text-[10px] font-mono text-slate-600 dark:text-slate-300 rounded border border-slate-200 dark:border-white/5">
                                                        {a.ip}
                                                    </span>
                                                ))}
                                                {(!s.addresses || s.addresses.length === 0) && <span className="text-[10px] text-slate-500 italic">None</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* YAML Modal */}
            {(yamlLoading || yaml !== null || yamlError !== null) && (
                <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200" role="dialog" aria-modal="true">
                    <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                                    {yamlLoading
                                        ? <div className="w-4 h-4 border-2 border-slate-400 border-t-cyan-500 rounded-full animate-spin" />
                                        : <FileCode className="w-4 h-4 text-slate-500" />
                                    }
                                </div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">
                                    {yamlLoading ? 'Loading YAML…' : `YAML — ${ep.metadata.name}`}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                                aria-label="Close"
                            >
                                <X className="w-4.5 h-4.5" />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 bg-slate-950">
                            {yamlError ? (
                                <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                                    <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                                        <Activity className="w-5 h-5 text-red-400" />
                                    </div>
                                    <p className="text-sm font-bold text-red-400 text-center">Failed to load YAML</p>
                                    <pre className="text-xs text-slate-400 text-center max-w-lg break-words whitespace-pre-wrap">{yamlError}</pre>
                                </div>
                            ) : yamlLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="w-8 h-8 border-2 border-slate-700 border-t-cyan-500 rounded-full animate-spin" />
                                </div>
                            ) : yaml !== null ? (
                                <YAMLViewer editable
                                    content={yaml}
                                    onSave={async (updated) => {
                                        await applyYAML(updated)
                                        refresh()
                                        const next = await getYAML('endpoints', ep.metadata.name, false, ep.metadata.namespace)
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
