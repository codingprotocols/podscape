import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { findKubectl } from './kubectl'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pty = require('node-pty') as typeof import('node-pty')

type IPty = ReturnType<typeof pty.spawn>

const activePTYs = new Map<string, IPty>()
let nextPtyId = 1

function newId(prefix: string): string {
  return `${prefix}-${nextPtyId++}`
}

export function registerTerminalHandlers(): void {
  // ── Built-in kubectl terminal ─────────────────────────────────────────────

  ipcMain.handle(
    'terminal:create',
    (event, context?: string, namespace?: string) => {
      const id = newId('term')
      const shell = process.env.SHELL ?? '/bin/zsh'
      const kubectl = findKubectl()
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        HOME: homedir()
      }
      if (context) env['KUBECTL_CONTEXT'] = context
      if (namespace) env['KUBECTL_NAMESPACE'] = namespace

      // Launch shell; if a context is given, set it first
      const initCmd = context
        ? `${kubectl} config use-context ${context} 2>/dev/null; ${namespace ? `export KUBECTL_NAMESPACE='${namespace}'; ` : ''}exec ${shell}`
        : undefined

      const ptyProc = pty.spawn(
        shell,
        initCmd ? ['-c', initCmd] : [],
        { name: 'xterm-256color', cols: 80, rows: 24, cwd: homedir(), env }
      )

      const sender = event.sender
      ptyProc.onData((data: string) => {
        if (!sender.isDestroyed()) sender.send('terminal:data', id, data)
      })
      ptyProc.onExit(() => {
        activePTYs.delete(id)
        if (!sender.isDestroyed()) sender.send('terminal:exit', id)
      })

      activePTYs.set(id, ptyProc)
      return id
    }
  )

  ipcMain.handle('terminal:write', (_event, id: string, data: string) => {
    activePTYs.get(id)?.write(data)
  })

  ipcMain.handle('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    activePTYs.get(id)?.resize(cols, rows)
  })

  ipcMain.handle('terminal:kill', (_event, id: string) => {
    const p = activePTYs.get(id)
    if (p) { p.kill(); activePTYs.delete(id) }
  })

  // ── Exec into container ───────────────────────────────────────────────────

  ipcMain.handle(
    'exec:start',
    (event, context: string, namespace: string, pod: string, container: string) => {
      const id = newId('exec')
      const kubectl = findKubectl()
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        TERM: 'xterm-256color'
      }

      const ptyProc = pty.spawn(
        kubectl,
        [
          '--context', context,
          '--namespace', namespace,
          'exec', '-it', pod,
          '--container', container,
          '--', '/bin/sh', '-c',
          'export TERM=xterm-256color; (bash 2>/dev/null || sh)'
        ],
        { name: 'xterm-256color', cols: 80, rows: 24, cwd: homedir(), env }
      )

      const sender = event.sender
      ptyProc.onData((data: string) => {
        if (!sender.isDestroyed()) sender.send('exec:data', id, data)
      })
      ptyProc.onExit(() => {
        activePTYs.delete(id)
        if (!sender.isDestroyed()) sender.send('exec:exit', id)
      })

      activePTYs.set(id, ptyProc)
      return id
    }
  )

  ipcMain.handle('exec:write', (_event, id: string, data: string) => {
    activePTYs.get(id)?.write(data)
  })

  ipcMain.handle('exec:resize', (_event, id: string, cols: number, rows: number) => {
    activePTYs.get(id)?.resize(cols, rows)
  })

  ipcMain.handle('exec:kill', (_event, id: string) => {
    const p = activePTYs.get(id)
    if (p) { p.kill(); activePTYs.delete(id) }
  })
}
