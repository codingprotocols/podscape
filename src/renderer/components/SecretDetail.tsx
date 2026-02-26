import React, { useState } from 'react'
import type { KubeSecret } from '../types'
import { formatAge } from '../types'

interface Props { secret: KubeSecret }

function safeAtob(value: string): string {
  try { return atob(value) } catch { return value }
}

export default function SecretDetail({ secret: sec }: Props): JSX.Element {
  const entries = Object.entries(sec.data ?? {})
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  const toggle = (key: string) => {
    setRevealed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="flex flex-col w-[440px] min-w-[340px] border-l border-white/10 bg-gray-900/70 h-full">
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <h3 className="text-sm font-semibold text-white font-mono truncate">{sec.metadata.name}</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          {sec.metadata.namespace} · {sec.type ?? 'Opaque'} · {formatAge(sec.metadata.creationTimestamp)} ago
        </p>
      </div>

      {/* Security notice */}
      <div className="mx-4 mt-3 px-3 py-2 bg-yellow-900/30 border border-yellow-500/25 rounded shrink-0">
        <p className="text-xs text-yellow-300">
          Secret values are masked. Click the eye icon to reveal individual keys in this session only.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <p className="text-sm text-gray-500">No data keys</p>
        ) : (
          <div className="space-y-2">
            {entries.map(([key, value]) => (
              <div key={key} className="bg-gray-800/50 border border-white/8 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
                  <span className="text-xs font-mono text-gray-200 font-medium">{key}</span>
                  <button
                    onClick={() => toggle(key)}
                    title={revealed.has(key) ? 'Hide value' : 'Reveal value'}
                    className="text-gray-500 hover:text-gray-300 transition-colors text-xs px-1.5 py-0.5 rounded hover:bg-white/5"
                  >
                    {revealed.has(key) ? '🙈 Hide' : '👁 Reveal'}
                  </button>
                </div>
                <div className="px-3 py-2">
                  {revealed.has(key) ? (
                    <pre className="text-xs font-mono text-green-300 whitespace-pre-wrap break-all">
                      {value === '***MASKED***' ? '(value masked by server — use kubectl to view)' : safeAtob(value)}
                    </pre>
                  ) : (
                    <p className="text-xs font-mono text-gray-600 tracking-widest">
                      {'•'.repeat(Math.min(24, value.length || 12))}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata */}
      {sec.metadata.labels && Object.keys(sec.metadata.labels).length > 0 && (
        <div className="px-4 py-3 border-t border-white/10 shrink-0">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Labels</h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(sec.metadata.labels).map(([k, v]) => (
              <span key={k} className="text-xs bg-gray-700/50 text-gray-300 border border-white/10 px-2 py-0.5 rounded font-mono">
                {k}={v}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
