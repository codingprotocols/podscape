import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../store'
import { getTerminalTheme, TERM_FONT } from '../utils/terminalTheme'

interface TermSession {
  id: string
  title: string
  ptyId: string | null
}

let sessionCounter = 1

export default function Terminal(): JSX.Element {
  const { selectedContext, selectedNamespace, theme } = useAppStore()
  const [sessions, setSessions] = useState<TermSession[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const addSession = () => {
    const title = `Shell ${sessionCounter++}`
    setSessions(prev => [...prev, { id: `s-${Date.now()}`, title, ptyId: null }])
    setActiveIdx(sessions.length)
  }

  const removeSession = (idx: number) => {
    setSessions(prev => {
      const s = prev[idx]
      if (s.ptyId) window.terminal.kill(s.ptyId).catch(() => { })
      return prev.filter((_, i) => i !== idx)
    })
    setActiveIdx(prev => Math.max(0, prev - 1))
  }

  const startRename = (idx: number, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingIdx(idx)
    setEditTitle(currentTitle)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  const commitRename = () => {
    if (editingIdx !== null && editTitle.trim()) {
      setSessions(prev => prev.map((s, i) => i === editingIdx ? { ...s, title: editTitle.trim() } : s))
    }
    setEditingIdx(null)
  }

  // Auto-create first session
  useEffect(() => {
    if (sessions.length === 0) {
      setSessions([{ id: 's-0', title: 'Shell 1', ptyId: null }])
      setActiveIdx(0)
    }
  }, [])

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-[#0d1117] dark:bg-[#0d1117] light:bg-white transition-colors duration-200">
      {/* Tab bar */}
      <div className="flex items-center shrink-0 h-11 px-3 gap-1 overflow-x-auto no-scrollbar
        bg-[#161b22] dark:bg-[#161b22] border-b border-[#30363d] dark:border-[#30363d]
        light:bg-slate-50 light:border-slate-200">
        {sessions.map((s, i) => (
          <div
            key={s.id}
            className={`group relative flex items-center gap-2 px-3.5 h-8 text-[10px] font-bold cursor-pointer rounded-lg transition-all select-none
              ${i === activeIdx
                ? 'bg-[#0d1117] text-[#e6edf3] shadow-sm ring-1 ring-[#30363d]'
                : 'text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]'}`}
            onClick={() => setActiveIdx(i)}
            onDoubleClick={e => startRename(i, s.title, e)}
            title="Double-click to rename"
          >
            {/* Active indicator dot */}
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${i === activeIdx ? 'bg-emerald-400' : 'bg-[#30363d] group-hover:bg-[#484f58]'}`} />

            {editingIdx === i ? (
              <input
                ref={editInputRef}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingIdx(null) }}
                onClick={e => e.stopPropagation()}
                className="w-20 bg-transparent border-b border-[#58a6ff] outline-none text-[10px] font-bold text-[#58a6ff]"
              />
            ) : (
              <span className="font-mono tracking-wide">{s.title}</span>
            )}

            {sessions.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); removeSession(i) }}
                className="opacity-0 group-hover:opacity-100 -mr-1 p-0.5 rounded transition-all text-[#8b949e] hover:text-[#f85149] hover:bg-[#30363d]"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        ))}

        <button
          onClick={addSession}
          className="w-7 h-7 ml-1 flex items-center justify-center rounded-lg text-[#8b949e] hover:text-[#58a6ff] hover:bg-[#21262d] transition-all border border-transparent hover:border-[#30363d]"
          title="New terminal tab  (opens a new shell)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
        </button>

        <div className="flex-1" />

        {/* Context indicator */}
        {selectedContext && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mr-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-400/80 font-mono truncate max-w-[160px]">
              {selectedContext}
            </span>
          </div>
        )}
      </div>

      {/* Terminal panes */}
      <div className="flex-1 min-h-0 relative bg-[#0d1117]">
        {sessions.map((session, i) => (
          <div
            key={session.id}
            className="absolute inset-0"
            style={{ display: i === activeIdx ? 'block' : 'none' }}
          >
            <TermPane
              sessionId={session.id}
              context={selectedContext ?? undefined}
              namespace={selectedNamespace ?? undefined}
              theme={theme}
              onPtyReady={ptyId => {
                setSessions(prev => prev.map((s, idx) => idx === i ? { ...s, ptyId } : s))
              }}
            />
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="w-16 h-16 rounded-3xl bg-[#161b22] border border-[#30363d] flex items-center justify-center text-[#484f58]">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 17l6-6-6-6M12 19h8" /></svg>
            </div>
            <p className="text-[11px] font-bold text-[#8b949e] uppercase tracking-widest">No active shell sessions</p>
            <button
              onClick={addSession}
              className="px-5 py-2 text-xs font-black text-white bg-[#238636] hover:bg-[#2ea043] rounded-xl shadow-lg shadow-green-900/30 transition-all active:scale-95 uppercase tracking-widest border border-[#2ea043]/50"
            >
              Open New Terminal
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Individual terminal pane ─────────────────────────────────────────────────

interface TermPaneProps {
  sessionId: string
  context?: string
  namespace?: string
  theme: 'light' | 'dark'
  onPtyReady: (ptyId: string) => void
}

function TermPane({ sessionId, context, namespace, theme, onPtyReady }: TermPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const offDataRef = useRef<(() => void) | null>(null)
  const offExitRef = useRef<(() => void) | null>(null)
  const [ptyReady, setPtyReady] = useState(false)

  // ── Session init — only re-runs when sessionId changes ────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({
      theme: getTerminalTheme(theme === 'dark'),
      fontFamily: TERM_FONT,
      fontSize: 13,
      lineHeight: 1.6,
      letterSpacing: 0.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowTransparency: false,
      drawBoldTextInBrightColors: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(container)
    fit.fit()

    xtermRef.current = term
    fitRef.current = fit

    // Start PTY
    window.terminal.create(context, namespace).then(ptyId => {
      ptyIdRef.current = ptyId
      onPtyReady(ptyId)
      setPtyReady(true)

      offDataRef.current = window.terminal.onData(ptyId, data => term.write(data))
      offExitRef.current = window.terminal.onExit(ptyId, () => {
        term.write('\r\n\x1b[38;5;244m[Session ended. Close this tab.]\x1b[0m\r\n')
      })

      term.onData(data => window.terminal.write(ptyId, data))
    }).catch(() => {
      term.write('\r\n\x1b[31m[Failed to start terminal session]\x1b[0m\r\n')
    })

    const ro = new ResizeObserver(() => {
      fit.fit()
      if (ptyIdRef.current) {
        window.terminal.resize(ptyIdRef.current, term.cols, term.rows)
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      offDataRef.current?.()
      offExitRef.current?.()
      if (ptyIdRef.current) window.terminal.kill(ptyIdRef.current).catch(() => { })
      term.dispose()
      setPtyReady(false)
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Theme update — applies without reinitializing the session ─────────────
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = getTerminalTheme(theme === 'dark')
    }
  }, [theme])

  return (
    <div className="relative w-full h-full bg-[#0d1117]">
      {!ptyReady && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-[#0d1117] z-10">
          <div className="w-4 h-4 border-2 border-[#30363d] border-t-[#58a6ff] rounded-full animate-spin" />
          <span className="text-[10px] font-bold text-[#8b949e] font-mono uppercase tracking-widest">Initializing shell…</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full p-5" />
    </div>
  )
}
