import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { ExecTarget } from '../store'
import { useAppStore } from '../store'
import { getTerminalTheme, TERM_FONT } from '../utils/terminalTheme'


interface Props {
  target: ExecTarget
  onClose: () => void
}

export default function ExecPanel({ target, onClose }: Props): JSX.Element {
  const { selectedContext, theme } = useAppStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const offDataRef = useRef<(() => void) | null>(null)
  const offExitRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !selectedContext) return

    const term = new XTerm({
      theme: getTerminalTheme(theme === 'dark'),
      fontFamily: TERM_FONT,
      fontSize: 12,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      allowTransparency: true
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()
    xtermRef.current = term

    // Start exec session
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

  // Theme update — no session reinit
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = getTerminalTheme(theme === 'dark')
    }
  }, [theme])

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex flex-col p-8 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col flex-1 bg-white dark:bg-slate-950 rounded-3xl overflow-hidden shadow-2xl border border-white/20 dark:border-slate-800 animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-full uppercase tracking-widest leading-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Exec
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-white font-mono truncate max-w-xs">
              {target.pod}
              {target.container && <span className="text-slate-400 dark:text-slate-600 ml-1">/ {target.container}</span>}
            </span>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              @{target.namespace}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:block text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-tighter italic">
              Press Ctrl+D to exit
            </span>
            <button
              onClick={() => {
                if (ptyIdRef.current) window.exec.kill(ptyIdRef.current).catch(() => { })
                onClose()
              }}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm transition-all active:scale-95"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Terminal */}
        <div ref={containerRef} className="flex-1 min-h-0 bg-white dark:bg-slate-950 p-4" />
      </div>
    </div>
  )
}
