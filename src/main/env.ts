import { homedir } from 'os'
import { join } from 'path'
import { getSettings } from './settings_storage'

/**
 * Build a clean env object for subprocesses.
 * 
 * Filter out undefined values to avoid posix_spawnp failures in node-pty
 * and augment PATH on macOS to ensure binaries in Homebrew or /usr/local/bin
 * are reachable, even when the app is launched from the GUI.
 */
export function getAugmentedEnv(extra: Record<string, string> = {}): Record<string, string> {
    const base: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
    )

    if (process.platform === 'darwin') {
        const existing = (base.PATH ?? '').split(':').filter(Boolean)
        const macPaths = [
            '/opt/homebrew/bin',
            '/opt/homebrew/sbin',
            '/usr/local/bin',
            '/usr/local/sbin',
            '/usr/bin',
            '/usr/sbin',
            '/bin',
            '/sbin'
        ]
        for (const p of macPaths) {
            if (!existing.includes(p)) existing.push(p)
        }
        base.PATH = existing.join(':')
    }

    const { kubeconfigPath } = getSettings()
    const kubecfg = kubeconfigPath || process.env.KUBECONFIG || join(homedir(), '.kube', 'config')

    return { ...base, HOME: homedir(), KUBECONFIG: kubecfg, ...extra }
}
