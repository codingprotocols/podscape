import React, { useEffect, useState } from 'react'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import { ShieldCheck } from 'lucide-react'
import Sidebar from './Sidebar'
import UpdateBanner from './UpdateBanner'
import ErrorBoundary from './ErrorBoundary'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps): JSX.Element {
  const {
    section,
    setSection,
    kubeconfigOk,
    isProduction,
    securityScanning,
    scanInBackground,
  } = useAppStore(useShallow(s => ({
    section: s.section,
    setSection: s.setSection,
    kubeconfigOk: s.kubeconfigOk,
    isProduction: s.isProduction,
    securityScanning: s.securityScanning,
    scanInBackground: s.scanInBackground,
  })))

  const [sidecarCrashed, setSidecarCrashed] = useState(false)
  const [sidecarRestarting, setSidecarRestarting] = useState(false)

  useEffect(() => {
    const unlisten = (window as any).sidecar?.onCrashed(() => {
      setSidecarCrashed(true)
    })
    return () => { if (unlisten) unlisten() }
  }, [])

  const handleSidecarRestart = async () => {
    setSidecarRestarting(true)
    try {
      await (window as any).sidecar?.restart()
      setSidecarCrashed(false)
      window.location.reload()
    } catch (err) {
      console.error('Failed to restart sidecar:', err)
    } finally {
      setSidecarRestarting(false)
    }
  }

  return (
    <div className={`flex h-screen overflow-hidden bg-white dark:bg-[hsl(var(--bg-dark))] text-slate-900 dark:text-slate-100 transition-all duration-300 ${isProduction ? 'ring-inset ring-4 ring-red-500/50' : ''}`}>
      <UpdateBanner />

      {securityScanning && scanInBackground && section !== 'security' && (
        <button
          onClick={() => setSection('security')}
          className="fixed bottom-5 right-5 z-[9999] flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-900 dark:bg-slate-800 border border-emerald-500/30 shadow-2xl shadow-black/40 text-white text-[11px] font-bold hover:border-emerald-400/50 transition-all"
        >
          <div className="w-3.5 h-3.5 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin shrink-0" />
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          Security scan running…
          <span className="text-[10px] text-emerald-400 font-semibold">View →</span>
        </button>
      )}

      {sidecarCrashed && (
        <div className="fixed inset-x-0 top-0 z-[10001] flex items-center gap-3 px-4 py-2.5 bg-red-600 text-white text-xs font-medium shadow-lg">
          <span className="flex-1">Connection to cluster lost — the backend process exited unexpectedly.</span>
          <button
            onClick={handleSidecarRestart}
            disabled={sidecarRestarting}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded font-bold transition-colors disabled:opacity-50"
          >
            {sidecarRestarting ? 'Reconnecting…' : 'Reconnect'}
          </button>
        </div>
      )}

      {isProduction && (
        <div className="fixed top-0 left-1/2 -translate-x-1/2 z-[10000] pointer-events-none">
          <div className="bg-red-600 text-[10px] font-black tracking-[0.2em] text-white px-6 py-1 rounded-b-xl shadow-2xl border-x border-b border-red-500/50 animate-in slide-in-from-top duration-500">
            PRODUCTION CONTEXT ACTIVE
          </div>
        </div>
      )}

      {/* Left nav sidebar */}
      {kubeconfigOk && (
        <ErrorBoundary>
          <Sidebar />
        </ErrorBoundary>
      )}

      {/* Main content */}
      <div className="flex flex-1 min-w-0 min-h-0 bg-slate-50 dark:bg-[hsl(var(--bg-dark))]">
        {children}
      </div>
    </div>
  )
}
