import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { spawn } from 'child_process'
import { getAugmentedEnv } from '../system/env'

const KREW_BIN = join(homedir(), '.krew', 'bin', 'kubectl-krew')

/** Returns true if Krew is installed and the platform is supported. */
export function detectKrew(): boolean {
  if (process.platform === 'win32') return false
  return existsSync(KREW_BIN)
}

export function registerKrewHandlers(): void {
  ipcMain.handle('krew:detect', () => {
    if (process.platform === 'win32') return { available: false, unsupported: true }
    return { available: detectKrew(), unsupported: false }
  })
}
