import React, { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import { isMac } from '../../utils/platform'

// On macOS with hiddenInset titlebar the traffic-light buttons are inset into
// the content area at the top-left (~72 px wide). Push banner content past them.
const macPadding = isMac ? 'pl-[80px]' : ''

type UpdateState =
  | { status: 'idle' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }

export default function UpdateBanner(): JSX.Element | null {
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const w = window.updater
    if (!w) return

    const offs = [
      w.onAvailable((info) => setUpdate({ status: 'available', version: info.version })),
      w.onProgress((p) => setUpdate((prev) => {
        const next = Math.round(p.percent)
        return prev.status === 'downloading' && prev.percent === next
          ? prev
          : { status: 'downloading', percent: next }
      })),
      w.onDownloaded((info) => {
        setUpdate({ status: 'ready', version: info.version })
        // Always re-show the banner when the download completes, even if the user
        // dismissed the "available" notice — they must see the Ready state to install.
        setDismissed(false)
      }),
      w.onError((msg) => setUpdate({ status: 'error', message: msg })),
    ]
    return () => offs.forEach((off) => off())
  }, [])

  if (dismissed || update.status === 'idle') return null

  if (update.status === 'error') {
    return (
      <div className={`fixed inset-x-0 top-0 z-[10002] flex items-center gap-3 px-4 py-2 bg-amber-500 text-white text-xs font-medium shadow-lg ${macPadding}`}>
        <span className="flex-1">Update check failed: {update.message}</span>
        <button aria-label="Dismiss" onClick={() => setDismissed(true)} className="p-0.5 hover:bg-white/20 rounded transition-colors">
          <X size={14} />
        </button>
      </div>
    )
  }

  if (update.status === 'available') {
    return (
      <div className={`fixed inset-x-0 top-0 z-[10002] flex items-center gap-3 px-4 py-2 bg-blue-600 text-white text-xs font-medium shadow-lg ${macPadding}`}>
        <span className="flex-1">Podscape {update.version} is available.</span>
        <button
          onClick={() => window.updater?.download()}
          className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded font-bold transition-colors"
        >
          <Download size={12} />
          Download
        </button>
        <button aria-label="Dismiss" onClick={() => setDismissed(true)} className="p-0.5 hover:bg-white/20 rounded transition-colors">
          <X size={14} />
        </button>
      </div>
    )
  }

  if (update.status === 'downloading') {
    return (
      <div className={`fixed inset-x-0 top-0 z-[10002] flex items-center gap-3 px-4 py-2 bg-blue-600 text-white text-xs font-medium shadow-lg ${macPadding}`}>
        <span>Downloading update… {update.percent}%</span>
        <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-300"
            style={{ width: `${update.percent}%` }}
          />
        </div>
      </div>
    )
  }

  if (update.status === 'ready') {
    return (
      <div className={`fixed inset-x-0 top-0 z-[10002] flex items-center gap-3 px-4 py-2 bg-emerald-600 text-white text-xs font-medium shadow-lg ${macPadding}`}>
        <span className="flex-1">Podscape {update.version} is ready to install.</span>
        <button
          onClick={() => window.updater?.install()}
          className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded font-bold transition-colors"
        >
          <RefreshCw size={12} />
          Restart &amp; Install
        </button>
      </div>
    )
  }

  return null
}
