import { ipcMain, dialog, BrowserWindow } from 'electron'

/**
 * Validates a remote container path before passing it to kubectl cp.
 * Exported so it can be unit-tested independently of Electron.
 *
 * Rules:
 *  - Must be an absolute path (starts with /)
 *  - Must not contain .. segments (path traversal guard)
 *  - Must not be empty
 */
export function validateRemotePath(path: string): Error | null {
    const trimmed = path.trim()
    if (!trimmed) return new Error('Remote path must not be empty.')
    if (!trimmed.startsWith('/')) return new Error('Remote path must be absolute (start with /).')
    if (trimmed.split('/').some(seg => seg === '..')) {
        return new Error('Remote path must not contain ".." segments.')
    }
    return null
}

export function registerDialogHandlers(): void {
    /** Open a native file-picker and return the selected path, or null if cancelled. */
    ipcMain.handle('dialog:showOpenFile', async () => {
        const win = BrowserWindow.getFocusedWindow()
        const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
            properties: ['openFile'],
            title: 'Select file to upload',
        })
        return result.canceled ? null : result.filePaths[0] ?? null
    })

    /** Open a native save-dialog and return the chosen path, or null if cancelled. */
    ipcMain.handle('dialog:showSaveFile', async (_e, defaultName: string) => {
        const win = BrowserWindow.getFocusedWindow()
        const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
            title: 'Save downloaded file',
            defaultPath: defaultName,
        })
        return result.canceled ? null : result.filePath ?? null
    })
}
