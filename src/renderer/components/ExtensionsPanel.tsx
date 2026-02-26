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
    <div className="flex flex-1 bg-slate-50 dark:bg-slate-950 h-full transition-colors duration-200">
      {/* Plugin list sidebar */}
      <div className="w-72 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-900/30">
        <div className="flex items-center justify-between px-6 py-6 border-b border-slate-100 dark:border-slate-800/50">
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Extensions</h2>
          <button
            onClick={reloadPlugins}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            title="Reload plugins"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6m12 6a9 9 0 0 1-15-6.7L3 16" /></svg>
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
        <div className="px-6 py-5 border-t border-slate-100 dark:border-slate-800/50 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-600 leading-relaxed uppercase tracking-tighter">
            Plugin path:<br />
            <span className="font-mono text-blue-500 dark:text-blue-400 normal-case">~/.podscape/plugins/</span>
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
        className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all group"
      >
        <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 shadow-sm transition-transform group-hover:scale-110">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
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
              className={`w-full text-left px-3 py-2 text-[11px] font-bold rounded-lg transition-all
                ${selected === panel.id
                  ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 shadow-sm'
                  : 'text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
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
    <div className="flex flex-col h-full bg-white dark:bg-slate-950">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{panel.title}</h3>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{plugin.name} · v{plugin.version}</p>
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
