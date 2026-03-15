import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { ipcMain, shell } from 'electron'
import { findKubeconfigPath, getSettings, saveSettings, PodscapeSettings } from './settings_storage'
import { startSidecar, stopSidecar } from './sidecar'

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

  ipcMain.handle('settings:checkTools', async () => {
    const kubeconfigOk = existsSync(findKubeconfigPath())
    const { spawnSync } = await import('child_process')
    const trivyCheck = spawnSync('trivy', ['--version'], { stdio: 'ignore' })
    const trivyOk = trivyCheck.status === 0
    return { kubeconfigOk, trivyOk }
  })
}
