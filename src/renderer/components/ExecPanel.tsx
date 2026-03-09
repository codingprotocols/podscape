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
    <div className="fixed inset-0 z-50 bg-[#0a0c10]/60 backdrop-blur-md flex flex-col p-4 md:p-12 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-col flex-1 bg-white dark:bg-[hsl(var(--bg-dark))] rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
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
          <div className="flex items-center gap-6">
            <span className="hidden lg:block text-[10px] font-black text-slate-500 uppercase tracking-widest italic opacity-50">
              Ctrl+D to exit session
            </span>
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

        {/* Terminal */}
        <div ref={containerRef} className="flex-1 min-h-0 bg-[#0a0c10] p-6 shadow-[inset_0_0_40px_rgba(0,0,0,0.4)]" />
      </div>
    </div>
  )
}
