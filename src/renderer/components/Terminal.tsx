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
    <div className="flex flex-col flex-1 bg-white dark:bg-[hsl(var(--bg-dark))] h-full overflow-hidden transition-colors duration-200">
      {/* Tab bar */}
      <div className="flex items-center bg-white dark:bg-white/5 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 shrink-0 px-4 h-12 gap-1.5 overflow-x-auto no-scrollbar">
        {sessions.map((s, i) => (
          <div
            key={s.id}
            className={`flex items-center gap-2.5 px-4 h-9 text-[10px] font-bold cursor-pointer rounded-t-xl border-x border-t transition-all select-none
              ${i === activeIdx
                ? 'bg-white dark:bg-white/10 text-blue-600 dark:text-blue-400 border-slate-200 dark:border-white/10 shadow-[0_-2px_8px_rgba(0,0,0,0.05)]'
                : 'bg-transparent text-slate-400 dark:text-slate-600 border-transparent hover:text-slate-600 dark:hover:text-slate-400'}`}
            onClick={() => setActiveIdx(i)}
            onDoubleClick={e => startRename(i, s.title, e)}
            title="Double-click to rename"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[8px] font-black">
              {i + 1}
            </span>
            {editingIdx === i ? (
              <input
                ref={editInputRef}
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingIdx(null) }}
                onClick={e => e.stopPropagation()}
                className="w-20 bg-transparent border-b border-blue-400 outline-none text-[10px] font-bold text-blue-400"
              />
            ) : (
              <span className="uppercase tracking-widest">{s.title}</span>
            )}
            {sessions.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); removeSession(i) }}
                className="ml-1 p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors text-slate-300 dark:text-slate-700 hover:text-red-500"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addSession}
          className="w-8 h-8 flex items-center justify-center text-slate-400 dark:text-slate-600 hover:text-blue-500 hover:bg-white dark:hover:bg-slate-900 rounded-lg transition-all ml-1 border border-transparent hover:border-slate-200 dark:hover:border-slate-800"
          title="New terminal tab"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-3 px-2">
          <span className="text-[10px] font-bold text-slate-300 dark:text-slate-700 font-mono uppercase tracking-widest">
            {selectedContext}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

      {/* Terminal panes */}
      <div className="flex-1 min-h-0 relative bg-white dark:bg-[hsl(var(--bg-dark))]">
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
            <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center text-slate-200 dark:text-slate-800">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 17l6-6-6-6M12 19h8" /></svg>
            </div>
            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">No active shell sessions</p>
            <button
              onClick={addSession}
              className="px-6 py-2.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95 uppercase tracking-widest"
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
      fontSize: 12,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowTransparency: true
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
    <div className="relative w-full h-full">
      {!ptyReady && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-[hsl(var(--bg-dark))] z-10 transition-colors">
          <div className="w-4 h-4 border-2 border-slate-100 dark:border-white/10 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Initializing terminal…</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full p-4" />
    </div>
  )
}
