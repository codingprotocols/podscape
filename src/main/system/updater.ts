import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'

// Events emitted before the renderer is ready are queued and flushed once the
// window's webContents finishes loading, so no update notification is lost.
const MAX_PENDING = 20
const pendingEvents: Array<{ channel: string; payload?: unknown }> = []
let windowReady = false

function send(channel: string, payload?: unknown): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    if (pendingEvents.length < MAX_PENDING) pendingEvents.push({ channel, payload })
    return
  }
  if (windowReady) {
    win.webContents.send(channel, payload)
  } else if (pendingEvents.length < MAX_PENDING) {
    pendingEvents.push({ channel, payload })
  }
}

function onWindowReady(win: BrowserWindow): void {
  windowReady = true
  for (const { channel, payload } of pendingEvents) {
    win.webContents.send(channel, payload)
  }
  pendingEvents.length = 0
}

export function setupUpdater(): void {
  if (is.dev) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => send('updater:checking'))
  autoUpdater.on('update-available', (info) => send('updater:available', info))
  autoUpdater.on('update-not-available', () => send('updater:not-available'))
  autoUpdater.on('download-progress', (progress) => send('updater:progress', progress))
  autoUpdater.on('update-downloaded', (info) => send('updater:downloaded', info))
  autoUpdater.on('error', (err) => console.warn('[updater] update check failed:', err.message))

  ipcMain.handle('updater:check', () => autoUpdater.checkForUpdates())
  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate())
  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  // Wire up flush once the main window's renderer is ready.
  app.on('browser-window-created', (_, win) => {
    win.webContents.once('did-finish-load', () => onWindowReady(win))
  })

  // Check on launch after a short delay so it doesn't race with sidecar startup.
  // Cleared on quit to avoid a network request into a partially-torn-down process.
  const launchTimer = setTimeout(() => autoUpdater.checkForUpdates(), 5_000)
  app.once('before-quit', () => clearTimeout(launchTimer))
}
