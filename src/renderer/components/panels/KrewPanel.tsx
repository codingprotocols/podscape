import React, { useEffect, useState } from 'react'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import { ArrowUpCircle, Play, CheckCircle, Package, Activity, ArrowLeft } from 'lucide-react'
import type { KrewPlugin } from '../../store/slices/krewSlice'
import PageHeader from '../core/PageHeader'
import { RefreshButton } from '../common'
import { getPlugin } from '../plugins/pluginRegistry'
import type { PluginModule } from '../plugins/PluginContract'

// ─── Not-installed state ──────────────────────────────────────────────────────

function KrewNotInstalled(): JSX.Element {
    const { probeKrew } = useAppStore(useShallow(s => ({ probeKrew: s.probeKrew })))
    const [installing, setInstalling] = useState(false)
    const [lines, setLines] = useState<string[]>([])
    const [error, setError] = useState<string | null>(null)

    async function handleInstall() {
        setInstalling(true)
        setLines([])
        setError(null)
        const unsubscribe = window.krew.onInstallProgress(line => setLines(prev => [...prev, line]))
        try {
            const result = await window.krew.install()
            unsubscribe()
            if (result.success) { await probeKrew() }
            else { setError(result.error ?? 'Installation failed') }
        } catch (err) {
            unsubscribe()
            setError((err as Error).message)
        } finally {
            setInstalling(false)
        }
    }

    return (
        <div className="flex flex-col flex-1 h-full">
            <PageHeader title="Plugins" subtitle="kubectl plugin manager" />
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="max-w-md w-full space-y-6 text-center">
                    <div className="w-16 h-16 rounded-3xl bg-blue-500/10 flex items-center justify-center mx-auto">
                        <Package size={28} className="text-blue-400" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-[15px] font-black text-slate-700 dark:text-slate-100">Krew not installed</h2>
                        <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
                            Krew is the kubectl plugin manager. Install it to discover and manage kubectl plugins.
                        </p>
                    </div>
                    {!installing && !lines.length && (
                        <button onClick={handleInstall} className="px-6 py-3 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-black uppercase tracking-wider transition-colors">
                            Install Krew
                        </button>
                    )}
                    {(installing || lines.length > 0) && (
                        <div className="text-left bg-black/80 rounded-2xl p-4 max-h-64 overflow-y-auto font-mono text-[11px] text-emerald-400 space-y-0.5">
                            {lines.map((l, i) => <div key={i}>{l}</div>)}
                            {installing && <div className="animate-pulse">▌</div>}
                        </div>
                    )}
                    {error && <p className="text-[11px] text-red-400 bg-red-500/10 rounded-xl p-3 text-left font-mono">{error}</p>}
                </div>
            </div>
        </div>
    )
}

// ─── Unsupported (Windows) state ──────────────────────────────────────────────

function KrewUnsupported(): JSX.Element {
    return (
        <div className="flex flex-col flex-1 h-full">
            <PageHeader title="Plugins" subtitle="kubectl plugin manager" />
            <div className="flex-1 flex items-center justify-center">
                <div className="max-w-sm text-center space-y-4">
                    <p className="text-[14px] font-black text-slate-700 dark:text-slate-200">Not available on Windows</p>
                    <p className="text-[12px] text-slate-500 leading-relaxed">
                        Krew requires macOS or Linux. On Windows, use Krew via WSL or Git Bash in the terminal.
                    </p>
                </div>
            </div>
        </div>
    )
}

// ─── Plugin module loader ─────────────────────────────────────────────────────

function usePluginModule(name: string | null): PluginModule | null {
    const [mod, setMod] = useState<PluginModule | null>(null)
    useEffect(() => {
        if (!name) { setMod(null); return }
        const loader = getPlugin(name)
        if (!loader) { setMod(null); return }
        void loader().then(setMod)
    }, [name])
    return mod
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function KrewPanel(): JSX.Element {
    const {
        krewAvailable, krewUnsupported, pluginIndex, installedPlugins,
        indexRefreshing, selectedPlugin, setSelectedPlugin,
        loadPluginIndex, refreshIndexIfStale, upgradeAll,
        selectedContext, selectedNamespace,
    } = useAppStore(useShallow(s => ({
        krewAvailable: s.krewAvailable,
        krewUnsupported: s.krewUnsupported,
        pluginIndex: s.pluginIndex,
        installedPlugins: s.installedPlugins,
        indexRefreshing: s.indexRefreshing,
        selectedPlugin: s.selectedPlugin,
        setSelectedPlugin: s.setSelectedPlugin,
        loadPluginIndex: s.loadPluginIndex,
        refreshIndexIfStale: s.refreshIndexIfStale,
        upgradeAll: s.upgradeAll,
        selectedContext: s.selectedContext,
        selectedNamespace: s.selectedNamespace,
    })))

    const [activeTab, setActiveTab] = useState<'installed' | 'browse'>('installed')
    const [filter, setFilter] = useState('')
    const [upgradingAll, setUpgradingAll] = useState(false)
    const [view, setView] = useState<'info' | 'run'>('info')
    const [operationError, setOperationError] = useState<string | null>(null)

    const pluginMod = usePluginModule(selectedPlugin)

    useEffect(() => {
        if (krewAvailable === true && pluginIndex.length === 0) loadPluginIndex()
        else if (krewAvailable === true) refreshIndexIfStale()
    }, [krewAvailable])

    if (krewAvailable === null) {
        return (
            <div className="flex flex-col flex-1 h-full">
                <PageHeader title="Plugins" subtitle="kubectl plugin manager" />
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
            </div>
        )
    }

    if (krewUnsupported) return <KrewUnsupported />
    if (!krewAvailable) return <KrewNotInstalled />

    // ── Plugin detail view ──
    if (selectedPlugin) {
        const plugin = pluginIndex.find(p => p.name === selectedPlugin) as KrewPlugin | undefined

        function openPlugin(v: 'info' | 'run') { setView(v) }
        function closePlugin() { setOperationError(null); setSelectedPlugin(null) }

        async function handleInstall() {
            setOperationError(null)
            try {
                await window.krew.installPlugin(selectedPlugin!)
                await loadPluginIndex()
            } catch (err) {
                setOperationError((err as Error).message)
            }
        }

        async function handleUninstall() {
            setOperationError(null)
            try {
                await window.krew.uninstallPlugin(selectedPlugin!)
                await loadPluginIndex()
            } catch (err) {
                setOperationError((err as Error).message)
            }
        }

        return (
            <div className="flex flex-1 min-w-0 min-h-0 bg-white dark:bg-[hsl(var(--bg-dark))] flex-col">
                {/* Sub-header: back + info/run tabs */}
                <div className="px-6 py-3 border-b border-slate-100 dark:border-white/5 flex items-center gap-4 shrink-0">
                    <button
                        onClick={closePlugin}
                        className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        <ArrowLeft size={13} /> Back
                    </button>
                    <span className="text-slate-200 font-mono text-[13px] font-black">{selectedPlugin}</span>
                    {plugin?.installed && (
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 rounded-xl p-1 ml-auto">
                            <button
                                onClick={() => openPlugin('info')}
                                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${view === 'info' ? 'bg-white dark:bg-white/10 text-slate-800 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
                            >
                                Info
                            </button>
                            <button
                                onClick={() => openPlugin('run')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${view === 'run' ? 'bg-white dark:bg-white/10 text-slate-800 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
                            >
                                <Play size={10} /> Run
                            </button>
                        </div>
                    )}
                </div>

                {operationError && (
                    <div className="mx-6 mt-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold flex items-center gap-2">
                        <span className="shrink-0">⚠</span>
                        {operationError}
                    </div>
                )}

                {/* Plugin content */}
                <div className="flex-1 overflow-hidden cursor-default">
                    {!pluginMod ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                        </div>
                    ) : plugin && view === 'info' ? (
                        <pluginMod.InfoPanel
                            plugin={plugin}
                            onInstall={handleInstall}
                            onUninstall={handleUninstall}
                            onOpen={plugin.installed ? () => openPlugin('run') : undefined}
                        />
                    ) : plugin && view === 'run' ? (
                        pluginMod.RunPanel ? (
                            <pluginMod.RunPanel
                                namespace={selectedNamespace ?? 'default'}
                                context={selectedContext ?? ''}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-500 text-[11px] font-bold uppercase tracking-widest">
                                Run panel not available for this plugin.
                            </div>
                        )
                    ) : null}
                </div>
            </div>
        )
    }

    // ── List view ──
    const rows = pluginIndex
        .filter(p => p.name !== 'krew')
        .filter(p =>
            p.name.toLowerCase().includes(filter.toLowerCase()) ||
            p.short.toLowerCase().includes(filter.toLowerCase())
        )
        .filter(p => activeTab === 'installed' ? p.installed : true)

    function openPlugin(name: string, defaultView: 'info' | 'run') {
        setView(defaultView)
        setSelectedPlugin(name)
    }

    async function handleRefresh() {
        await loadPluginIndex()
    }

    async function handleUpgradeAll() {
        setUpgradingAll(true)
        try { await upgradeAll(); await loadPluginIndex() }
        finally { setUpgradingAll(false) }
    }

    return (
        <div className="flex flex-1 min-w-0 min-h-0 bg-white dark:bg-[hsl(var(--bg-dark))] transition-colors duration-200">
            <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
                <PageHeader
                    title={activeTab === 'installed' ? 'Installed Plugins' : 'Browse Plugins'}
                    subtitle={
                        !indexRefreshing ? (
                            <>
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                                {activeTab === 'installed'
                                    ? `${pluginIndex.filter(p => p.installed).length} installed`
                                    : `${pluginIndex.length} featured`}
                            </>
                        ) : undefined
                    }
                >
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 rounded-xl p-1">
                            <button
                                onClick={() => setActiveTab('installed')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${activeTab === 'installed' ? 'bg-white dark:bg-white/10 text-slate-800 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                <Activity size={11} /> Installed
                            </button>
                            <button
                                onClick={() => setActiveTab('browse')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${activeTab === 'browse' ? 'bg-white dark:bg-white/10 text-slate-800 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                            >
                                <Package size={11} /> Browse
                            </button>
                        </div>

                        {activeTab === 'installed' && installedPlugins.length > 0 && (
                            <button
                                onClick={handleUpgradeAll}
                                disabled={upgradingAll}
                                className="flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
                            >
                                <ArrowUpCircle size={11} />
                                {upgradingAll ? 'Upgrading...' : 'Upgrade All'}
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative group">
                            <input
                                type="text"
                                value={filter}
                                onChange={e => setFilter(e.target.value)}
                                placeholder={activeTab === 'installed' ? 'Filter installed...' : 'Search plugins...'}
                                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 text-[11px] font-bold rounded-xl px-4 py-2.5 pl-10 border border-transparent focus:border-blue-500/50 focus:outline-none focus:ring-4 focus:ring-blue-500/10 w-64 transition-all placeholder-slate-400 dark:placeholder-slate-600"
                            />
                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                            </div>
                        </div>
                        <RefreshButton onClick={handleRefresh} loading={indexRefreshing} label="Refresh" />
                    </div>
                </PageHeader>

                <div className="flex-1 overflow-auto scrollbar-hide">
                    {indexRefreshing && pluginIndex.length === 0 ? (
                        <div className="flex items-center justify-center py-24">
                            <div className="w-10 h-10 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
                            <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center mb-4">
                                <Package size={32} strokeWidth={1.5} />
                            </div>
                            <p className="text-xs font-bold uppercase tracking-widest">
                                {filter ? 'No results match filter' : activeTab === 'installed' ? 'No plugins installed yet' : 'No plugins found'}
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-sm border-collapse">
                            <thead className="sticky top-0 bg-white/70 dark:bg-[hsl(var(--bg-dark),_0.7)] backdrop-blur-xl z-20">
                                <tr className="border-b border-slate-100 dark:border-white/5">
                                    {['Name', 'Description', 'Category', 'Status'].map(h => (
                                        <th key={h} className="text-left pl-8 py-5 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">{h}</th>
                                    ))}
                                    <th className="w-14" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                                {rows.map(plugin => (
                                    <tr
                                        key={plugin.name}
                                        onClick={() => openPlugin(plugin.name, plugin.installed && activeTab === 'installed' ? 'run' : 'info')}
                                        className="group cursor-pointer transition-colors duration-200 border-l-[3px] border-transparent hover:bg-slate-100/50 dark:hover:bg-white/5"
                                    >
                                        <td className="px-8 py-4 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{plugin.name}</td>
                                        <td className="px-8 py-4 text-xs text-slate-500 dark:text-slate-400 max-w-md truncate">{plugin.short}</td>
                                        <td className="px-8 py-4 whitespace-nowrap">
                                            {plugin.category && (
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">
                                                    {plugin.category}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-8 py-4 whitespace-nowrap">
                                            {plugin.installed
                                                ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider outline outline-1 outline-offset-[-1px] bg-emerald-500/10 text-emerald-500 outline-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]">
                                                    <CheckCircle size={10} /> Installed
                                                  </span>
                                                : <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider outline outline-1 outline-offset-[-1px] bg-slate-500/10 text-slate-400 outline-slate-500/20">
                                                    Available
                                                  </span>
                                            }
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 group-hover:text-blue-500 transition-colors">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m9 18 6-6-6-6" /></svg>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}
