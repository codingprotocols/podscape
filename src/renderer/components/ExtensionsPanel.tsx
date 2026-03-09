import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { Plugin, PluginPanel } from '../types'

export default function ExtensionsPanel(): JSX.Element {
  const { plugins } = useAppStore()
  const [selected, setSelected] = useState<{ plugin: Plugin; panel: PluginPanel } | null>(null)

  const reloadPlugins = async () => {
    const list = await window.plugins.list().catch(() => [])
    useAppStore.setState({ plugins: list })
  }

  useEffect(() => { reloadPlugins() }, [])

  return (
    <div className="flex flex-1 bg-white dark:bg-[hsl(var(--bg-dark))] h-full transition-colors duration-300">
      {/* Plugin list sidebar */}
      <div className="w-80 border-r border-slate-200 dark:border-white/5 flex flex-col bg-white/5 backdrop-blur-md">
        <div className="flex items-center justify-between px-8 py-8 border-b border-slate-100 dark:border-white/5">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase tracking-[0.05em]">Extensions</h2>
          <button
            onClick={reloadPlugins}
            className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white transition-all hover:bg-white/10 rounded-2xl border border-white/5 active:scale-95 shadow-lg"
            title="Reload plugins"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6m12 6a9 9 0 0 1-15-6.7L3 16" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {plugins.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-200 dark:text-slate-700 mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
              </div>
              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">No extensions found</p>
            </div>
          ) : (
            plugins.map(plugin => (
              <PluginEntry
                key={plugin.id}
                plugin={plugin}
                selected={selected?.plugin.id === plugin.id ? selected.panel.id : null}
                onSelectPanel={panel => setSelected({ plugin, panel })}
              />
            ))
          )}
        </div>

        {/* Plugin SDK info */}
        <div className="px-8 py-6 border-t border-slate-100 dark:border-white/5 shrink-0 bg-white/5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-loose">
            SDK Path<br />
            <span className="font-mono text-blue-400 lowercase tracking-normal">~/.podscape/plugins/</span>
          </p>
        </div>
      </div>

      {/* Panel viewer or info */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <PanelViewer panel={selected.panel} plugin={selected.plugin} />
        ) : (
          <ExtensionInfo />
        )}
      </div>
    </div>
  )
}

function PluginEntry({
  plugin, selected, onSelectPanel
}: { plugin: Plugin; selected: string | null; onSelectPanel: (p: PluginPanel) => void }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-4 w-full px-5 py-4 hover:bg-white/5 rounded-2xl transition-all group"
      >
        <div className="w-10 h-10 rounded-2xl bg-purple-600/10 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 shadow-[0_0_15px_rgba(168,85,247,0.15)] transition-all group-hover:scale-110 group-active:scale-90 border border-purple-500/20">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-black text-slate-800 dark:text-white truncate tracking-tight">{plugin.name}</p>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">v{plugin.version}</p>
        </div>
        <span className={`text-slate-300 dark:text-slate-700 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>

      {expanded && plugin.panels.length > 0 && (
        <div className="ml-8 mt-1 space-y-0.5 border-l-2 border-slate-100 dark:border-slate-800/80 pl-3">
          {plugin.panels.map(panel => (
            <button
              key={panel.id}
              onClick={() => onSelectPanel(panel)}
              className={`w-full text-left px-4 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all
                ${selected === panel.id
                  ? 'bg-purple-600/10 text-purple-400 shadow-[inset_0_0_12px_rgba(168,85,247,0.1)] border border-purple-500/20'
                  : 'text-slate-500 hover:bg-white/5 hover:text-white'
                }`}
            >
              {panel.title}
            </button>
          ))}
        </div>
      )}

      {expanded && plugin.panels.length === 0 && (
        <p className="ml-11 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase italic">No panels</p>
      )}
    </div>
  )
}

function PanelViewer({ panel, plugin }: { panel: PluginPanel; plugin: Plugin }) {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-[hsl(var(--bg-dark))] transition-colors duration-300">
      <div className="flex items-center justify-between px-8 py-6 border-b border-slate-200 dark:border-white/5 bg-white/5 backdrop-blur-xl shrink-0">
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-widest uppercase">{panel.title}</h3>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-[0.2em]">{plugin.name} · v{plugin.version}</p>
        </div>
        {panel.url && (
          <button
            onClick={() => window.open(panel.url, '_blank')}
            className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:text-blue-500 transition-colors uppercase tracking-widest"
          >
            Open Externally ↗
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 bg-white dark:bg-slate-950">
        {panel.url ? (
          <webview
            src={panel.url}
            className="w-full h-full border-0"
            style={{ display: 'block' }}
            // @ts-ignore
            allowpopups="false"
          />
        ) : panel.html ? (
          <iframe
            srcDoc={panel.html}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts"
            title={panel.title}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-[11px] font-bold uppercase tracking-widest">
            This panel has no content configured.
          </div>
        )}
      </div>
    </div>
  )
}

function ExtensionInfo(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full px-12 text-center gap-6">
      <div className="w-24 h-24 rounded-full bg-slate-50 dark:bg-slate-900/60 flex items-center justify-center text-slate-200 dark:text-slate-700">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
      </div>
      <div>
        <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase tracking-[0.1em]">Podscape Plugin SDK</h3>
        <p className="text-[11px] font-bold text-slate-400 dark:text-slate-600 mt-4 leading-relaxed max-w-sm mx-auto uppercase tracking-tighter">
          Extend Podscape with custom panels and views. Create a manifest in the plugins directory to get started.
        </p>
        <div className="mt-8 text-left max-w-md mx-auto">
          <div className="flex items-center gap-2 mb-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-t-xl border border-slate-200 dark:border-slate-700">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="ml-2 text-[10px] font-bold text-slate-400 font-mono">package.json</span>
          </div>
          <pre className="text-[11px] bg-slate-900 text-blue-400/90 p-5 rounded-b-xl border border-t-0 border-slate-200 dark:border-slate-700 font-mono leading-relaxed shadow-xl">
            {`{
  "name": "my-plugin",
  "version": "1.0.0",
  "podscape": {
    "panels": [
      {
        "id": "my-panel",
        "title": "My Dashboard",
        "url": "http://localhost:8080"
      }
    ]
  }
}`}
          </pre>
        </div>
      </div>
    </div>
  )
}
