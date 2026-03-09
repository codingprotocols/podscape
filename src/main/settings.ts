import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { ipcMain, shell } from 'electron'
import { getSettings, saveSettings, findKubeconfigPath, PodscapeSettings } from './settings_storage'
import { findKubectl } from './kubectl'
import { findHelm } from './helm'

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
        return filePaths[0]
      }
    } catch (e) {
      console.error('[kubeconfig:selectPath] Failed:', e)
    }
    return null
  })

  ipcMain.handle('kubeconfig:clearPath', () => {
    const settings = getSettings()
    settings.kubeconfigPath = ''
    saveSettings(settings)
  })

  ipcMain.handle('settings:checkTools', async () => {
    const kPath = findKubectl()
    const hPath = findHelm()

    // We don't just check path, we check if they are executable
    const check = (cmd: string): Promise<boolean> => new Promise((resolve) => {
      const { exec } = require('child_process')
      exec(`${cmd} version --client`, (err: any) => resolve(!err))
    })

    const kubectlOk = await check(kPath)
    const helmOk = await check(hPath)
    const kubeconfigOk = existsSync(findKubeconfigPath())

    return { kubectlOk, helmOk, kubeconfigOk }
  })
}
