import React from 'react'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import CommandPalette from './CommandPalette'
import TourOverlay from './TourOverlay'
import ExecPanel from '../panels/ExecPanel'



export default function OverlayManager(): JSX.Element {
  const {
    showTour,
    setShowTour,
    execSessions,
    section,
    error,
    clearError,
    refresh,
  } = useAppStore(useShallow(s => ({
    showTour: s.showTour,
    setShowTour: s.setShowTour,
    execSessions: s.execSessions,
    section: s.section,
    error: s.error,
    clearError: s.clearError,
    refresh: s.refresh,
  })))



  const handleTourDone = async () => {
    setShowTour(false)
    try {
      const s = await window.settings.get()
      await window.settings.set({ ...s, tourCompleted: true })
    } catch (err) {
      console.error('Failed to save tour status:', err)
    }
  }

  return (
    <>
      <CommandPalette />
      {showTour && <TourOverlay onDone={handleTourDone} />}
      
      {/* Full-screen exec overlay — shown when sessions are open but user is not in multi-terminal section */}
      {execSessions.length > 0 && section !== 'multi-terminal' && <ExecPanel />}

      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 right-4 z-[9999] animate-in slide-in-from-top duration-300">
          <div className="bg-[#1e1e2e] text-white px-5 py-4 rounded-2xl shadow-2xl flex items-start gap-3 max-w-sm border border-red-500/40">
            <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-1">Error</p>
              <p className="text-sm text-slate-200 leading-snug break-words">{error}</p>
              <button
                onClick={() => { clearError(); refresh() }}
                className="mt-2.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
              >
                Retry
              </button>
            </div>
            <button onClick={clearError} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors mt-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

