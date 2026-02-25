import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { Plugin, PluginPanel } from '../types'

export default function ExtensionsPanel(): JSX.Element {
  const { plugins } = useAppStore()
  const [selected, setSelected] = useState<{ plugin: Plugin; panel: PluginPanel } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const reloadPlugins = async () => {
    const list = await window.plugins.list().catch(() => [])
    useAppStore.setState({ plugins: list })
    setRefreshKey(k => k + 1)
  }

  useEffect(() => { reloadPlugins() }, [])

  return (
    <div className="flex flex-1 bg-gray-900/50 h-full">
      {/* Plugin list sidebar */}
      <div className="w-64 border-r border-white/10 flex flex-col bg-gray-900/70">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/10">
          <h2 className="text-sm font-semibold text-white">Extensions</h2>
          <button
            onClick={reloadPlugins}
            className="text-xs text-gray-400 hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-white/5"
            title="Reload plugins"
          >
            ↻
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {plugins.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-gray-500">No extensions installed</p>
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
        <div className="px-4 py-3 border-t border-white/10 shrink-0">
          <p className="text-xs text-gray-600 leading-relaxed">
            Install extensions in{' '}
            <span className="font-mono text-gray-500">~/.podscape/plugins/</span>
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
    <div className="mb-1">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 w-full px-4 py-2 hover:bg-white/5 transition-colors"
      >
        <div className="w-6 h-6 rounded bg-purple-600/30 flex items-center justify-center text-xs text-purple-300 shrink-0">
          ⬡
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-medium text-gray-200 truncate">{plugin.name}</p>
          <p className="text-xs text-gray-500">v{plugin.version}</p>
        </div>
        <span className="text-gray-600 text-xs">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && plugin.panels.length > 0 && (
        <div className="ml-4 border-l border-white/10 pl-2">
          {plugin.panels.map(panel => (
            <button
              key={panel.id}
              onClick={() => onSelectPanel(panel)}
              className={`w-full text-left px-3 py-1.5 text-xs rounded transition-colors mb-0.5
                ${selected === panel.id
                  ? 'bg-purple-600/25 text-purple-200'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
            >
              {panel.title}
            </button>
          ))}
        </div>
      )}

      {expanded && plugin.panels.length === 0 && (
        <p className="ml-6 px-3 py-1 text-xs text-gray-600">No panels</p>
      )}
    </div>
  )
}

function PanelViewer({ panel, plugin }: { panel: PluginPanel; plugin: Plugin }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div>
          <h3 className="text-sm font-medium text-white">{panel.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{plugin.name} · v{plugin.version}</p>
        </div>
        {panel.url && (
          <button
            onClick={() => window.open(panel.url, '_blank')}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors"
          >
            Open externally ↗
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0">
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
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            This panel has no content configured.
          </div>
        )}
      </div>
    </div>
  )
}

function ExtensionInfo(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full px-10 text-center gap-4">
      <span className="text-5xl opacity-20">⬡</span>
      <div>
        <h3 className="text-sm font-semibold text-gray-300">Podscape Plugin SDK</h3>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed max-w-sm">
          Extend Podscape with custom panels. Create a directory in{' '}
          <code className="font-mono text-gray-400">~/.podscape/plugins/</code> with a{' '}
          <code className="font-mono text-gray-400">package.json</code> like:
        </p>
        <pre className="mt-4 text-left text-xs bg-gray-800/80 border border-white/10 rounded-lg p-4 font-mono text-gray-300 max-w-sm">
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
  )
}
