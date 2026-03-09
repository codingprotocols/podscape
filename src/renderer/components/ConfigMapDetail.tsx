import React, { useState, useEffect } from 'react'
import type { KubeConfigMap } from '../types'
import { formatAge } from '../types'
import YAMLViewer from './YAMLViewer'

interface Props { configMap: KubeConfigMap }

export default function ConfigMapDetail({ configMap: cm }: Props): JSX.Element {
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
    <div className="flex flex-col w-full h-full">
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{cm.metadata.name}</h3>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
          {cm.metadata.namespace} · {entries.length} key{entries.length !== 1 ? 's' : ''} · {formatAge(cm.metadata.creationTimestamp)} ago
        </p>
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
                      ${selected === key ? 'bg-blue-600/20 text-blue-400 shadow-[inset_0_0_12px_rgba(59,130,246,0.1)]' : 'text-slate-400 dark:text-slate-500 hover:bg-white/5 hover:text-slate-700 dark:hover:text-slate-200'}`}
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
    </div>
  )
}
