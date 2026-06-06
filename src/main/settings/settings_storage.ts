import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface PodscapeSettings {
    shellPath: string               // absolute path or '' for auto-detect
    theme: 'light' | 'dark' | ''   // '' means use last-used / OS preference
    kubeconfigPath: string         // absolute path or '' for default (~/.kube/config)
    prodContexts: string[]         // List of contexts considered "Production"
    prometheusUrls: Record<string, string>  // per-context manual Prometheus URL; '' = auto-discover
    tourCompleted: boolean         // whether the post-connection tour has been shown
    pluginsEnabled: boolean        // whether the Plugins (Krew) panel is shown in the sidebar
    gitopsEnabled: boolean         // whether the GitOps panel is shown in the sidebar
    networkEnabled: boolean        // whether Network Map and Connectivity panels are shown in the sidebar
}

const SETTINGS_DIR = join(homedir(), '.podscape')
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json')

const DEFAULTS: PodscapeSettings = {
    shellPath: '',
    theme: 'dark',
    kubeconfigPath: '',
    prodContexts: [],
    prometheusUrls: {},
    tourCompleted: false,
    pluginsEnabled: true,
    gitopsEnabled: true,
    networkEnabled: true,
}

export function getSettings(): PodscapeSettings {
    try {
        if (existsSync(SETTINGS_FILE)) {
            return { ...DEFAULTS, ...JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) }
        }
    } catch { /* ignore */ }
    return DEFAULTS
}

// Serializes concurrent saveSettings calls so interleaved read-modify-write
// sequences (e.g. settings:set racing with kubeconfig:selectPath) don't clobber each other.
let writeLock: Promise<void> = Promise.resolve()

export function saveSettings(settings: PodscapeSettings): void {
    const data = JSON.stringify(settings, null, 2)
    writeLock = writeLock.then(() => {
        if (!existsSync(SETTINGS_DIR)) {
            mkdirSync(SETTINGS_DIR, { recursive: true })
        }
        // Atomic write: write to a temp file then rename so a crash mid-write
        // never leaves settings.json as a zero-byte or partial JSON file.
        const tmp = SETTINGS_FILE + '.tmp'
        writeFileSync(tmp, data)
        renameSync(tmp, SETTINGS_FILE)
    }).catch(err => {
        console.error('[saveSettings] failed to write settings:', err)
    })
}

export function findKubeconfigPath(): string {
    const { kubeconfigPath } = getSettings()
    if (kubeconfigPath && existsSync(kubeconfigPath)) return kubeconfigPath
    return process.env.KUBECONFIG || join(homedir(), '.kube', 'config')
}
