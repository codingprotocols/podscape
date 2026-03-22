import { homedir } from 'os'
import { join } from 'path'
import { getSettings } from './settings_storage'

/**
 * Build a clean env object for subprocesses.
 *
 * Filters out undefined values (avoids posix_spawnp failures in node-pty) and
 * augments PATH so that cloud-provider credential helpers are reachable even
 * when the app is launched from the GUI rather than a login shell.
 *
 * Covered credential helpers and their typical install paths:
 *   AWS        — aws CLI / aws-iam-authenticator  (/opt/homebrew/bin, /usr/local/bin, ~/.local/bin)
 *   GCP        — gcloud / gke-gcloud-auth-plugin  (~/google-cloud-sdk/bin, /usr/local/google-cloud-sdk/bin)
 *   Azure      — az CLI / kubelogin               (/opt/homebrew/bin, /usr/local/bin)
 *   DO         — doctl                            (/opt/homebrew/bin, /usr/local/bin)
 *   Oracle     — oci CLI                          (~/.oci/bin, ~/lib/oracle-cli/bin)
 *   IBM Cloud  — ibmcloud CLI                     (~/.ibmcloud/bin)
 *   OpenShift  — oc / crc                         (~/.crc/bin, /usr/local/bin)
 *   Tanzu      — tanzu CLI                        (~/.local/share/tanzu-cli)
 */
export function getAugmentedEnv(extra: Record<string, string> = {}): Record<string, string> {
    const base: Record<string, string> = Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
    )

    const home = homedir()

    // Paths common to macOS and Linux that may be absent when the app is
    // launched from the GUI (no login shell → stripped PATH).
    const commonPaths = [
        // Standard system paths
        '/usr/local/bin',
        '/usr/local/sbin',
        '/usr/bin',
        '/usr/sbin',
        '/bin',
        '/sbin',
        // User-local installs (pip-installed aws CLI, custom scripts, etc.)
        join(home, '.local', 'bin'),
        join(home, 'bin'),
        // GCP — gcloud SDK installer puts binaries here by default
        join(home, 'google-cloud-sdk', 'bin'),
        '/usr/local/google-cloud-sdk/bin',
        '/opt/google-cloud-sdk/bin',
        // Oracle OCI CLI — installed via pip or the install.sh script
        join(home, '.oci', 'bin'),
        join(home, 'lib', 'oracle-cli', 'bin'),
        // IBM Cloud CLI — ibmcloud binary lands here after install
        join(home, '.ibmcloud', 'bin'),
        // Red Hat CRC (crc, oc bundled) — default install path
        join(home, '.crc', 'bin'),
        // VMware Tanzu CLI
        join(home, '.local', 'share', 'tanzu-cli'),
    ]

    if (process.platform === 'darwin') {
        const existing = (base.PATH ?? '').split(':').filter(Boolean)
        const macPaths = [
            // Homebrew (Apple Silicon and Intel)
            '/opt/homebrew/bin',
            '/opt/homebrew/sbin',
            ...commonPaths,
        ]
        for (const p of macPaths) {
            if (!existing.includes(p)) existing.push(p)
        }
        base.PATH = existing.join(':')
    } else if (process.platform === 'linux') {
        const existing = (base.PATH ?? '').split(':').filter(Boolean)
        const linuxPaths = [
            ...commonPaths,
            '/snap/bin',           // snap-installed tools (doctl, kubectl, etc.)
        ]
        for (const p of linuxPaths) {
            if (!existing.includes(p)) existing.push(p)
        }
        base.PATH = existing.join(':')
    } else if (process.platform === 'win32') {
        const existing = (base.PATH ?? '').split(';').filter(Boolean)
        const progFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
        const progFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
        const winPaths = [
            // AWS CLI v2 default install
            join(progFiles, 'Amazon', 'AWSCLIV2'),
            // Azure CLI default install
            join(progFiles, 'Microsoft SDKs', 'Azure', 'CLI2', 'wbin'),
            // GCP SDK default install
            join(home, 'AppData', 'Local', 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin'),
            // Oracle OCI CLI — installer places it here by default
            join(progFiles, 'Oracle', 'oci', 'bin'),
            join(home, 'Oracle', 'oci'),
            // IBM Cloud CLI — default install location
            join(progFiles, 'IBM', 'Cloud', 'bin'),
            join(progFilesX86, 'IBM', 'Cloud', 'bin'),
            // OpenShift oc / Red Hat CRC — openshift-install and oc often placed here
            'C:\\OpenShift',
            join(home, '.crc', 'bin', 'oc'),
            // VMware Tanzu CLI
            join(progFiles, 'tanzu-cli'),
            join(home, 'AppData', 'Local', 'tanzu-cli'),
            // kubelogin, doctl and other tools installed via winget / scoop / chocolatey
            join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages'),
            join(home, 'scoop', 'shims'),
            'C:\\ProgramData\\chocolatey\\bin',
            // User-local bin (manually placed binaries)
            join(home, 'bin'),
        ]
        for (const p of winPaths) {
            if (!existing.includes(p)) existing.push(p)
        }
        base.PATH = existing.join(';')
    }

    const { kubeconfigPath } = getSettings()
    let kubecfg = kubeconfigPath || process.env.KUBECONFIG || join(home, '.kube', 'config')
    if (!kubecfg) kubecfg = join(home, '.kube', 'config')

    // GKE (v1.26+) requires this to use gke-gcloud-auth-plugin instead of
    // the deprecated built-in credential provider. Safe to set unconditionally
    // — it is ignored on non-GKE clusters.
    if (!base.USE_GKE_GCLOUD_AUTH_PLUGIN) {
        base.USE_GKE_GCLOUD_AUTH_PLUGIN = 'True'
    }

    return { ...base, HOME: home, KUBECONFIG: kubecfg, ...extra }
}
