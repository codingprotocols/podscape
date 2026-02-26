import { ipcMain } from 'electron'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { findKubectl } from './kubectl'
import { getSettings } from './settings'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pty = require('node-pty') as typeof import('node-pty')

type IPty = ReturnType<typeof pty.spawn>

const activePTYs = new Map<string, IPty>()
let nextPtyId = 1

function newId(prefix: string): string {
  return `${prefix}-${nextPtyId++}`
}

/**
 * Build a clean env object for node-pty.
 *
 * node-pty's native posix_spawnp call fails with ENOENT/EINVAL if the env
 * array contains any undefined values. process.env has type
 * `Record<string, string | undefined>`, so we must filter them out explicitly
 * before passing to pty.spawn().
 *
 * On macOS, Electron's PATH often omits Homebrew paths, so we augment it.
 */
function buildEnv(extra: Record<string, string> = {}): Record<string, string> {
  // Strip undefined values — this is the main source of posix_spawnp failures
  const base: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
  )

  // Augment PATH on macOS so Homebrew/local kubectl is always reachable
  if (process.platform === 'darwin') {
    const existing = (base.PATH ?? '').split(':').filter(Boolean)
    const macPaths = [
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      '/usr/local/sbin',
      '/usr/bin',
      '/usr/sbin',
      '/bin',
      '/sbin'
    ]
    for (const p of macPaths) {
      if (!existing.includes(p)) existing.push(p)
    }
    base.PATH = existing.join(':')
  }

  return { ...base, HOME: homedir(), ...extra }
}

/** Resolve the shell to use: settings override → SHELL env → known defaults */
function findShell(): string {
  const { shellPath } = getSettings()
  if (shellPath && existsSync(shellPath)) return shellPath
  const fromEnv = process.env.SHELL
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  for (const sh of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (existsSync(sh)) return sh
  }
  return '/bin/sh'
}

export function registerTerminalHandlers(): void {
  // ── Built-in kubectl terminal ─────────────────────────────────────────────

  ipcMain.handle(
    'terminal:create',
    (event, context?: string, namespace?: string) => {
      const id = newId('term')
      const shell = findShell()
      const kubectl = findKubectl()
      const env = buildEnv({
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        ...(context   ? { KUBECTL_CONTEXT:   context   } : {}),
        ...(namespace ? { KUBECTL_NAMESPACE: namespace } : {})
      })

      // If a context is given, switch to it before handing the shell to the user
      const initCmd = context
        ? `${kubectl} config use-context ${JSON.stringify(context)} 2>/dev/null; exec ${shell}`
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
      const env    = buildEnv({ TERM: 'xterm-256color', COLORTERM: 'truecolor' })

      // Spawn kubectl directly with an argv array — no shell wrapper needed.
      // buildEnv() provides augmented PATH (incl. Homebrew paths) so kubectl is found
      // even if Electron's inherited PATH is minimal.
      const argv: string[] = [
        '--context', context,
        '--namespace', namespace,
        'exec', '-it', pod,
        ...(container ? ['--container', container] : []),
        '--', 'sh'
      ]

      const ptyProc = pty.spawn(
        kubectl,
        argv,
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
