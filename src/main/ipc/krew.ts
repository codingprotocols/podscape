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
      'echo "Detecting platform..."',
      'OS="$(uname | tr \'[:upper:]\' \'[:lower:]\')"',
      'ARCH="$(uname -m | sed -e \'s/x86_64/amd64/; s/\\(arm\\)\\(64\\).*/\\1\\2/; s/aarch64$/arm64/; s/armv6l$/arm/; s/armv7l$/arm/\')"',
      'KREW="krew-${OS}_${ARCH}"',
      'echo "Platform: ${OS}/${ARCH}"',
      'TMPDIR=$(mktemp -d)',
      'echo "Downloading Krew installer..."',
      'curl -fSLo "${TMPDIR}/${KREW}.tar.gz" "https://github.com/kubernetes-sigs/krew/releases/latest/download/${KREW}.tar.gz"',
      'echo "Extracting archive..."',
      'tar zxf "${TMPDIR}/${KREW}.tar.gz" -C "${TMPDIR}"',
      // macOS attaches a quarantine attribute to files downloaded via curl,
      // which silently blocks execution. Remove it before running the installer.
      'command -v xattr >/dev/null 2>&1 && xattr -d com.apple.quarantine "${TMPDIR}/${KREW}" 2>/dev/null || true',
      'echo "Running Krew installer..."',
      '"${TMPDIR}/${KREW}" install krew',
      'echo "Krew installed successfully."',
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

  ipcMain.handle('krew:search', async (): Promise<{ name: string; version: string; short: string; installed: boolean }[]> => {
    // kubectl krew search has no --output=json flag; parse the plain-text table.
    // Output format (columns separated by 2+ spaces):
    //   NAME   DESCRIPTION   INSTALLED
    //   ctx    Fast way to switch between clusters   no
    return new Promise((resolve) => {
      const env = getAugmentedEnv()
      const proc = spawn('kubectl', ['krew', 'search'], { env })
      let out = ''

      proc.stdout.on('data', (data: Buffer) => { out += data.toString() })
      proc.on('error', (err: Error) => {
        console.error('[krew] krew search failed:', err.message)
        resolve([])
      })
      proc.on('close', (code) => {
        if (code !== 0) { resolve([]); return }
        const lines = out.trim().split('\n').slice(1) // skip header row
        const plugins = lines.flatMap(line => {
          // Split on 2+ consecutive spaces to separate columns; last column is "yes"/"no"
          const cols = line.trim().split(/\s{2,}/)
          if (cols.length < 3) return []
          const name = cols[0]
          if (name === 'krew') return [] // hide krew itself — cannot be managed as a plugin
          const installedStr = cols[cols.length - 1]
          const short = cols.slice(1, cols.length - 1).join('  ')
          return [{ name, version: '', short, installed: installedStr === 'yes' }]
        })
        resolve(plugins)
      })
    })
  })

  ipcMain.handle('krew:installed', async (): Promise<string[]> => {
    return new Promise((resolve) => {
      const env = getAugmentedEnv()
      const proc = spawn('kubectl', ['krew', 'list'], { env })
      let out = ''
      let err = ''

      proc.stdout.on('data', (data: Buffer) => { out += data.toString() })
      proc.stderr.on('data', (data: Buffer) => { err += data.toString() })
      proc.on('error', (spawnErr: Error) => {
        console.error('[krew] krew list failed:', spawnErr.message)
        resolve([])
      })
      proc.on('close', (code) => {
        if (code !== 0) {
          console.error('[krew] krew list exited with code', code, err.trim())
          resolve([])
        } else {
          // Output format: "PLUGIN    VERSION\nctx       v0.9.5\nns        v0.9.1\n"
          // Skip the header line, extract first column (plugin name) from each remaining line
          const lines = out.trim().split('\n').slice(1)
          const names = lines
            .map(l => l.trim().split(/\s+/)[0])
            .filter(Boolean)
            .filter(name => name !== 'krew') // krew cannot uninstall itself
          resolve(names)
        }
      })
    })
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
