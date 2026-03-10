import { ipcMain } from 'electron'
import { homedir } from 'os'
import { getAugmentedEnv } from './env'
import { findKubectl } from './kubectl'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pty = require('node-pty') as typeof import('node-pty')

type IPty = ReturnType<typeof pty.spawn>

const activePTYs = new Map<string, IPty>()

export function registerTerminalHandlers(): void {
  // ── Exec into container ───────────────────────────────────────────────────

  ipcMain.handle(
    'exec:start',
    (event, context: string, namespace: string, pod: string, container: string) => {
      const id = `exec-${Date.now()}`
      const kubectl = findKubectl()
      const env = getAugmentedEnv({ TERM: 'xterm-256color', COLORTERM: 'truecolor' })

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
