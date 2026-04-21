import React, { useState } from 'react'
import { Download, Trash2, ExternalLink } from 'lucide-react'
import type { PluginInfoPanelProps } from './PluginContract'

const CATEGORY_COLORS: Record<string, string> = {
    logging:    'text-blue-400 bg-blue-500/10',
    debugging:  'text-amber-400 bg-amber-500/10',
    security:   'text-rose-400 bg-rose-500/10',
    inspection: 'text-purple-400 bg-purple-500/10',
    storage:    'text-teal-400 bg-teal-500/10',
}

function openExternal(url: string) {
    ;(window as unknown as { electron: { shell: { openExternal: (u: string) => void } } })
        .electron.shell.openExternal(url)
}

export function PluginInfoLayout({ plugin, onInstall, onUninstall, onOpen }: PluginInfoPanelProps): JSX.Element {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleInstall() {
        setLoading(true)
        setError(null)
        try { await onInstall() }
        catch (e) { setError((e as Error).message) }
        finally { setLoading(false) }
    }

    async function handleUninstall() {
        setLoading(true)
        setError(null)
        try { await onUninstall() }
        catch (e) { setError((e as Error).message) }
        finally { setLoading(false) }
    }

    const categoryColor = CATEGORY_COLORS[plugin.category] ?? 'text-slate-400 bg-slate-500/10'

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 space-y-3">
                <div className="flex items-start gap-3 flex-wrap">
                    {plugin.category && (
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg ${categoryColor}`}>
                            {plugin.category}
                        </span>
                    )}
                    {plugin.tags?.map(tag => (
                        <span key={tag} className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-lg">
                            {tag}
                        </span>
                    ))}
                </div>

                {plugin.description && (
                    <p className="text-[12px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        {plugin.description}
                    </p>
                )}

                <div className="flex items-center gap-4">
                    {plugin.homepage && (
                        <button
                            onClick={() => openExternal(plugin.homepage)}
                            className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            <ExternalLink size={11} /> Homepage
                        </button>
                    )}
                    {plugin.docs && (
                        <button
                            onClick={() => openExternal(plugin.docs)}
                            className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            <ExternalLink size={11} /> Docs
                        </button>
                    )}
                </div>
            </div>

            <div className="p-6 space-y-3">
                <div className="flex gap-3 flex-wrap">
                    {plugin.installed ? (
                        <>
                            {onOpen && (
                                <button
                                    onClick={onOpen}
                                    className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-black uppercase tracking-wider transition-colors"
                                >
                                    Open
                                </button>
                            )}
                            <button
                                onClick={handleUninstall}
                                disabled={loading}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                            >
                                <Trash2 size={12} />
                                {loading ? 'Removing...' : 'Uninstall'}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleInstall}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                        >
                            <Download size={12} />
                            {loading ? 'Installing...' : 'Install'}
                        </button>
                    )}
                </div>

                {error && (
                    <p className="text-[11px] text-red-400 bg-red-500/10 rounded-xl p-3 font-mono">{error}</p>
                )}
            </div>
        </div>
    )
}
