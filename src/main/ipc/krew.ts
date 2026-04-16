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

    proc.on('error', (err: Error) => {
      resolve({ success: false, error: err.message })
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

/** Runs `kubectl krew <args>` and parses JSON stdout. Rejects on non-zero exit. */
export function runKrewJson(args: string[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const env = getAugmentedEnv()
    const proc = spawn('kubectl', ['krew', ...args], { env })

    let out = ''
    let err = ''

    proc.stdout.on('data', (data: Buffer) => { out += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { err += data.toString() })

    proc.on('error', (spawnErr: Error) => {
      reject(new Error(spawnErr.message))
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error('[krew] runKrewJson failed:', { args, code, stderr: err.trim() })
        reject(new Error(err.trim() || `kubectl krew ${args.join(' ') || '<no args>'} exited with code ${code}`))
        return
      }
      const trimmed = out.trim()
      if (!trimmed) { resolve([]); return }
      try {
        const parsed = JSON.parse(trimmed)
        resolve(Array.isArray(parsed) ? parsed : [])
      } catch {
        resolve([])
      }
    })
  })
}

/** Runs `kubectl krew install|uninstall <pluginName>`. Rejects with stderr on non-zero exit. */
export function runKrewAction(action: 'install' | 'uninstall', pluginName: string): Promise<{ ok: boolean }> {
  return new Promise((resolve, reject) => {
    const env = getAugmentedEnv()
    const proc = spawn('kubectl', ['krew', action, pluginName], { env })

    let err = ''
    proc.stdout.on('data', () => {}) // drain stdout
    proc.stderr.on('data', (data: Buffer) => { err += data.toString() })

    proc.on('error', (spawnErr: Error) => {
      reject(new Error(spawnErr.message))
    })

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error('[krew] runKrewAction failed:', { action, pluginName, code, stderr: err.trim() })
        reject(new Error(err.trim() || `kubectl krew ${action} exited with code ${code}`))
      } else {
        resolve({ ok: true })
      }
    })
  })
}

export const MAX_PLUGIN_OUTPUT_LINES = 10_000

/** Runs `kubectl <pluginName> <args>` and streams output lines to `onLine`.
 *  If total output exceeds MAX_PLUGIN_OUTPUT_LINES, emits a truncation notice
 *  and stops forwarding further lines. */
export function runPlugin(
  pluginName: string,
  args: string[],
  onLine: (line: string) => void
): Promise<{ exitCode: number }> {
  return new Promise((resolve) => {
    const env = getAugmentedEnv()
    const proc = spawn('kubectl', [pluginName, ...args], { env })

    let lineCount = 0
    let truncated = false

    function handleLine(prefix: string, line: string) {
      if (truncated) return
      const trimmed = line.trim()
      if (!trimmed) return
      if (lineCount >= MAX_PLUGIN_OUTPUT_LINES) {
        truncated = true
        onLine(`[truncated] Output exceeded ${MAX_PLUGIN_OUTPUT_LINES} lines and was cut off`)
        return
      }
      lineCount++
      onLine(`${prefix}${trimmed}`)
    }

    proc.stdout.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) handleLine('', line)
    })

    proc.stderr.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) handleLine('[stderr] ', line)
    })

    proc.on('error', (err: Error) => {
      onLine(`[stderr] spawn error: ${err.message}`)
      resolve({ exitCode: 1 })
    })

    proc.on('close', (code) => {
      resolve({ exitCode: code ?? 0 })
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

  ipcMain.handle('krew:search', async () => {
    return runKrewJson(['search', '--output=json'])
  })

  ipcMain.handle('krew:installed', async () => {
    const plugins = await runKrewJson(['list', '--output=json'])
    if (plugins.length > 0 && typeof plugins[0] === 'object') {
      return (plugins as any[]).map((p) => p.name ?? p.Name ?? String(p))
    }
    return plugins as string[]
  })

  ipcMain.handle('krew:update', async () => {
    await runKrewJson(['update'])
    return { ok: true }
  })

  ipcMain.handle('krew:upgrade-all', async () => {
    await runKrewJson(['upgrade'])
    return { ok: true }
  })

  ipcMain.handle('krew:install-plugin', async (_event, pluginName: string) => {
    return runKrewAction('install', pluginName)
  })

  ipcMain.handle('krew:uninstall', async (_event, pluginName: string) => {
    return runKrewAction('uninstall', pluginName)
  })

  ipcMain.handle('krew:run-plugin', async (event, pluginName: string, args: string[]) => {
    return runPlugin(pluginName, args, (line) => {
      if (!event.sender.isDestroyed()) event.sender.send('krew:plugin-output', line)
    })
  })
}
