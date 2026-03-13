import { app, shell, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerKubectlHandlers } from './kubectl'
import { registerTerminalHandlers } from './terminal'
import { registerSettingsHandlers } from './settings'
import { registerHelmHandlers } from './helm'
import { registerDialogHandlers } from './dialog'
import { startSidecar, stopSidecar } from './sidecar'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    icon: join(__dirname, process.platform === 'darwin'
      ? '../../resources/icon.icns'
      : '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      // Allow Grafana iframe embedding
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.podscape')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerSettingsHandlers()
  registerKubectlHandlers()
  registerTerminalHandlers()
  registerHelmHandlers()
  registerDialogHandlers()
  
  try {
    await startSidecar()
    createWindow()
  } catch (err: any) {
    console.error('[Main] Failed to start sidecar:', err)
    dialog.showErrorBox(
      'Sidecar Connection Failed',
      `The Podscape backend (Go sidecar) failed to start.\n\nError: ${err.message}\n\nPlease ensure your kubeconfig is valid and port 5050 is not in use.`
    )
    app.quit()
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', async () => {
  await stopSidecar()
})
