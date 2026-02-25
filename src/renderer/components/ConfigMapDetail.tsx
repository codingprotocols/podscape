import React, { useState } from 'react'
import type { KubeConfigMap } from '../types'
import { formatAge } from '../types'
import YAMLViewer from './YAMLViewer'

interface Props { configMap: KubeConfigMap }

export default function ConfigMapDetail({ configMap: cm }: Props): JSX.Element {
  const entries = Object.entries(cm.data ?? {})
  const [selected, setSelected] = useState<string | null>(entries[0]?.[0] ?? null)

  const selectedValue = selected ? (cm.data?.[selected] ?? '') : ''
  const isYAML = selectedValue.trim().startsWith('{') || selectedValue.includes(':\n') || selectedValue.includes(': ')
  const isJSON = selectedValue.trim().startsWith('{') || selectedValue.trim().startsWith('[')

  return (
    <div className="flex flex-col w-[480px] min-w-[360px] border-l border-white/10 bg-gray-900/70 h-full">
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <h3 className="text-sm font-semibold text-white font-mono truncate">{cm.metadata.name}</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          {cm.metadata.namespace} · {entries.length} key{entries.length !== 1 ? 's' : ''} · {formatAge(cm.metadata.creationTimestamp)} ago
        </p>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Key list */}
        <div className="w-36 shrink-0 border-r border-white/10 overflow-y-auto bg-gray-900/50">
          {entries.length === 0 ? (
            <p className="text-xs text-gray-500 px-3 py-4">No data keys</p>
          ) : (
            <ul className="py-1">
              {entries.map(([key]) => (
                <li key={key}>
                  <button
                    onClick={() => setSelected(key)}
                    className={`w-full text-left px-3 py-2 text-xs font-mono truncate transition-colors
                      ${selected === key ? 'bg-blue-600/25 text-blue-200' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
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
              <div className="px-3 py-1.5 border-b border-white/10 bg-gray-900/80 flex items-center justify-between shrink-0">
                <span className="text-xs text-gray-400 font-mono truncate">{selected}</span>
                <span className="text-xs text-gray-600">
                  {selectedValue.split('\n').length} lines
                </span>
              </div>
              <div className="flex-1 min-h-0">
                {(isYAML || isJSON) ? (
                  <YAMLViewer content={selectedValue} />
                ) : (
                  <pre className="w-full h-full overflow-auto p-3 font-mono text-xs text-gray-200 whitespace-pre-wrap break-words bg-black/30">
                    {selectedValue}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Select a key
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
