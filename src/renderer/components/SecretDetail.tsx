import React, { useState } from 'react'
import type { KubeSecret } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'

interface Props { secret: KubeSecret }

type KeyState =
  | { status: 'hidden' }
  | { status: 'loading' }
  | { status: 'value'; text: string }
  | { status: 'error'; msg: string }

export default function SecretDetail({ secret: sec }: Props): JSX.Element {
  const { selectedContext } = useAppStore()
  const entries = Object.entries(sec.data ?? {})
  const [keyStates, setKeyStates] = useState<Map<string, KeyState>>(new Map())

  const setKeyState = (key: string, state: KeyState) => {
    setKeyStates(prev => new Map(prev).set(key, state))
  }

  const handleToggle = async (key: string) => {
    const current = keyStates.get(key) ?? { status: 'hidden' }
    if (current.status !== 'hidden') {
      // Hide it
      setKeyState(key, { status: 'hidden' })
      return
    }

    // Reveal — fetch actual value
    if (!selectedContext || !sec.metadata.namespace) return
    setKeyState(key, { status: 'loading' })
    try {
      const text = await window.kubectl.getSecretValue(
        selectedContext,
        sec.metadata.namespace,
        sec.metadata.name,
        key
      )
      setKeyState(key, { status: 'value', text })
    } catch (err) {
      setKeyState(key, { status: 'error', msg: (err as Error).message ?? 'Failed to reveal' })
    }
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white font-mono truncate">{sec.metadata.name}</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          {sec.metadata.namespace} · {sec.type ?? 'Opaque'} · {formatAge(sec.metadata.creationTimestamp)} ago
        </p>
      </div>

      {/* Security notice */}
      <div className="mx-4 mt-3 px-3 py-2 bg-yellow-900/30 border border-yellow-500/25 rounded shrink-0">
        <p className="text-xs text-yellow-300">
          Values are hidden by default. Click <strong>Reveal</strong> to decrypt and display individual keys.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No data keys</p>
        ) : (
          <div className="space-y-2">
            {entries.map(([key]) => {
              const state = keyStates.get(key) ?? { status: 'hidden' }
              const isRevealed = state.status !== 'hidden'
              return (
                <div key={key} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-700">
                    <span className="text-xs font-mono text-slate-700 dark:text-slate-200 font-medium">{key}</span>
                    <button
                      onClick={() => handleToggle(key)}
                      disabled={state.status === 'loading'}
                      title={isRevealed ? 'Hide value' : 'Reveal value'}
                      className="text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:text-slate-300 transition-colors text-xs px-1.5 py-0.5 rounded hover:bg-white/5 disabled:opacity-50"
                    >
                      {state.status === 'loading'
                        ? '⏳ Loading…'
                        : isRevealed
                          ? '🙈 Hide'
                          : '👁 Reveal'}
                    </button>
                  </div>
                  <div className="px-3 py-2">
                    {state.status === 'hidden' && (
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tracking-widest">
                        {'•'.repeat(16)}
                      </p>
                    )}
                    {state.status === 'loading' && (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 border border-slate-400 border-t-blue-500 rounded-full animate-spin" />
                        <span className="text-xs text-slate-500 dark:text-slate-400">Fetching…</span>
                      </div>
                    )}
                    {state.status === 'value' && (
                      <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all">
                        {state.text || '(empty)'}
                      </pre>
                    )}
                    {state.status === 'error' && (
                      <p className="text-xs text-red-400">{state.msg}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Labels */}
      {sec.metadata.labels && Object.keys(sec.metadata.labels).length > 0 && (
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <h4 className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Labels</h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(sec.metadata.labels).map(([k, v]) => (
              <span key={k} className="text-xs bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800 px-2 py-0.5 rounded font-mono">
                {k}={v}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
