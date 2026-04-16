import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { spawn } from 'child_process'
import { getAugmentedEnv } from '../system/env'

const KREW_BIN = join(homedir(), '.krew', 'bin', 'kubectl-krew')

/** Returns true if Krew is installed and the platform is supported. */
export function detectKrew(): boolean {
  if (process.platform === 'win32') return false
  return existsSync(KREW_BIN)
}

/** Runs the official Krew install script. Streams output lines to `onLine`. */
export function installKrew(
  onLine: (line: string) => void
): Promise<{ success: boolean; unsupported?: boolean; error?: string }> {
  if (process.platform === 'win32') {
    return Promise.resolve({ success: false, unsupported: true })
  }

  return new Promise((resolve) => {
    const env = getAugmentedEnv()
    const script = [
      'set -e',
      'OS="$(uname | tr \'[:upper:]\' \'[:lower:]\')"',
      'ARCH="$(uname -m | sed -e \'s/x86_64/amd64/; s/\\(arm\\)\\(64\\).*/\\1\\2/; s/aarch64$/arm64/; s/armv6l$/arm/; s/armv7l$/arm/\')"',
      'KREW="krew-${OS}_${ARCH}"',
      'TMPDIR=$(mktemp -d)',
      'curl -fsSLo "${TMPDIR}/${KREW}.tar.gz" "https://github.com/kubernetes-sigs/krew/releases/latest/download/${KREW}.tar.gz"',
      'tar zxvf "${TMPDIR}/${KREW}.tar.gz" -C "${TMPDIR}"',
      '"${TMPDIR}/${KREW}" install krew',
    ].join('\n')

    const proc = spawn('bash', ['-c', script], { env })
    const stderrLines: string[] = []

    proc.stdout.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        const trimmed = line.trim()
        if (trimmed) onLine(trimmed)
      }
    })

    proc.stderr.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        const trimmed = line.trim()
        if (trimmed) {
          stderrLines.push(trimmed)
          onLine(trimmed)
        }
      }
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        resolve({ success: false, error: stderrLines.join('\n') || `Installer exited with code ${code}` })
      }
    })
  })
}

export function registerKrewHandlers(): void {
  ipcMain.handle('krew:detect', () => {
    if (process.platform === 'win32') return { available: false, unsupported: true }
    return { available: detectKrew(), unsupported: false }
  })

  ipcMain.handle('krew:install', async (event) => {
    if (process.platform === 'win32') return { success: false, unsupported: true }
    return installKrew((line) => {
      if (!event.sender.isDestroyed()) event.sender.send('krew:install-progress', line)
    })
  })
}
