import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { ipcMain } from 'electron'

export interface PodscapeSettings {
  kubectlPath: string             // absolute path or '' for auto-detect
  shellPath: string               // absolute path or '' for auto-detect
  helmPath: string                // absolute path or '' for auto-detect
  theme: 'light' | 'dark' | ''   // '' means use last-used / OS preference
}

const SETTINGS_DIR  = join(homedir(), '.podscape')
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json')

const DEFAULTS: PodscapeSettings = { kubectlPath: '', shellPath: '', helmPath: '', theme: '' }

export function getSettings(): PodscapeSettings {
  try {
    if (existsSync(SETTINGS_FILE)) {
      return { ...DEFAULTS, ...JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) }
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS }
}

function saveSettings(settings: PodscapeSettings): void {
  if (!existsSync(SETTINGS_DIR)) mkdirSync(SETTINGS_DIR, { recursive: true })
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8')
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_event, settings: PodscapeSettings) => {
    saveSettings(settings)
  })
}
