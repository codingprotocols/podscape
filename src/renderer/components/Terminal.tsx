import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useAppStore } from '../store'

interface TermSession {
  id: string
  title: string
  ptyId: string | null
}

let sessionCounter = 1

export default function Terminal(): JSX.Element {
  const { selectedContext, selectedNamespace } = useAppStore()
  const [sessions, setSessions] = useState<TermSession[]>([])
  const [activeIdx, setActiveIdx] = useState(0)

  const addSession = () => {
    const title = `Shell ${sessionCounter++}`
    setSessions(prev => [...prev, { id: `s-${Date.now()}`, title, ptyId: null }])
    setActiveIdx(prev => sessions.length) // will be the new last index
  }

  const removeSession = (idx: number) => {
    setSessions(prev => {
      const s = prev[idx]
      if (s.ptyId) window.terminal.kill(s.ptyId).catch(() => {})
      return prev.filter((_, i) => i !== idx)
    })
    setActiveIdx(prev => Math.max(0, prev - 1))
  }

  // Auto-create first session
  useEffect(() => {
    setSessions([{ id: 's-0', title: 'Shell 1', ptyId: null }])
    setActiveIdx(0)
  }, [])

  const activeSession = sessions[activeIdx]

  return (
    <div className="flex flex-col flex-1 bg-gray-950 h-full">
      {/* Tab bar */}
      <div className="flex items-center border-b border-white/10 bg-gray-900/80 shrink-0 px-2 gap-1">
        {sessions.map((s, i) => (
          <div
            key={s.id}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer rounded-t transition-colors
              ${i === activeIdx ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'}`}
            onClick={() => setActiveIdx(i)}
          >
            <span>⊞</span>
            <span>{s.title}</span>
            {sessions.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); removeSession(i) }}
                className="ml-1 text-gray-600 hover:text-gray-300"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addSession}
          className="px-2 py-2 text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 rounded text-xs transition-colors"
          title="New terminal tab"
        >
          +
        </button>
        <div className="flex-1" />
        <div className="text-xs text-gray-600 px-2">
          {selectedContext ?? 'no context'} · {selectedNamespace ?? 'all'}
        </div>
      </div>

      {/* Terminal panes */}
      <div className="flex-1 min-h-0 relative">
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
              onPtyReady={ptyId => {
                setSessions(prev => prev.map((s, idx) => idx === i ? { ...s, ptyId } : s))
              }}
            />
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            <button onClick={addSession} className="px-4 py-2 bg-gray-800 rounded hover:bg-gray-700 text-gray-300 transition-colors">
              Open Terminal
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
  onPtyReady: (ptyId: string) => void
}

function TermPane({ sessionId, context, namespace, onPtyReady }: TermPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({
      theme: {
        background: '#0a0a0f',
        foreground: '#d4d4d4',
        cursor: '#a6a6a6',
        selectionBackground: '#264f78',
        black: '#1e1e1e', brightBlack: '#4d4d4d',
        red: '#f44747', brightRed: '#f44747',
        green: '#6a9955', brightGreen: '#b5cea8',
        yellow: '#d7ba7d', brightYellow: '#dcdcaa',
        blue: '#569cd6', brightBlue: '#9cdcfe',
        magenta: '#c586c0', brightMagenta: '#d670d6',
        cyan: '#4ec9b0', brightCyan: '#4ec9b0',
        white: '#d4d4d4', brightWhite: '#ffffff'
      },
      fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000
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

      const offData = window.terminal.onData(ptyId, data => term.write(data))
      const offExit = window.terminal.onExit(ptyId, () => {
        term.write('\r\n\x1b[33m[Session ended. Close this tab.]\x1b[0m\r\n')
      })

      term.onData(data => window.terminal.write(ptyId, data))

      return () => {
        offData()
        offExit()
      }
    })

    // Resize observer
    const ro = new ResizeObserver(() => {
      fit.fit()
      if (ptyIdRef.current) {
        window.terminal.resize(ptyIdRef.current, term.cols, term.rows)
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      if (ptyIdRef.current) window.terminal.kill(ptyIdRef.current).catch(() => {})
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  return <div ref={containerRef} className="w-full h-full p-2" />
}
