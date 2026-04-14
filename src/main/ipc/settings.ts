import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { app, ipcMain, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { findKubeconfigPath, getSettings, saveSettings, PodscapeSettings } from '../settings/settings_storage'
import { startSidecar, stopSidecar } from '../sidecar/sidecar'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => {
    return getSettings()
  })
  ipcMain.handle('settings:set', (_event, settings: PodscapeSettings) => {
    saveSettings(settings)
  })

  ipcMain.handle('kubeconfig:get', () => {
    const path = findKubeconfigPath()
    const content = existsSync(path) ? readFileSync(path, 'utf8') : ''
    return { path, content }
  })

  ipcMain.handle('kubeconfig:set', (_event, content: string) => {
    const path = findKubeconfigPath()
    const dir = join(path, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(path, content, 'utf8')
  })

  ipcMain.handle('kubeconfig:reveal', () => {
    const path = findKubeconfigPath()
    if (existsSync(path)) {
      shell.showItemInFolder(path)
    } else {
      shell.openPath(join(homedir(), '.kube'))
    }
  })

  ipcMain.handle('kubeconfig:selectPath', async () => {
    const { dialog } = await import('electron')
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Select Kubeconfig File',
        properties: ['openFile', 'showHiddenFiles'],
        filters: [{ name: 'Config', extensions: ['*', 'yaml', 'yml', 'conf'] }]
      })
      if (!canceled && filePaths[0]) {
        const settings = getSettings()
        settings.kubeconfigPath = filePaths[0]
        saveSettings(settings)
        
        // Restart sidecar with new config
        await stopSidecar()
        await startSidecar()
        
        return filePaths[0]
      }
    } catch (e) {
      console.error('[kubeconfig:selectPath] Failed:', e)
    }
    return null
  })

  ipcMain.handle('kubeconfig:clearPath', async () => {
    const settings = getSettings()
    settings.kubeconfigPath = ''
    saveSettings(settings)
    
    // Restart sidecar
    await stopSidecar()
    await startSidecar()
  })

  ipcMain.handle('mcp:getBinaryPath', () => {
    const binaryName = process.platform === 'win32' ? 'podscape-mcp.exe' : 'podscape-mcp'

    // Candidate locations in priority order
    const candidates: string[] = []

    // Dev: local build in go-core/
    if (is.dev) {
      candidates.push(join(app.getAppPath(), 'go-core', binaryName))
    }

    // Check PATH via `which`/`where`
    try {
      const { spawnSync } = require('child_process')
      const which = process.platform === 'win32' ? 'where' : 'which'
      const result = spawnSync(which, [binaryName], { encoding: 'utf8' })
      if (result.status === 0 && result.stdout.trim()) {
        candidates.push(result.stdout.trim().split('\n')[0].trim())
      }
    } catch { /* ignore */ }

    // Common install locations
    candidates.push(
      join(homedir(), '.local', 'bin', binaryName),
      join('/usr', 'local', 'bin', binaryName),
      join('/opt', 'homebrew', 'bin', binaryName),
    )

    const found = candidates.find(p => existsSync(p))
    // Map to release asset name: podscape-mcp-{os}-{arch}
    const osMap: Record<string, string> = { darwin: 'darwin', win32: 'windows', linux: 'linux' }
    const archMap: Record<string, string> = { x64: 'amd64', arm64: 'arm64' }
    const os = osMap[process.platform] ?? process.platform
    const arch = archMap[process.arch] ?? process.arch
    const assetName = process.platform === 'win32'
      ? `podscape-mcp-${os}-${arch}.exe`
      : `podscape-mcp-${os}-${arch}`

    return { path: found ?? candidates[0], available: !!found, assetName }
  })

  ipcMain.handle('settings:checkTools', async () => {
    const kubeconfigOk = existsSync(findKubeconfigPath())
    const { spawnSync } = await import('child_process')
    const trivyCheck = spawnSync('trivy', ['--version'], { stdio: 'ignore' })
    const trivyOk = trivyCheck.status === 0
    return { kubeconfigOk, trivyOk }
  })
}
