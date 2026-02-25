import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { ExecTarget } from '../store'
import { useAppStore } from '../store'

interface Props {
  target: ExecTarget
  onClose: () => void
}

export default function ExecPanel({ target, onClose }: Props): JSX.Element {
  const { selectedContext } = useAppStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const ptyIdRef = useRef<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !selectedContext) return

    const term = new XTerm({
      theme: {
        background: '#050810',
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
      cursorStyle: 'block',
      scrollback: 5000
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

        const offData = window.exec.onData(ptyId, data => term.write(data))
        const offExit = window.exec.onExit(ptyId, () => {
          term.write('\r\n\x1b[33m[Process exited]\x1b[0m\r\n')
        })

        term.onData(data => window.exec.write(ptyId, data))

        return () => { offData(); offExit() }
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
      if (ptyIdRef.current) window.exec.kill(ptyIdRef.current).catch(() => {})
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.pod, target.container])

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-green-400">● EXEC</span>
          <span className="text-xs text-gray-300 font-mono">
            {target.pod}
            {target.container && <span className="text-gray-500"> / {target.container}</span>}
          </span>
          <span className="text-xs text-gray-500">{target.namespace}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">Press Ctrl+D or type `exit` to close shell</span>
          <button
            onClick={() => {
              if (ptyIdRef.current) window.exec.kill(ptyIdRef.current).catch(() => {})
              onClose()
            }}
            className="px-3 py-1 text-xs text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-colors"
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div ref={containerRef} className="flex-1 min-h-0 p-2 bg-[#050810]" />
    </div>
  )
}
