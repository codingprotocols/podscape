import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { ExecSession } from '../../store'
import { useAppStore } from '../../store'
import { getTerminalTheme, TERM_FONT } from '../../utils/terminalTheme'
import { isMac } from '../../utils/platform'
import { Upload, Download, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

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

/** Client-side mirror of the main-process path validation. */
function validateRemotePath(path: string): Error | null {
  const trimmed = path.trim()
  if (!trimmed) return new Error('Remote path must not be empty.')
  if (!trimmed.startsWith('/')) return new Error('Remote path must be absolute (start with /).')
  if (trimmed.split('/').some(seg => seg === '..')) {
    return new Error('Remote path must not contain ".." segments.')
  }
  return null
}

// ── Single terminal tab (manages its own xterm + PTY lifecycle) ───────────────

interface ExecTabProps {
  session: ExecSession
  active: boolean
  theme: string
}

function ExecTab({ session, active, theme }: ExecTabProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef    = useRef<XTerm | null>(null)
  const ptyIdRef    = useRef<string | null>(null)
  const offDataRef  = useRef<(() => void) | null>(null)
  const offExitRef  = useRef<(() => void) | null>(null)
  const fitRef      = useRef<FitAddon | null>(null)

  const { selectedContext, closeExecTab } = useAppStore()

  // Mount xterm once
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
    fitRef.current   = fit

    // Prevent the browser from consuming Tab for focus navigation
    // so it reaches the PTY as a real tab-completion character.
    term.attachCustomKeyEventHandler(e => {
      if (e.key === 'Tab') e.preventDefault()
      return true
    })

    window.exec.start(selectedContext, session.target.namespace, session.target.pod, session.target.container)
      .then(ptyId => {
        ptyIdRef.current = ptyId
        offDataRef.current = window.exec.onData(ptyId, data => term.write(data))
        offExitRef.current = window.exec.onExit(ptyId, () => {
          term.write('\r\n\x1b[38;5;244m[Process exited]\x1b[0m\r\n')
          setTimeout(() => closeExecTab(session.id), 500)
        })
        term.onData(data => window.exec.write(ptyId, data))
      })
      .catch(err => {
        term.write(`\x1b[31mError: ${err.message}\x1b[0m\r\n`)
      })

    const ro = new ResizeObserver(() => {
      fit.fit()
      if (ptyIdRef.current) window.exec.resize(ptyIdRef.current, term.cols, term.rows)
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      offDataRef.current?.()
      offExitRef.current?.()
      if (ptyIdRef.current) window.exec.kill(ptyIdRef.current).catch(() => { })
      term.dispose()
    }
  }, [selectedContext, session.target, closeExecTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit when tab becomes active
  useEffect(() => {
    if (active && fitRef.current && xtermRef.current) {
      requestAnimationFrame(() => {
        fitRef.current?.fit()
        if (ptyIdRef.current) {
          window.exec.resize(ptyIdRef.current, xtermRef.current!.cols, xtermRef.current!.rows)
        }
      })
    }
  }, [active])

  // Update theme
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = getTerminalTheme(theme === 'dark')
    }
  }, [theme])

  return (
    <div
      className="absolute inset-0 bg-[#0d1117] p-5"
      style={{ display: active ? 'block' : 'none' }}
    >
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}

// ── Main ExecPanel (Isolated single session) ─────────────────────────────────

interface ExecPanelProps {
  embedded?: boolean
}

// ── ExecPanel ─────────────────────────────────────────────────────────────────

export function ExecPanel({ embedded }: ExecPanelProps): JSX.Element {
  const {
    execSessions, activeExecId,
    closeExec,
    theme, selectedContext
  } = useAppStore()

  const activeSession = execSessions.find(s => s.id === activeExecId) ?? execSessions[0]

  const [panelMode, setPanelMode]   = useState<PanelMode>('idle')
  const [localPath, setLocalPath]   = useState('')
  const [remotePath, setRemotePath] = useState('')
  const [transfer, setTransfer]     = useState<TransferState>({ phase: 'idle', message: '' })

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey

      if (isCmdOrCtrl && e.key === 'd') {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault()
          closeExec()
        }
      }

      if (e.key === 'Escape') {
        if (panelMode === 'idle') closeExec()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeExec, panelMode])

  // Reset file transfer panel when active tab changes
  useEffect(() => {
    setPanelMode('idle')
    setTransfer({ phase: 'idle', message: '' })
  }, [activeExecId])

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
    setTransfer({ phase: 'idle', message: '' })
  }

  const handleUpload = async () => {
    if (!selectedContext || !localPath || !activeSession) return
    const pathError = validateRemotePath(remotePath)
    if (pathError) { setTransfer({ phase: 'error', message: pathError.message }); return }
    setTransfer({ phase: 'running', message: `Uploading ${basename(localPath)}…` })
    try {
      await window.kubectl.copyToContainer(
        selectedContext, activeSession.target.namespace, activeSession.target.pod,
        activeSession.target.container, localPath, remotePath,
      )
      setTransfer({ phase: 'done', message: `Uploaded to ${remotePath}` })
    } catch (err) {
      setTransfer({ phase: 'error', message: (err as Error).message })
    }
  }

  const handleDownload = async () => {
    if (!selectedContext || !activeSession) return
    const pathError = validateRemotePath(remotePath)
    if (pathError) { setTransfer({ phase: 'error', message: pathError.message }); return }
    const savePath = await window.dialog.showSaveFile(basename(remotePath))
    if (!savePath) return
    setTransfer({ phase: 'running', message: `Downloading ${basename(remotePath)}…` })
    try {
      await window.kubectl.copyFromContainer(
        selectedContext, activeSession.target.namespace, activeSession.target.pod,
        activeSession.target.container, remotePath, savePath,
      )
      setTransfer({ phase: 'done', message: `Saved to ${savePath}` })
    } catch (err) {
      setTransfer({ phase: 'error', message: (err as Error).message })
    }
  }

  if (!activeSession) return null

  const content = (
    <div className={`flex flex-col flex-1 bg-white dark:bg-[hsl(var(--bg-dark))] ${embedded ? '' : 'rounded-[2rem] shadow-2xl border border-white/10 animate-in slide-in-from-bottom-4 duration-300'} overflow-hidden`}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-8 py-4 bg-white/5 border-b border-white/5 shrink-0 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full uppercase tracking-[0.2em] leading-none ring-1 ring-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Terminal
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-white font-mono truncate max-w-sm">
              {activeSession.target.pod}
              {activeSession.target.container && (
                <span className="text-slate-500 ml-2 font-medium">/ {activeSession.target.container}</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden lg:block text-[10px] font-black text-slate-500 uppercase tracking-widest italic opacity-50">
              {isMac ? 'Cmd+D' : 'Ctrl+D'} to exit
            </span>

<button
              onClick={handleOpenUploadPanel}
              title="Upload file to container"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                panelMode === 'upload'
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  : 'bg-white/5 text-slate-400 hover:text-blue-400 border-white/10 hover:border-blue-500/30 hover:bg-blue-500/10'
              }`}
            >
              <Upload size={12} />
              Upload
            </button>

            <button
              onClick={handleOpenDownloadPanel}
              title="Download file from container"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                panelMode === 'download'
                  ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
                  : 'bg-white/5 text-slate-400 hover:text-violet-400 border-white/10 hover:border-violet-500/30 hover:bg-violet-500/10'
              }`}
            >
              <Download size={12} />
              Download
            </button>

            <button
              onClick={closeExec}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all border border-red-500/20"
            >
              <X size={16} />
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
                  Path in Container
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
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 ${
                    panelMode === 'upload'
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
            {transfer.phase !== 'idle' && (
              <div className={`mt-3 flex items-center gap-2 text-[10px] font-bold ${
                transfer.phase === 'done' ? 'text-emerald-400'
                  : transfer.phase === 'error' ? 'text-red-400'
                  : 'text-slate-400 animate-pulse'
              }`}>
                {transfer.phase === 'done'    && <CheckCircle2 size={12} />}
                {transfer.phase === 'error'   && <AlertCircle size={12} />}
                {transfer.phase === 'running' && <Loader2 size={12} className="animate-spin" />}
                {transfer.message}
              </div>
            )}
          </div>
        )}

        {/* ── Terminal area ── */}
        <div className="flex-1 min-h-0 relative">
          <ExecTab
            session={activeSession}
            active={true}
            theme={theme}
          />
        </div>
    </div>
  )

  if (embedded) return content

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0c10]/60 backdrop-blur-md flex flex-col p-4 md:p-12 animate-in fade-in zoom-in-95 duration-200">
      {content}
    </div>
  )
}

export default ExecPanel
