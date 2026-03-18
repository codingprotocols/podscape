import React, { useState, useEffect } from 'react'
import type { KubeConfigMap } from '../types'
import { formatAge } from '../types'
import YAMLViewer from './YAMLViewer'
import { FileCode, X, Activity } from 'lucide-react'
import { useYAMLEditor } from '../hooks/useYAMLEditor'

interface Props { configMap: KubeConfigMap }

export default function ConfigMapDetail({ configMap: cm }: Props): JSX.Element {
  const { yaml, loading: yamlLoading, error: yamlError, open: openYAML, apply: applyYAML, close: closeYAML } = useYAMLEditor()
  const entries = Object.entries(cm.data ?? {})
  const [selected, setSelected] = useState<string | null>(entries[0]?.[0] ?? null)

  // Reset selected key when switching to a different ConfigMap
  useEffect(() => {
    const firstKey = Object.keys(cm.data ?? {})[0] ?? null
    setSelected(firstKey)
  }, [cm.metadata.name, cm.metadata.namespace])

  const selectedValue = selected ? (cm.data?.[selected] ?? '') : ''
  const isJSON = (() => { try { JSON.parse(selectedValue); return selectedValue.trim().length > 0 } catch { return false } })()
  const isYAML = !isJSON && /^[a-zA-Z_][\w.-]*\s*:/m.test(selectedValue)

  return (
    <div className="flex flex-col w-full h-full relative">
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{cm.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
              {cm.metadata.namespace} · {entries.length} key{entries.length !== 1 ? 's' : ''} · {formatAge(cm.metadata.creationTimestamp)} ago
            </p>
          </div>
          <button
            onClick={() => openYAML('configmap', cm.metadata.name, false, cm.metadata.namespace)}
            disabled={yamlLoading}
            className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2 group disabled:opacity-50"
          >
            <FileCode size={14} className="group-hover:text-blue-400 transition-colors" />
            {yamlLoading ? 'Loading...' : 'YAML'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Key list */}
        <div className="w-44 shrink-0 border-r border-slate-100 dark:border-white/5 overflow-y-auto bg-white/[0.02]">
          {entries.length === 0 ? (
            <p className="text-[10px] font-black text-slate-500 dark:text-slate-500 px-4 py-8 uppercase tracking-widest text-center opacity-40">No data keys</p>
          ) : (
            <ul className="py-2">
              {entries.map(([key]) => (
                <li key={key} className="px-2 mb-0.5">
                  <button
                    onClick={() => setSelected(key)}
                    className={`w-full text-left px-3 py-2 text-[11px] font-bold font-mono truncate transition-all rounded-lg
                      ${selected === key ? 'bg-blue-600/20 text-blue-400 shadow-[inset_0_0_12_px_rgba(59,130,246,0.1)]' : 'text-slate-400 dark:text-slate-500 hover:bg-white/5 hover:text-slate-700 dark:hover:text-slate-200'}`}
                    title={key}
                  >
                    {key}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Value viewer */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {selected ? (
            <>
              <div className="px-4 py-2 border-b border-slate-100 dark:border-white/5 bg-white/[0.05] backdrop-blur-md flex items-center justify-between shrink-0">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 font-mono truncate uppercase tracking-widest">{selected}</span>
                <span className="text-[10px] font-black text-slate-500 dark:text-slate-600 uppercase tracking-widest">
                  {selectedValue.split('\n').length} lines
                </span>
              </div>
              <div className="flex-1 min-h-0">
                {(isYAML || isJSON) ? (
                  <YAMLViewer content={selectedValue} />
                ) : (
                  <pre className="w-full h-full overflow-auto p-3 font-mono text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words bg-black/30">
                    {selectedValue}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400 text-sm">
              Select a key
            </div>
          )}
        </div>
      </div>

      {/* Premium YAML Modal */}
      {(yamlLoading || yaml !== null || yamlError !== null) && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                  {yamlLoading
                    ? <div className="w-4 h-4 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin" />
                    : <FileCode size={18} className="text-blue-500" />
                  }
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${cm.metadata.name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeYAML}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors focus:outline-none"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 min-h-0 bg-slate-950">
              {yamlError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                    <Activity size={20} className="text-red-400" />
                  </div>
                  <p className="text-sm font-bold text-red-400 uppercase tracking-widest">Failed to load manifest</p>
                  <pre className="text-xs text-slate-400 max-w-lg break-words whitespace-pre-wrap font-mono bg-white/5 p-4 rounded-xl border border-white/5">{yamlError}</pre>
                </div>
              ) : yamlLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : yaml !== null ? (
                <YAMLViewer
                  editable
                  content={yaml}
                  onSave={applyYAML}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
