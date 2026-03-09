import React, { useState } from 'react'
import type { KubeDeployment } from '../types'
import { useAppStore } from '../store'

interface Props {
  deployment: KubeDeployment
  onClose: () => void
}

export default function ScaleDialog({ deployment: d, onClose }: Props): JSX.Element {
  const { scaleDeployment } = useAppStore()
  const current = d.spec.replicas ?? 0
  const [replicas, setReplicas] = useState(String(current))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const parsed = parseInt(replicas, 10)
  const valid = !isNaN(parsed) && parsed >= 0 && parsed <= 100
  const isChanged = valid && parsed !== current

  const handleScale = async () => {
    if (!valid) return
    setPending(true)
    setError('')
    try {
      await scaleDeployment(d.metadata.name, parsed, d.metadata.namespace)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0c10]/60 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-[2rem] shadow-2xl border border-white/10 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-white/5 bg-white/5 shrink-0 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">Scale Resource</h3>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-500 mt-1 font-mono uppercase truncate max-w-[200px]">{d.metadata.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 text-slate-500 transition-all active:scale-90">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-8 py-10 space-y-8">
          <div className="text-center">
            <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] mb-6">Target Replicas</div>

            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => setReplicas(r => String(Math.max(0, parseInt(r) - 1)))}
                className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-90"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M5 12h14" /></svg>
              </button>

              <div className="relative group">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={replicas}
                  onChange={e => setReplicas(e.target.value)}
                  className="w-24 text-4xl font-black bg-transparent text-slate-900 dark:text-white text-center focus:outline-none focus:ring-0"
                />
                <div className="absolute -bottom-2 left-0 right-0 h-0.5 bg-blue-500/20 scale-x-0 group-focus-within:scale-x-100 transition-transform origin-center" />
              </div>

              <button
                onClick={() => setReplicas(r => String(Math.min(100, (parseInt(r) || 0) + 1)))}
                className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-90"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>
          </div>

          {parsed === 0 && (
            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <p className="text-[10px] font-bold text-amber-500/90 leading-tight uppercase tracking-tight">Warning: Scaling to 0 will stop all running pods for this resource.</p>
            </div>
          )}

          {error && (
            <p className="text-[10px] font-black text-red-400 mt-2 text-center uppercase tracking-widest">{error}</p>
          )}
        </div>

        <div className="flex gap-4 px-8 py-6 border-t border-white/5 bg-white/5">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/5 transition-all active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={handleScale}
            disabled={!isChanged || pending}
            className="flex-1 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white shadow-[0_0_20px_rgba(59,130,246,0.2)] transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? 'Scaling…' : `Confirm Scale`}
          </button>
        </div>
      </div>
    </div>
  )
}
