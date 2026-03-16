import React, { useState } from 'react'
import { useAppStore } from '../store'

interface Props {
  name: string
  kind: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export default function DeleteConfirm({ name, kind, onConfirm, onCancel }: Props): JSX.Element {
  const { isProduction } = useAppStore()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [typed, setTyped] = useState('')

  const confirmed = typed === name

  const handleDelete = async () => {
    if (!confirmed) return
    setPending(true)
    setError('')
    try {
      await onConfirm()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0c10]/60 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-[2rem] shadow-2xl border border-white/10 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-8 py-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mx-auto mb-6 shadow-[0_0_20px_rgba(239,44,44,0.15)] ring-1 ring-red-500/20">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" /></svg>
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Delete {kind}</h3>
          
          {isProduction && (
            <div className="bg-red-600/10 border border-red-500/20 rounded-xl py-3 px-4 mb-6 animate-pulse">
              <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">⚠️ Critical Production Action</p>
            </div>
          )}

          <p className="text-sm font-bold text-slate-500 dark:text-slate-500 leading-relaxed uppercase tracking-widest mb-6">
            Type <span className="text-red-400 font-mono italic lowercase tracking-normal">{name}</span> to confirm.
          </p>

          <input
            autoFocus
            type="text"
            placeholder={name}
            value={typed}
            onChange={e => setTyped(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && confirmed) handleDelete() }}
            className="w-full bg-white/[0.03] text-slate-900 dark:text-white text-xs rounded-xl px-4 py-3 border border-white/5 focus:outline-none focus:ring-2 focus:ring-red-500/40 text-center font-mono placeholder-white/10"
          />
          {error && <p className="text-[10px] font-bold text-red-400 mt-4 uppercase tracking-widest">{error}</p>}
        </div>

        <div className="flex gap-4 px-8 py-6 border-t border-white/5 bg-white/5">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/5 transition-all active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!confirmed || pending}
            className="flex-1 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {pending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
