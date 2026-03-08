<<<<<<< HEAD
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { ipcMain } from 'electron'
import { getSettings } from './settings'

const execFileAsync = promisify(execFile)

=======
import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { getSettings } from './settings'

>>>>>>> 135ceb6 (fix)
const HELM_PATHS = [
  '/opt/homebrew/bin/helm',
  '/usr/local/bin/helm',
  '/usr/bin/helm',
<<<<<<< HEAD
  '/snap/bin/helm',
]

export function findHelm(): string {
  const settings = getSettings()
  if (settings.helmPath && existsSync(settings.helmPath)) return settings.helmPath
  for (const p of HELM_PATHS) {
    if (existsSync(p)) return p
=======
  'helm'
]

export function findHelm(): string {
  const { helmPath } = getSettings()
  if (helmPath && existsSync(helmPath)) return helmPath
  for (const p of HELM_PATHS) {
    if (p === 'helm' || existsSync(p)) return p
>>>>>>> 135ceb6 (fix)
  }
  return 'helm'
}

<<<<<<< HEAD
async function spawnHelm(args: string[]): Promise<string> {
  const helm = findHelm()
  const { stdout } = await execFileAsync(helm, args, {
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env }
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
=======
function spawnHelm(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const binary = findHelm()
    execFile(binary, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr?.trim() || error.message))
      else resolve(stdout ?? '')
    })
  })
}

export interface HelmReleaseRow {
  name: string
  namespace: string
  chart: string
  app_version: string
  status: string
  updated: string
}

function parseListOutput(stdout: string): HelmReleaseRow[] {
  try {
    const data = JSON.parse(stdout) as unknown
    if (!Array.isArray(data)) return []
    return (data as HelmReleaseRow[]).map((r: HelmReleaseRow) => ({
      name: r.name ?? '',
      namespace: r.namespace ?? '',
      chart: r.chart ?? '',
      app_version: r.app_version ?? '',
      status: r.status ?? 'unknown',
      updated: r.updated ?? ''
    }))
  } catch {
    return []
  }
}

export function registerHelmHandlers(): void {
  ipcMain.handle('helm:list', async (_event, context: string) => {
    const output = await spawnHelm(['list', '-a', '-o', 'json', '--kube-context', context])
    return parseListOutput(output)
  })

  ipcMain.handle('helm:uninstall', async (_event, context: string, name: string, namespace: string) => {
    const args = ['uninstall', name, '--kube-context', context]
    if (namespace) args.push('--namespace', namespace)
    return spawnHelm(args)
>>>>>>> 135ceb6 (fix)
  })
}
