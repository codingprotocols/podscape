import React, { useState } from 'react'
import type { KubeStorageClass } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import YAMLViewer from './YAMLViewer'
import { Database, Cog, FileCode, X, Activity } from 'lucide-react'

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start gap-4 py-2 border-b border-slate-100 dark:border-white/[0.02] last:border-0">
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest w-40 shrink-0 pt-0.5">{label}</span>
            <span className="text-xs text-slate-700 dark:text-slate-200 font-bold break-all">{value}</span>
        </div>
    )
}

export default function StorageClassDetail({ sc }: { sc: KubeStorageClass }) {
    const { getYAML, applyYAML, refresh } = useAppStore()
    const [yaml, setYaml] = useState<string | null>(null)
    const [yamlLoading, setYamlLoading] = useState(false)
    const [yamlError, setYamlError] = useState<string | null>(null)

    const handleViewYAML = async () => {
        setYaml(null); setYamlError(null); setYamlLoading(true)
        try {
            const content = await getYAML('storageclass', sc.metadata.name, true)
            setYaml(content)
        } catch (err) {
            setYamlError((err as Error).message ?? 'Failed to fetch YAML')
        } finally {
            setYamlLoading(false)
        }
    }

    const isDefault = sc.metadata.annotations?.['storageclass.kubernetes.io/is-default-class'] === 'true'

    return (
        <div className="flex flex-col w-full h-full overflow-hidden">
            {/* Header */}
            <div className="px-8 py-7 border-b border-slate-200 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-orange-600/10 dark:bg-orange-500/20 flex items-center justify-center shrink-0 border border-orange-500/20 ring-4 ring-orange-500/5">
                            <Database className="w-6 h-6 text-orange-600 dark:text-orange-500" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white font-mono truncate tracking-tight">{sc.metadata.name}</h3>
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-[0.2em] flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                Cluster-wide · StorageClass · {formatAge(sc.metadata.creationTimestamp)} age
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
                    {/* Quick Info */}
                    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 flex items-center justify-between gap-6 shadow-sm">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Provisioner</span>
                            <span className="text-sm font-black text-slate-900 dark:text-white font-mono">{sc.provisioner}</span>
                        </div>
                        <div className="h-8 w-px bg-white/10 shrink-0" />
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Default</span>
                            <span className={`text-xs font-black uppercase ${isDefault ? 'text-blue-500' : 'text-slate-400'}`}>{isDefault ? 'Yes' : 'No'}</span>
                        </div>
                    </div>

                    {/* Configuration */}
                    <div>
                        <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <Cog className="w-3 h-3" />
                            Policy
                        </h4>
                        <div className="bg-white/[0.02] border border-white/5 rounded-2xl px-6 py-2 shadow-sm">
                            <InfoRow label="Reclaim Policy" value={sc.reclaimPolicy ?? 'Delete'} />
                            <InfoRow label="Binding Mode" value={sc.volumeBindingMode ?? 'Immediate'} />
                            <InfoRow label="Allow Expansion" value={sc.allowVolumeExpansion ? 'True' : 'False'} />
                            {sc.parameters && (
                                <InfoRow label="Parameters" value={
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {Object.entries(sc.parameters).map(([k, v]) => (
                                            <span key={k} className="px-2 py-0.5 bg-slate-100 dark:bg-white/5 rounded text-[10px] font-mono text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/5">
                                                {k}: {v}
                                            </span>
                                        ))}
                                    </div>
                                } />
                            )}
                        </div>
                    </div>
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
                                        ? <div className="w-4 h-4 border-2 border-slate-400 border-t-orange-500 rounded-full animate-spin" />
                                        : <FileCode className="w-4 h-4 text-slate-500" />
                                    }
                                </div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">
                                    {yamlLoading ? 'Loading YAML…' : `YAML — ${sc.metadata.name}`}
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
                                    <div className="w-8 h-8 border-2 border-slate-700 border-t-orange-500 rounded-full animate-spin" />
                                </div>
                            ) : yaml !== null ? (
                                <YAMLViewer editable
                                    content={yaml}
                                    onSave={async (updated) => {
                                        await applyYAML(updated)
                                        refresh()
                                        const next = await getYAML('storageclass', sc.metadata.name, true)
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
