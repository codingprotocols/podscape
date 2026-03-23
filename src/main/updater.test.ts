import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// Shared mock objects — defined outside vi.doMock factories so they survive
// vi.resetModules() and are accessible in test assertions.
const webContentsSend = vi.fn()
const webContentsOnce = vi.fn()
const mockWin = { webContents: { send: webContentsSend, once: webContentsOnce } }

const appHandlers: Record<string, Array<(...args: any[]) => void>> = {}
const mockApp = {
  on: vi.fn((event: string, h: (...args: any[]) => void) => {
    ;(appHandlers[event] ??= []).push(h)
  }),
  once: vi.fn((event: string, h: (...args: any[]) => void) => {
    appHandlers[event] = [h]
  }),
}

const ipcHandlers: Record<string, () => void> = {}
const mockIpcMain = {
  handle: vi.fn((channel: string, h: () => void) => {
    ipcHandlers[channel] = h
  }),
}

const autoUpdaterListeners: Record<string, Array<(...args: any[]) => void>> = {}
const mockAutoUpdater = {
  autoDownload: true,
  autoInstallOnAppQuit: false,
  logger: undefined as any,
  on: vi.fn((event: string, h: (...args: any[]) => void) => {
    ;(autoUpdaterListeners[event] ??= []).push(h)
  }),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emitAutoUpdater(event: string, ...args: any[]) {
  autoUpdaterListeners[event]?.forEach((h) => h(...args))
}

function triggerWindowReady() {
  ;(appHandlers['browser-window-created'] ?? []).forEach((h) => h(null, mockWin))
  const lastCall = webContentsOnce.mock.calls.at(-1)
  if (lastCall) lastCall[1]()
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('setupUpdater', () => {
  beforeEach(() => {
    vi.resetModules()
    // Register mocks via doMock after resetModules so each dynamic import
    // picks up a fresh module evaluation backed by these mock objects.
    vi.doMock('electron', () => ({
      app: mockApp,
      ipcMain: mockIpcMain,
      BrowserWindow: { getAllWindows: vi.fn(() => [mockWin]) },
    }))
    vi.doMock('electron-updater', () => ({ autoUpdater: mockAutoUpdater }))
    vi.doMock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

    vi.clearAllMocks()
    vi.useFakeTimers()
    for (const k of Object.keys(appHandlers)) delete appHandlers[k]
    for (const k of Object.keys(ipcHandlers)) delete ipcHandlers[k]
    for (const k of Object.keys(autoUpdaterListeners)) delete autoUpdaterListeners[k]
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('skips setup in dev mode', async () => {
    vi.doMock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
    const { setupUpdater } = await import('./updater')
    setupUpdater()
    expect(mockIpcMain.handle).not.toHaveBeenCalled()
  })

  it('registers ipcMain handlers for check, download and install', async () => {
    const { setupUpdater } = await import('./updater')
    setupUpdater()
    expect(mockIpcMain.handle).toHaveBeenCalledWith('updater:check', expect.any(Function))
    expect(mockIpcMain.handle).toHaveBeenCalledWith('updater:download', expect.any(Function))
    expect(mockIpcMain.handle).toHaveBeenCalledWith('updater:install', expect.any(Function))
  })

  it('queues events emitted before window ready and flushes on did-finish-load', async () => {
    const { setupUpdater } = await import('./updater')
    setupUpdater()

    emitAutoUpdater('update-available', { version: '4.0.0' })
    expect(webContentsSend).not.toHaveBeenCalled()

    triggerWindowReady()
    expect(webContentsSend).toHaveBeenCalledWith('updater:available', { version: '4.0.0' })
  })

  it('sends events directly once the window is ready', async () => {
    const { setupUpdater } = await import('./updater')
    setupUpdater()

    triggerWindowReady()
    emitAutoUpdater('update-available', { version: '5.0.0' })
    expect(webContentsSend).toHaveBeenCalledWith('updater:available', { version: '5.0.0' })
  })

  it('flushes multiple queued events in order', async () => {
    const { setupUpdater } = await import('./updater')
    setupUpdater()

    emitAutoUpdater('update-available', { version: '4.0.0' })
    emitAutoUpdater('download-progress', { percent: 50 })
    triggerWindowReady()

    expect(webContentsSend.mock.calls[0]).toEqual(['updater:available', { version: '4.0.0' }])
    expect(webContentsSend.mock.calls[1]).toEqual(['updater:progress', { percent: 50 }])
  })

  it('fires checkForUpdates after 5 second delay', async () => {
    const { setupUpdater } = await import('./updater')
    setupUpdater()

    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5_000)
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('clears the launch timer when before-quit fires', async () => {
    const { setupUpdater } = await import('./updater')
    setupUpdater()

    ;(appHandlers['before-quit'] ?? []).forEach((h) => h())
    vi.advanceTimersByTime(10_000)
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })
})
