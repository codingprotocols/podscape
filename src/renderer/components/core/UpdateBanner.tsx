import React, { useEffect, useState } from 'react'
import { Download, RefreshCw, X, AlertTriangle } from 'lucide-react'

type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

export default function UpdateBanner(): JSX.Element | null {
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [visible, setVisible] = useState(false)

  // Wire up updater events. Each handler sets visible:true so the slide-in
  // animation fires whenever a new state arrives (including after dismiss).
  useEffect(() => {
    const updater = window.updater
    if (!updater) return

    const offs = [
      updater.onAvailable((info) => {
        setUpdate({ status: 'available', version: info.version })
        setDismissed(false)
        setVisible(true)
      }),
      updater.onProgress((p) => {
        // Ensure the banner is visible when download progress is reported.
        setVisible(true)
        setUpdate((prev) => {
          const next = Math.round(p.percent)
          if (prev.status === 'downloading' && prev.percent === next) {
            return prev
          }
          return { status: 'downloading', percent: next }
        })
      }),
      updater.onDownloaded((info) => {
        setUpdate({ status: 'ready', version: info.version })
        setDismissed(false)
        setVisible(true)
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  if (dismissed || update.status === 'idle') return null

  const baseClass = `fixed bottom-6 right-6 z-[10002] w-[300px] rounded-xl shadow-2xl
    border transition-all duration-300 ease-out
    ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`

  const dismissBtn = (
    <button
      aria-label="Dismiss"
      onClick={() => setDismissed(true)}
      className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
    >
      <X size={13} />
    </button>
  )

  if (update.status === 'error') {
    return (
      <div className={`${baseClass} bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-800/50`}>
        <div className="flex items-start gap-3 p-4">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <AlertTriangle size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-slate-800 dark:text-white">Update check failed</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed truncate">{update.message}</p>
          </div>
          {dismissBtn}
        </div>
      </div>
    )
  }

  if (update.status === 'available') {
    return (
      <div className={`${baseClass} bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-800/50`}>
        <div className="flex items-start gap-3 p-4 pb-3">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Download size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-slate-800 dark:text-white">Update available</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Podscape {update.version}</p>
          </div>
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={() => setDismissed(true)}
            className="flex-1 px-3 py-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-colors"
          >
            Later
          </button>
          <button
            onClick={async () => {
              try {
                await window.updater?.download()
              } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Update download failed.'
                setUpdate({ status: 'error', message })
              }
            }}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg transition-colors"
          >
            <Download size={12} />
            Download
          </button>
        </div>
      </div>
    )
  }

  if (update.status === 'downloading') {
    return (
      <div className={`${baseClass} bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-800/50`}>
        <div className="flex items-start gap-3 p-4">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Download size={15} className="animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-slate-800 dark:text-white">Downloading update…</p>
            <div className="mt-2 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${update.percent}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{update.percent}%</p>
          </div>
        </div>
      </div>
    )
  }

  if (update.status === 'ready') {
    return (
      <div className={`${baseClass} bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-800/50 ring-2 ring-emerald-500/20`}>
        <div className="flex items-start gap-3 p-4">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <RefreshCw size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-slate-800 dark:text-white">Ready to install</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Podscape {update.version}</p>
          </div>
          {dismissBtn}
        </div>
        <div className="px-4 pb-4">
          <button
            onClick={async () => {
              try {
                await window.updater?.install()
              } catch (err: unknown) {
                const message =
                  err instanceof Error && err.message
                    ? err.message
                    : 'Failed to install update.'
                setUpdate({ status: 'error', message })
              }
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg transition-colors"
          >
            <RefreshCw size={12} />
            Restart & Install
          </button>
        </div>
      </div>
    )
  }

  return null
}
