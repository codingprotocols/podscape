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
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{sec.metadata.name}</h3>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
          {sec.metadata.namespace} · {sec.type ?? 'Opaque'} · {formatAge(sec.metadata.creationTimestamp)} ago
        </p>
      </div>

      {/* Security notice */}
      <div className="mx-6 mt-4 px-4 py-3 bg-orange-500/5 border border-orange-500/20 rounded-2xl shrink-0 shadow-[inset_0_0_12px_rgba(249,115,22,0.05)]">
        <p className="text-[11px] font-medium text-orange-400 leading-relaxed">
          <span className="font-black uppercase tracking-widest mr-2">Security Note:</span>
          Values are hidden by default. Click <strong className="font-black underline underline-offset-4 decoration-orange-500/50">Reveal</strong> to decrypt and display individual keys.
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
                <div key={key} className="bg-white/[0.03] border border-slate-100 dark:border-white/5 rounded-2xl overflow-hidden transition-all hover:bg-white/[0.05]">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5 bg-white/5">
                    <span className="text-[11px] font-black font-mono text-slate-700 dark:text-slate-300 uppercase tracking-widest">{key}</span>
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
        <div className="px-6 py-5 border-t border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Labels</h4>
          <div className="flex flex-wrap gap-2 px-1">
            {Object.entries(sec.metadata.labels).map(([k, v]) => (
              <span key={k} className="text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-lg font-mono">
                {k}={v}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
