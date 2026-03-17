import { app, shell, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerKubectlHandlers, cancelAllLogStreams } from './kubectl'
import { registerTerminalHandlers, cancelAllExecStreams } from './terminal'
import { registerSettingsHandlers } from './settings'
import { registerHelmHandlers } from './helm'
import { registerDialogHandlers } from './dialog'
import { startSidecar, stopSidecar } from './sidecar'

async function createSplashWindow(): Promise<BrowserWindow> {
  const splash = new BrowserWindow({
    width: 440,
    height: 280,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    skipTaskbar: true,
    // macOS: blur-behind glass effect matching the main window
    ...(process.platform === 'darwin' ? {
      vibrancy: 'under-window',
      visualEffectState: 'active',
    } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    }
  })

  const splashPath = is.dev
    ? join(app.getAppPath(), 'resources/splash.html')
    : join(process.resourcesPath, 'splash.html')

  await splash.loadFile(splashPath, { query: { v: app.getVersion() } })
  splash.show()
  return splash
}

function createWindow(onReady: () => void): void {
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
    onReady()
  })

  mainWindow.webContents.on('destroyed', () => {
    cancelAllLogStreams()
    cancelAllExecStreams()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  ipcMain.handle('shell:openExternal', (_event, url: string) => {
    shell.openExternal(url)
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

  ipcMain.handle('sidecar:restart', async () => {
    await startSidecar()
  })

  const splash = await createSplashWindow()

  try {
    await startSidecar()
    createWindow(() => splash.destroy())
  } catch (err: any) {
    splash.destroy()
    console.error('[Main] Failed to start sidecar:', err)
    dialog.showErrorBox(
      'Sidecar Connection Failed',
      `The Podscape backend (Go sidecar) failed to start.\n\nError: ${err.message}\n\nPlease ensure your kubeconfig is valid and port 5050 is not in use.`
    )
    app.quit()
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(() => {})
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let isQuitting = false

app.on('before-quit', async (event) => {
  if (!isQuitting) {
    event.preventDefault()
    isQuitting = true
    console.log('[Main] Stopping sidecar before quit...')
    try {
      await stopSidecar()
    } catch (err) {
      console.error('[Main] Error stopping sidecar during quit:', err)
    }
    app.quit()
  }
})
