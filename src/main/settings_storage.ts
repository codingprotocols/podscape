import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface PodscapeSettings {
    kubectlPath: string             // absolute path or '' for auto-detect
    shellPath: string               // absolute path or '' for auto-detect
    helmPath: string                // absolute path or '' for auto-detect
    theme: 'light' | 'dark' | ''   // '' means use last-used / OS preference
    kubeconfigPath: string         // absolute path or '' for default (~/.kube/config)
}

const SETTINGS_DIR = join(homedir(), '.podscape')
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json')

const DEFAULTS: PodscapeSettings = {
    kubectlPath: '',
    shellPath: '',
    helmPath: '',
    theme: 'dark',
    kubeconfigPath: ''
}

export function getSettings(): PodscapeSettings {
    try {
        if (existsSync(SETTINGS_FILE)) {
            return { ...DEFAULTS, ...JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) }
        }
    } catch { /* ignore */ }
    return DEFAULTS
}

export function saveSettings(settings: PodscapeSettings): void {
    if (!existsSync(SETTINGS_DIR)) {
        mkdirSync(SETTINGS_DIR, { recursive: true })
    }
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
}

export function findKubeconfigPath(): string {
    const { kubeconfigPath } = getSettings()
    if (kubeconfigPath && existsSync(kubeconfigPath)) return kubeconfigPath
    return process.env.KUBECONFIG || join(homedir(), '.kube', 'config')
}
