import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { ExecTarget } from '../store'
import { useAppStore } from '../store'
import { getTerminalTheme, TERM_FONT } from '../utils/terminalTheme'
import { Upload, Download, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

interface Props {
  target: ExecTarget
  onClose: () => void
}

type PanelMode = 'idle' | 'upload' | 'download'
type TransferPhase = 'idle' | 'running' | 'done' | 'error'

interface TransferState {
  phase: TransferPhase
  message: string
}

/** Extract the basename from a local file path (works for both / and \ separators). */
function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
}

export default function ExecPanel({ target, onClose }: Props): JSX.Element {
  const { selectedContext, theme } = useAppStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const offDataRef = useRef<(() => void) | null>(null)
  const offExitRef = useRef<(() => void) | null>(null)

  // ── File transfer state ────────────────────────────────────────────────────
  const [panelMode, setPanelMode] = useState<PanelMode>('idle')
  const [localPath, setLocalPath] = useState('')
  const [remotePath, setRemotePath] = useState('')
  const [transfer, setTransfer] = useState<TransferState>({ phase: 'idle', message: '' })

  // ── Terminal setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container || !selectedContext) return

    const term = new XTerm({
      theme: getTerminalTheme(theme === 'dark'),
      fontFamily: TERM_FONT,
      fontSize: 13,
      lineHeight: 1.6,
      letterSpacing: 0.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowTransparency: false,
      drawBoldTextInBrightColors: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()
    xtermRef.current = term

    window.exec.start(selectedContext, target.namespace, target.pod, target.container)
      .then(ptyId => {
        ptyIdRef.current = ptyId
        offDataRef.current = window.exec.onData(ptyId, data => term.write(data))
        offExitRef.current = window.exec.onExit(ptyId, () => {
          term.write('\r\n\x1b[38;5;244m[Process exited]\x1b[0m\r\n')
        })
        term.onData(data => window.exec.write(ptyId, data))
      })
      .catch(err => {
        term.write(`\x1b[31mError: ${err.message}\x1b[0m\r\n`)
      })

    const ro = new ResizeObserver(() => {
      fit.fit()
      if (ptyIdRef.current) {
        window.exec.resize(ptyIdRef.current, term.cols, term.rows)
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      offDataRef.current?.()
      offExitRef.current?.()
      if (ptyIdRef.current) window.exec.kill(ptyIdRef.current).catch(() => { })
      term.dispose()
    }
  }, [target.pod, target.container]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = getTerminalTheme(theme === 'dark')
    }
  }, [theme])

  // ── File transfer handlers ─────────────────────────────────────────────────

  const resetTransfer = () => {
    setTransfer({ phase: 'idle', message: '' })
    setLocalPath('')
    setRemotePath('')
  }

  const handleOpenUploadPanel = async () => {
    const picked = await window.dialog.showOpenFile()
    if (!picked) return
    setLocalPath(picked)
    setRemotePath(`/tmp/${basename(picked)}`)
    setTransfer({ phase: 'idle', message: '' })
    setPanelMode('upload')
  }

  const handleOpenDownloadPanel = () => {
    setRemotePath('')
    setTransfer({ phase: 'idle', message: '' })
    setPanelMode('download')
  }

  const handleClosePanel = () => {
    setPanelMode('idle')
    resetTransfer()
  }

  const handleUpload = async () => {
    if (!selectedContext || !localPath) return

    const pathError = validateRemotePath(remotePath)
    if (pathError) {
      setTransfer({ phase: 'error', message: pathError.message })
      return
    }

    setTransfer({ phase: 'running', message: `Uploading ${basename(localPath)}…` })
    try {
      await window.kubectl.copyToContainer(
        selectedContext, target.namespace, target.pod, target.container,
        localPath, remotePath
      )
      setTransfer({ phase: 'done', message: `Uploaded to ${remotePath}` })
    } catch (err) {
      setTransfer({ phase: 'error', message: (err as Error).message })
    }
  }

  const handleDownload = async () => {
    if (!selectedContext) return

    const pathError = validateRemotePath(remotePath)
    if (pathError) {
      setTransfer({ phase: 'error', message: pathError.message })
      return
    }

    const savePath = await window.dialog.showSaveFile(basename(remotePath))
    if (!savePath) return

    setTransfer({ phase: 'running', message: `Downloading ${basename(remotePath)}…` })
    try {
      await window.kubectl.copyFromContainer(
        selectedContext, target.namespace, target.pod, target.container,
        remotePath, savePath
      )
      setTransfer({ phase: 'done', message: `Saved to ${savePath}` })
    } catch (err) {
      setTransfer({ phase: 'error', message: (err as Error).message })
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-[#0a0c10]/60 backdrop-blur-md flex flex-col p-4 md:p-12 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col flex-1 bg-white dark:bg-[hsl(var(--bg-dark))] rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 animate-in slide-in-from-bottom-4 duration-300">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-8 py-5 bg-white/5 border-b border-white/5 shrink-0 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full uppercase tracking-[0.2em] leading-none ring-1 ring-emerald-500/20 shadow-[0_0_15px_rgba(52,211,153,0.1)]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Terminal
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-white font-mono truncate max-w-sm">
              {target.pod}
              {target.container && <span className="text-slate-500 ml-2 font-medium">/ {target.container}</span>}
            </span>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">
              {target.namespace}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden lg:block text-[10px] font-black text-slate-500 uppercase tracking-widest italic opacity-50">
              Ctrl+D to exit session
            </span>

            {/* Upload button */}
            <button
              onClick={handleOpenUploadPanel}
              title="Upload file to container"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${panelMode === 'upload'
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : 'bg-white/5 text-slate-400 hover:text-blue-400 border-white/10 hover:border-blue-500/30 hover:bg-blue-500/10'
                }`}
            >
              <Upload size={12} />
              Upload
            </button>

            {/* Download button */}
            <button
              onClick={handleOpenDownloadPanel}
              title="Download file from container"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${panelMode === 'download'
                ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
                : 'bg-white/5 text-slate-400 hover:text-violet-400 border-white/10 hover:border-violet-500/30 hover:bg-violet-500/10'
                }`}
            >
              <Download size={12} />
              Download
            </button>

            {/* Close */}
            <button
              onClick={() => {
                if (ptyIdRef.current) window.exec.kill(ptyIdRef.current).catch(() => { })
                onClose()
              }}
              className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white bg-white/5 border border-white/10 rounded-2xl shadow-xl transition-all active:scale-90 hover:bg-red-500/20 hover:border-red-500/30 group"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="group-hover:rotate-90 transition-transform"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* ── File transfer panel ── */}
        {panelMode !== 'idle' && (
          <div className={`shrink-0 px-8 py-4 border-b border-white/5 animate-in slide-in-from-top-2 duration-200 ${panelMode === 'upload' ? 'bg-blue-500/5' : 'bg-violet-500/5'}`}>
            <div className="flex items-end gap-4 flex-wrap">

              {panelMode === 'upload' && (
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Local File</label>
                  <div className="text-[11px] font-mono text-slate-300 bg-white/5 border border-white/10 rounded-xl px-3 py-2 truncate" title={localPath}>
                    {localPath ? basename(localPath) : '—'}
                  </div>
                </div>
              )}

              <div className="flex-1 min-w-[220px]">
                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                  {panelMode === 'upload' ? 'Destination Path in Container' : 'Remote Path in Container'}
                </label>
                <input
                  type="text"
                  value={remotePath}
                  onChange={e => setRemotePath(e.target.value)}
                  placeholder="/app/config.yaml"
                  spellCheck={false}
                  className="w-full text-[11px] font-mono text-slate-200 bg-white/5 border border-white/10 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500/40 placeholder:text-slate-600"
                  onKeyDown={e => { if (e.key === 'Enter') panelMode === 'upload' ? handleUpload() : handleDownload() }}
                  autoFocus
                />
              </div>

              <div className="flex items-center gap-2 pb-0.5">
                <button
                  onClick={panelMode === 'upload' ? handleUpload : handleDownload}
                  disabled={transfer.phase === 'running'}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 ${panelMode === 'upload'
                    ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20'
                    : 'bg-violet-600 text-white hover:bg-violet-500 shadow-lg shadow-violet-500/20'
                    }`}
                >
                  {transfer.phase === 'running'
                    ? <><Loader2 size={12} className="animate-spin" /> Transferring…</>
                    : panelMode === 'upload'
                      ? <><Upload size={12} /> Upload</>
                      : <><Download size={12} /> Download</>
                  }
                </button>
                <button
                  onClick={handleClosePanel}
                  disabled={transfer.phase === 'running'}
                  className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
                >
                  <X size={12} />
                </button>
              </div>
            </div>

            {/* Status line */}
            {transfer.phase !== 'idle' && (
              <div className={`mt-3 flex items-center gap-2 text-[10px] font-bold ${transfer.phase === 'done' ? 'text-emerald-400'
                : transfer.phase === 'error' ? 'text-red-400'
                  : 'text-slate-400 animate-pulse'
                }`}>
                {transfer.phase === 'done' && <CheckCircle2 size={12} />}
                {transfer.phase === 'error' && <AlertCircle size={12} />}
                {transfer.phase === 'running' && <Loader2 size={12} className="animate-spin" />}
                {transfer.message}
              </div>
            )}
          </div>
        )}

        {/* ── Terminal ── */}
        <div ref={containerRef} className="flex-1 min-h-0 bg-[#0d1117] p-5" />
      </div>
    </div>
  )
}

/** Client-side mirror of the main-process validation (instant feedback, no IPC round-trip). */
function validateRemotePath(path: string): Error | null {
  const trimmed = path.trim()
  if (!trimmed) return new Error('Remote path must not be empty.')
  if (!trimmed.startsWith('/')) return new Error('Remote path must be absolute (start with /).')
  if (trimmed.split('/').some(seg => seg === '..')) {
    return new Error('Remote path must not contain ".." segments.')
  }
  return null
}
