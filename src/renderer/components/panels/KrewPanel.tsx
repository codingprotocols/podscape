import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import { Download, RefreshCw, ArrowUpCircle, Play, Terminal, CheckCircle, Trash2, Search } from 'lucide-react'
import type { KrewPlugin } from '../../store/slices/krewSlice'
import PageHeader from '../core/PageHeader'

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

function PluginDetail({ plugin }: { plugin: KrewPlugin }): JSX.Element {
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
    <div className="flex flex-col h-full p-6 space-y-6 overflow-y-auto">
      <div className="space-y-1">
        <h2 className="text-[15px] font-black text-slate-700 dark:text-slate-100">{plugin.name}</h2>
        <p className="text-[11px] text-slate-500">v{plugin.version}</p>
        <p className="text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed">{plugin.short}</p>
      </div>

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
  )
}

// ─── Plugin list row ──────────────────────────────────────────────────────────

function PluginRow({ plugin, selected, onSelect }: {
  plugin: KrewPlugin
  selected: boolean
  onSelect: (name: string) => void
}): JSX.Element {
  return (
    <button
      onClick={() => onSelect(plugin.name)}
      className={`w-full text-left px-4 py-3 border-b border-slate-100 dark:border-white/[0.04] transition-colors
        ${selected
          ? 'bg-blue-500/10 text-blue-400'
          : 'hover:bg-slate-50 dark:hover:bg-white/[0.03] text-slate-700 dark:text-slate-200'
        }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold truncate">{plugin.name}</span>
        {plugin.installed && (
          <CheckCircle size={12} className="shrink-0 text-emerald-500" />
        )}
      </div>
      <p className="text-[10px] text-slate-500 dark:text-slate-500 truncate mt-0.5">{plugin.short}</p>
    </button>
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

  const [search, setSearch] = useState('')
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

  const filtered = pluginIndex.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.short.toLowerCase().includes(search.toLowerCase())
  )
  const filteredInstalled = filtered.filter(p => p.installed)
  const filteredAvailable = filtered.filter(p => !p.installed)

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

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden">
      <PageHeader title="Plugins" subtitle={`${installedPlugins.length} installed · ${pluginIndex.length - installedPlugins.length} available`}>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUpgradeAll}
            disabled={upgradingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            <ArrowUpCircle size={13} />
            {upgradingAll ? 'Upgrading...' : 'Upgrade All'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={indexRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={indexRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </PageHeader>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Plugin browser */}
        <div className="w-72 shrink-0 flex flex-col border-r border-slate-100 dark:border-white/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search plugins..."
                className="w-full pl-9 pr-3 py-2 text-[11px] bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-8">No plugins match &quot;{search}&quot;</p>
            )}

            {/* Installed section */}
            {filteredInstalled.length > 0 && (
              <>
                <div className="px-4 py-2 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5 sticky top-0 z-10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">
                    Installed · {filteredInstalled.length}
                  </span>
                </div>
                {filteredInstalled.map(plugin => (
                  <PluginRow key={plugin.name} plugin={plugin} selected={selectedPlugin === plugin.name} onSelect={setSelectedPlugin} />
                ))}
              </>
            )}

            {/* Available section */}
            {filteredAvailable.length > 0 && (
              <>
                <div className="px-4 py-2 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5 sticky top-0 z-10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Available · {filteredAvailable.length}
                  </span>
                </div>
                {filteredAvailable.map(plugin => (
                  <PluginRow key={plugin.name} plugin={plugin} selected={selectedPlugin === plugin.name} onSelect={setSelectedPlugin} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Right: Plugin detail */}
        <div className="flex-1 overflow-hidden">
          {selectedPluginData ? (
            <PluginDetail plugin={selectedPluginData} />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-[12px]">
              Select a plugin to view details
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
