import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { ipcMain } from 'electron'
import { getAugmentedEnv } from './env'
import { getSettings } from './settings'

const execFileAsync = promisify(execFile)

const HELM_PATHS = [
  '/opt/homebrew/bin/helm',
  '/usr/local/bin/helm',
  '/usr/bin/helm',
  '/snap/bin/helm',
]

export function findHelm(): string {
  const settings = getSettings()
  if (settings.helmPath && existsSync(settings.helmPath)) return settings.helmPath
  for (const p of HELM_PATHS) {
    if (existsSync(p)) return p
  }
  return 'helm'
}

async function spawnHelm(args: string[]): Promise<string> {
  const helm = findHelm()
  const env = getAugmentedEnv()
  const { stdout } = await execFileAsync(helm, args, {
    maxBuffer: 20 * 1024 * 1024,
    env
  })
  return stdout
}

export function registerHelmHandlers(): void {
  // List all releases across namespaces
  ipcMain.handle('helm:list', async (_event, context: string) => {
    try {
      const output = await spawnHelm(['--kube-context', context, 'list', '--all-namespaces', '--output', 'json'])
      return JSON.parse(output) as unknown[]
    } catch {
      return []
    }
  })

  // Get release status (detailed info)
  ipcMain.handle('helm:status', async (_event, context: string, namespace: string, release: string) => {
    try {
      return await spawnHelm(['--kube-context', context, '--namespace', namespace, 'status', release, '--output', 'json'])
    } catch (e) {
      throw e
    }
  })

  // Get release values (YAML format, including all computed values)
  ipcMain.handle('helm:values', async (_event, context: string, namespace: string, release: string) => {
    try {
      return await spawnHelm(['--kube-context', context, '--namespace', namespace, 'get', 'values', release, '--all', '--output', 'yaml'])
    } catch {
      return '# No values available'
    }
  })

  // Get release history
  ipcMain.handle('helm:history', async (_event, context: string, namespace: string, release: string) => {
    try {
      const output = await spawnHelm(['--kube-context', context, '--namespace', namespace, 'history', release, '--output', 'json'])
      return JSON.parse(output) as unknown[]
    } catch {
      return []
    }
  })

  // Rollback to revision
  ipcMain.handle('helm:rollback', async (_event, context: string, namespace: string, release: string, revision: number) => {
    return spawnHelm(['--kube-context', context, '--namespace', namespace, 'rollback', release, String(revision)])
  })

  // Uninstall release
  ipcMain.handle('helm:uninstall', async (_event, context: string, namespace: string, release: string) => {
    return spawnHelm(['--kube-context', context, '--namespace', namespace, 'uninstall', release])
  })
}
