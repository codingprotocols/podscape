import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import { Download, ArrowUpCircle, Play, Terminal, CheckCircle, Trash2, Package, Activity } from 'lucide-react'
import type { KrewPlugin } from '../../store/slices/krewSlice'
import PageHeader from '../core/PageHeader'
import { RefreshButton } from '../common'

// ─── Not-installed state ──────────────────────────────────────────────────────

function KrewNotInstalled(): JSX.Element {
  const { probeKrew } = useAppStore(useShallow(s => ({
    probeKrew: s.probeKrew,
  })))
  const [installing, setInstalling] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [lines])

  async function handleInstall() {
    setInstalling(true)
    setLines([])
    setError(null)
    const unsubscribe = window.krew.onInstallProgress((line) => {
      setLines(prev => [...prev, line])
    })
    try {
      const result = await window.krew.install()
      unsubscribe()
      if (result.success) {
        await probeKrew()
      } else {
        setError(result.error ?? 'Installation failed')
      }
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
            <Download size={28} className="text-blue-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-[15px] font-black text-slate-700 dark:text-slate-100">Krew not installed</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Krew is the kubectl plugin manager. It lets you discover, install, and manage
              kubectl plugins from a curated index.
            </p>
          </div>
          {!installing && !lines.length && (
            <button
              onClick={handleInstall}
              className="px-6 py-3 rounded-2xl bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-black uppercase tracking-wider transition-colors"
            >
              Install Krew
            </button>
          )}
          {(installing || lines.length > 0) && (
            <div
              ref={logRef}
              className="text-left bg-black/80 rounded-2xl p-4 max-h-64 overflow-y-auto font-mono text-[11px] text-emerald-400 space-y-0.5"
            >
              {lines.map((l, i) => <div key={i}>{l}</div>)}
              {installing && <div className="animate-pulse">▌</div>}
            </div>
          )}
          {error && (
            <p className="text-[11px] text-red-400 bg-red-500/10 rounded-xl p-3 text-left font-mono">{error}</p>
          )}
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
            Krew integration requires macOS or Linux. On Windows, you can still use Krew
            via WSL or Git Bash in the terminal.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Plugin detail / run panel ────────────────────────────────────────────────

function PluginDetail({ plugin, onClose }: { plugin: KrewPlugin; onClose: () => void }): JSX.Element {
  const { setSection, installedPlugins, loadPluginIndex } = useAppStore(useShallow(s => ({
    setSection: s.setSection,
    installedPlugins: s.installedPlugins,
    loadPluginIndex: s.loadPluginIndex,
  })))
  const isInstalled = installedPlugins.includes(plugin.name)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [args, setArgs] = useState('')
  const [running, setRunning] = useState(false)
  const [outputLines, setOutputLines] = useState<string[]>([])
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [outputLines])

  async function handleInstall() {
    setActionLoading(true)
    setActionError(null)
    try {
      await window.krew.installPlugin(plugin.name)
      await loadPluginIndex()
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleUninstall() {
    setActionLoading(true)
    setActionError(null)
    try {
      await window.krew.uninstallPlugin(plugin.name)
      await loadPluginIndex()
    } catch (err) {
      setActionError((err as Error).message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRun() {
    setRunning(true)
    setOutputLines([])
    const argList = args.trim() ? args.trim().split(/\s+/) : []
    const unsubscribe = window.krew.onPluginOutput((line) => {
      setOutputLines(prev => [...prev, line])
    })
    try {
      await window.krew.runPlugin(plugin.name, argList)
    } finally {
      unsubscribe()
      setRunning(false)
    }
  }

  function openInTerminal() {
    const cmd = args.trim() ? `kubectl ${plugin.name} ${args.trim()}` : `kubectl ${plugin.name}`
    ;(window as any).exec?.injectCommand?.(cmd)
    setSection('multi-terminal' as any)
  }

  return (
    <div className="flex flex-col bg-transparent h-full transition-colors duration-200 relative w-full font-sans">
      {/* Header */}
      <div className="px-6 py-6 border-b border-slate-100 dark:border-white/5 shrink-0 bg-white/5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-slate-900 dark:text-white font-mono truncate tracking-tight">{plugin.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
              {plugin.version ? `v${plugin.version} · ` : ''}{isInstalled ? 'Installed' : 'kubectl plugin'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all group"
              title="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:rotate-90 transition-transform duration-300"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">{plugin.short}</p>
      </div>

      <div className="flex flex-col p-6 space-y-6 overflow-y-auto flex-1">
      <div className="flex gap-3">
        {isInstalled ? (
          <button
            onClick={handleUninstall}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            <Trash2 size={13} />
            {actionLoading ? 'Removing...' : 'Uninstall'}
          </button>
        ) : (
          <button
            onClick={handleInstall}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            <Download size={13} />
            {actionLoading ? 'Installing...' : 'Install'}
          </button>
        )}
      </div>

      {actionError && (
        <p className="text-[11px] text-red-400 bg-red-500/10 rounded-xl p-3 font-mono">{actionError}</p>
      )}

      {isInstalled && (
        <div className="space-y-3">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Run Plugin</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={args}
              onChange={e => setArgs(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !running) handleRun() }}
              placeholder="arguments..."
              className="flex-1 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              <Play size={12} />
              Run
            </button>
            <button
              onClick={openInTerminal}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 text-[11px] font-black uppercase tracking-wider transition-colors"
              title="Open in Terminal"
            >
              <Terminal size={12} />
            </button>
          </div>

          {outputLines.some(l => l.startsWith('[truncated]')) && (
            <p className="text-[10px] text-amber-400 bg-amber-500/10 rounded-lg px-3 py-1.5">
              {outputLines.find(l => l.startsWith('[truncated]'))}
            </p>
          )}

          {outputLines.length > 0 && (
            <div
              ref={outputRef}
              className="bg-black/80 rounded-2xl p-4 max-h-72 overflow-y-auto font-mono text-[11px] space-y-0.5"
            >
              {outputLines.filter(l => !l.startsWith('[truncated]')).map((l, i) => (
                <div key={i} className={l.startsWith('[stderr]') ? 'text-red-400' : 'text-slate-200'}>{l}</div>
              ))}
              {running && <div className="text-emerald-400 animate-pulse">▌</div>}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function KrewPanel(): JSX.Element {
  const {
    krewAvailable,
    krewUnsupported,
    pluginIndex,
    installedPlugins,
    indexRefreshing,
    selectedPlugin,
    setSelectedPlugin,
    loadPluginIndex,
    refreshIndexIfStale,
    upgradeAll,
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
  })))

  const [activeTab, setActiveTab] = useState<'installed' | 'browse'>('installed')
  const [filter, setFilter] = useState('')
  const [upgradingAll, setUpgradingAll] = useState(false)

  useEffect(() => {
    if (krewAvailable === true && pluginIndex.length === 0) {
      loadPluginIndex()
    } else if (krewAvailable === true) {
      refreshIndexIfStale()
    }
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

  const rows = pluginIndex.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    p.short.toLowerCase().includes(filter.toLowerCase())
  ).filter(p => activeTab === 'installed' ? p.installed : true)

  const selectedPluginData = pluginIndex.find(p => p.name === selectedPlugin) ?? null

  async function handleRefresh() {
    await window.krew.update()
    await loadPluginIndex()
  }

  async function handleUpgradeAll() {
    setUpgradingAll(true)
    try {
      await upgradeAll()
      await loadPluginIndex()
    } finally {
      setUpgradingAll(false)
    }
  }

  // Full-screen detail view
  if (selectedPluginData) {
    return (
      <div className="flex flex-1 min-w-0 min-h-0 bg-white dark:bg-[hsl(var(--bg-dark))] transition-colors duration-200">
        <PluginDetail plugin={selectedPluginData} onClose={() => setSelectedPlugin(null)} />
      </div>
    )
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
                  ? `${installedPlugins.length} installed`
                  : `${pluginIndex.length} available`}
              </>
            ) : undefined
          }
        >
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 rounded-xl p-1">
              <button
                onClick={() => setActiveTab('installed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  activeTab === 'installed'
                    ? 'bg-white dark:bg-white/10 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <Activity size={11} />
                Installed
              </button>
              <button
                onClick={() => setActiveTab('browse')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  activeTab === 'browse'
                    ? 'bg-white dark:bg-white/10 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <Package size={11} />
                Browse
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
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 text-[11px] font-bold rounded-xl px-4 py-2.5 pl-10
                           border border-transparent focus:border-blue-500/50 focus:outline-none focus:ring-4 focus:ring-blue-500/10
                           w-64 transition-all placeholder-slate-400 dark:placeholder-slate-600"
              />
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              </div>
            </div>
            <RefreshButton onClick={handleRefresh} loading={indexRefreshing} label="Refresh" />
          </div>
        </PageHeader>

        {/* Table */}
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
                {filter
                  ? 'No results match filter'
                  : activeTab === 'installed'
                    ? 'No plugins installed yet'
                    : 'No plugins found'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-white/70 dark:bg-[hsl(var(--bg-dark),_0.7)] backdrop-blur-xl z-20">
                <tr className="border-b border-slate-100 dark:border-white/5">
                  {['Name', 'Description', 'Status'].map(h => (
                    <th key={h} className="text-left pl-8 py-5 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                  <th className="w-14" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                {rows.map(plugin => (
                  <tr
                    key={plugin.name}
                    onClick={() => setSelectedPlugin(plugin.name)}
                    className="group cursor-pointer transition-colors duration-200 border-l-[3px] border-transparent hover:bg-slate-100/50 dark:hover:bg-white/5"
                  >
                    <td className="px-8 py-4 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{plugin.name}</td>
                    <td className="px-8 py-4 text-xs text-slate-500 dark:text-slate-400 max-w-md truncate">{plugin.short}</td>
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
