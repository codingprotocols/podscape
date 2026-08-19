export const SIDECAR_HOST = '127.0.0.1'
export const SIDECAR_PORT = 5050

export interface RolloutRevision {
  revision: number
  current: boolean
  age: string
  images: string[]
  desired: number
  ready: number
}

/**
 * User preferences persisted to ~/.podscape/settings.json.
 *
 * Lives in common/ because both sides need it: main owns the atomic read/write
 * (settings/settings_storage.ts) and the renderer types `window.settings` against
 * it (store/types.ts). Keeping one definition stops the two from drifting.
 */
export interface PodscapeSettings {
  shellPath: string                       // absolute path or '' for auto-detect
  theme: 'light' | 'dark' | ''            // '' means use last-used / OS preference
  kubeconfigPath: string                  // absolute path or '' for default (~/.kube/config)
  prodContexts: string[]                  // contexts considered "Production"
  prometheusUrls: Record<string, string>  // per-context manual Prometheus URL; '' = auto-discover
  tourCompleted: boolean                  // whether the post-connection tour has been shown
  pluginsEnabled: boolean                 // whether the Plugins (Krew) panel is shown in the sidebar
  gitopsEnabled: boolean                  // whether the GitOps panel is shown in the sidebar
  networkEnabled: boolean                 // whether Network Map and Connectivity panels are shown in the sidebar
}
