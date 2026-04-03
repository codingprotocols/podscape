import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// ─── kubectl API ──────────────────────────────────────────────────────────────

const kubectl = {
  // Context
  getContexts: () => ipcRenderer.invoke('kubectl:getContexts'),
  getCurrentContext: () => ipcRenderer.invoke('kubectl:getCurrentContext'),
  switchContext: (context: string) => ipcRenderer.invoke('kubectl:switchContext', context),

  // Namespaces
  getNamespaces: (context: string) => ipcRenderer.invoke('kubectl:getNamespaces', context),

  // Workloads
  getPods: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getPods', context, namespace),
  getDeployments: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getDeployments', context, namespace),
  getStatefulSets: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getStatefulSets', context, namespace),
  getReplicaSets: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getReplicaSets', context, namespace),
  getJobs: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getJobs', context, namespace),
  getCronJobs: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getCronJobs', context, namespace),

  // Network
  getServices: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getServices', context, namespace),
  getIngresses: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getIngresses', context, namespace),

  // Config
  getConfigMaps: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getConfigMaps', context, namespace),
  getSecrets: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getSecrets', context, namespace),

  // Cluster
  getNodes: (context: string) => ipcRenderer.invoke('kubectl:getNodes', context),
  getCRDs: (context: string) => ipcRenderer.invoke('kubectl:getCRDs', context),

  // Events
  getEvents: (context: string, namespace: string | null): Promise<import('../renderer/types').KubeEvent[]> =>
    ipcRenderer.invoke('kubectl:getEvents', context, namespace),

  // Generic CRD instance fetcher (for Traefik IngressRoute, Istio VirtualService, etc.)
  getCustomResource: (context: string, namespace: string | null, crdName: string) =>
    ipcRenderer.invoke('kubectl:getCustomResource', context, namespace, crdName),

  // Metrics
  getPodMetrics: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getPodMetrics', context, namespace),
  getNodeMetrics: (context: string) =>
    ipcRenderer.invoke('kubectl:getNodeMetrics', context),

  // Debug Pod
  createDebugPod: (context: string, namespace: string, image: string, name: string) =>
    ipcRenderer.invoke('kubectl:createDebugPod', context, namespace, image, name),

  // Operations
  scale: (context: string, namespace: string, name: string, replicas: number) =>
    ipcRenderer.invoke('kubectl:scale', context, namespace, name, replicas),
  scaleResource: (context: string, namespace: string, kind: string, name: string, replicas: number) =>
    ipcRenderer.invoke('kubectl:scaleResource', context, namespace, kind, name, replicas),
  rolloutRestart: (context: string, namespace: string, kind: string, name: string) =>
    ipcRenderer.invoke('kubectl:rolloutRestart', context, namespace, kind, name),
  rolloutHistory: (context: string, namespace: string, kind: string, name: string) =>
    ipcRenderer.invoke('kubectl:rolloutHistory', context, namespace, kind, name),
  rolloutUndo: (context: string, namespace: string, kind: string, name: string, revision?: number) =>
    ipcRenderer.invoke('kubectl:rolloutUndo', context, namespace, kind, name, revision),
  getResourceEvents: (context: string, namespace: string, kind: string, name: string) =>
    ipcRenderer.invoke('kubectl:getResourceEvents', context, namespace, kind, name),
  cordonNode: (context: string, name: string, unschedulable: boolean): Promise<void> =>
    ipcRenderer.invoke('kubectl:cordonNode', context, name, unschedulable),
  drainNode: (context: string, name: string): Promise<void> =>
    ipcRenderer.invoke('kubectl:drainNode', context, name),
  triggerCronJob: (context: string, namespace: string, name: string): Promise<string> =>
    ipcRenderer.invoke('kubectl:triggerCronJob', context, namespace, name),
  deleteResource: (context: string, namespace: string | null, kind: string, name: string) =>
    ipcRenderer.invoke('kubectl:deleteResource', context, namespace, kind, name),
  getYAML: (context: string, namespace: string | null, kind: string, name: string) =>
    ipcRenderer.invoke('kubectl:getYAML', context, namespace, kind, name),
  getSecretValue: (context: string, namespace: string, name: string, key: string) =>
    ipcRenderer.invoke('kubectl:getSecretValue', context, namespace, name, key),
  execCommand: (context: string, namespace: string, pod: string, container: string, command: string[]) =>
    ipcRenderer.invoke('kubectl:execCommand', context, namespace, pod, container, command),
  applyYAML: (context: string, yaml: string) =>
    ipcRenderer.invoke('kubectl:applyYAML', context, yaml),

  // Additional Workloads
  getDaemonSets: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getDaemonSets', context, namespace),

  // Autoscaling
  getHPAs: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getHPAs', context, namespace),
  getPodDisruptionBudgets: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getPodDisruptionBudgets', context, namespace),

  // Extended Network
  getIngressClasses: (context: string) =>
    ipcRenderer.invoke('kubectl:getIngressClasses', context),
  getNetworkPolicies: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getNetworkPolicies', context, namespace),
  getEndpoints: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getEndpoints', context, namespace),

  // Storage
  getPVCs: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getPVCs', context, namespace),
  getPVs: (context: string) =>
    ipcRenderer.invoke('kubectl:getPVs', context),
  getStorageClasses: (context: string) =>
    ipcRenderer.invoke('kubectl:getStorageClasses', context),

  // RBAC
  getServiceAccounts: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getServiceAccounts', context, namespace),
  getRoles: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getRoles', context, namespace),
  getClusterRoles: (context: string) =>
    ipcRenderer.invoke('kubectl:getClusterRoles', context),
  getRoleBindings: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getRoleBindings', context, namespace),
  getClusterRoleBindings: (context: string) =>
    ipcRenderer.invoke('kubectl:getClusterRoleBindings', context),

  // Cache readiness — true once the sidecar informer cache has fully synced
  isReady: (): Promise<boolean> =>
    ipcRenderer.invoke('kubectl:isReady'),

  getTopology: (namespace: string) =>
    ipcRenderer.invoke('kubectl:getTopology', namespace),

  getProviders: () =>
    ipcRenderer.invoke('kubectl:getProviders'),

  // Port Forwarding
  portForward: (context: string, namespace: string, type: string, name: string, localPort: number, remotePort: number, id: string) =>
    ipcRenderer.invoke('kubectl:portForward', context, namespace, type, name, localPort, remotePort, id),
  stopPortForward: (id: string) =>
    ipcRenderer.invoke('kubectl:stopPortForward', id),
  onPortForwardReady: (id: string, cb: (msg: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, pfId: string, msg: string): void => {
      if (pfId === id) cb(msg)
    }
    ipcRenderer.on('portforward:ready', handler)
    return () => ipcRenderer.off('portforward:ready', handler)
  },
  onPortForwardError: (id: string, cb: (msg: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, pfId: string, msg: string): void => {
      if (pfId === id) cb(msg)
    }
    ipcRenderer.on('portforward:error', handler)
    return () => ipcRenderer.off('portforward:error', handler)
  },
  onPortForwardExit: (id: string, cb: () => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, pfId: string): void => {
      if (pfId === id) cb()
    }
    ipcRenderer.on('portforward:exit', handler)
    return () => ipcRenderer.off('portforward:exit', handler)
  },

  // Log streaming
  streamLogs: (
    context: string,
    namespace: string,
    pod: string,
    container: string | undefined,
    onChunk: (chunk: string) => void,
    onEnd: () => void
  ): Promise<string> => {
    const chunkHandler = (
      _e: Electron.IpcRendererEvent, _id: string, chunk: string
    ): void => onChunk(chunk)
    const endHandler = (
      _e: Electron.IpcRendererEvent, _id: string
    ): void => {
      ipcRenderer.off('kubectl:logChunk', chunkHandler)
      ipcRenderer.off('kubectl:logEnd', endHandler)
      onEnd()
    }
    ipcRenderer.on('kubectl:logChunk', chunkHandler)
    ipcRenderer.on('kubectl:logEnd', endHandler)
    return ipcRenderer.invoke('kubectl:streamLogs', context, namespace, pod, container)
  },
  stopLogs: (streamId: string) => ipcRenderer.invoke('kubectl:stopLogs', streamId),
  cancelAllStreams: (): Promise<void> => ipcRenderer.invoke('kubectl:cancelAllStreams'),

  // File transfer (kubectl cp)
  copyToContainer: (
    context: string, namespace: string, pod: string, container: string,
    localPath: string, remotePath: string
  ): Promise<void> =>
    ipcRenderer.invoke('kubectl:copyToContainer', context, namespace, pod, container, localPath, remotePath),

  copyFromContainer: (
    context: string, namespace: string, pod: string, container: string,
    remotePath: string, localPath: string
  ): Promise<void> =>
    ipcRenderer.invoke('kubectl:copyFromContainer', context, namespace, pod, container, remotePath, localPath),

  scanSecurity: () => ipcRenderer.invoke('kubectl:scanSecurity'),
  scanKubesecBatch: (resources: any[]) => ipcRenderer.invoke('kubectl:scanKubesecBatch', resources),
  scanTrivyImages: (workloads: any[]) => ipcRenderer.invoke('kubectl:scanTrivyImages', workloads),
  onSecurityProgress: (cb: (line: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, line: string): void => cb(line)
    ipcRenderer.on('security:progress', handler)
    return () => ipcRenderer.off('security:progress', handler)
  },

  // Prometheus
  prometheusStatus: (url?: string) => ipcRenderer.invoke('kubectl:prometheusStatus', url),
  prometheusQueryBatch: (queries: any[], start: number, end: number) =>
    ipcRenderer.invoke('kubectl:prometheusQueryBatch', queries, start, end),

  // Owner chain
  getOwnerChain: (kind: string, name: string, namespace: string) =>
    ipcRenderer.invoke('kubectl:getOwnerChain', kind, name, namespace),

  // TLS Certificate Dashboard
  getTLSCerts: (namespace?: string) =>
    ipcRenderer.invoke('kubectl:getTLSCerts', namespace),

  // GitOps Panel
  getGitOps: (namespace?: string) =>
    ipcRenderer.invoke('kubectl:getGitOps', namespace),
  reconcileGitOps: (kind: string, name: string, namespace: string): Promise<void> =>
    ipcRenderer.invoke('kubectl:reconcileGitOps', kind, name, namespace),
  suspendGitOps: (kind: string, name: string, namespace: string, suspend: boolean): Promise<void> =>
    ipcRenderer.invoke('kubectl:suspendGitOps', kind, name, namespace, suspend),

}

// ─── dialog API ───────────────────────────────────────────────────────────────

const dialog = {
  /** Open a native file picker. Returns the chosen path, or null if cancelled. */
  showOpenFile: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:showOpenFile'),

  /** Open a native save dialog. Returns the chosen path, or null if cancelled. */
  showSaveFile: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:showSaveFile', defaultName),
}


// ─── exec API ─────────────────────────────────────────────────────────────────

const exec = {
  start: (context: string, namespace: string, pod: string, container: string): Promise<string> =>
    ipcRenderer.invoke('exec:start', context, namespace, pod, container),
  write: (id: string, data: string): Promise<void> =>
    ipcRenderer.invoke('exec:write', id, data),
  resize: (id: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke('exec:resize', id, cols, rows),
  kill: (id: string): Promise<void> =>
    ipcRenderer.invoke('exec:kill', id),
  onData: (id: string, cb: (data: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, ptId: string, data: string): void => {
      if (ptId === id) cb(data)
    }
    ipcRenderer.on('exec:data', handler)
    return () => ipcRenderer.off('exec:data', handler)
  },
  onExit: (id: string, cb: () => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, ptId: string): void => {
      if (ptId === id) cb()
    }
    ipcRenderer.on('exec:exit', handler)
    return () => ipcRenderer.off('exec:exit', handler)
  }
}


// ─── helm API ─────────────────────────────────────────────────────────────────

const helm = {
  list: (context: string): Promise<unknown[]> =>
    ipcRenderer.invoke('helm:list', context),
  status: (context: string, namespace: string, release: string): Promise<string> =>
    ipcRenderer.invoke('helm:status', context, namespace, release),
  values: (context: string, namespace: string, release: string): Promise<string> =>
    ipcRenderer.invoke('helm:values', context, namespace, release),
  history: (context: string, namespace: string, release: string): Promise<unknown[]> =>
    ipcRenderer.invoke('helm:history', context, namespace, release),
  rollback: (context: string, namespace: string, release: string, revision: number): Promise<string> =>
    ipcRenderer.invoke('helm:rollback', context, namespace, release, revision),
  uninstall: (context: string, namespace: string, release: string): Promise<string> =>
    ipcRenderer.invoke('helm:uninstall', context, namespace, release),
  upgrade: (context: string, namespace: string, release: string, values: string): Promise<string> =>
    ipcRenderer.invoke('helm:upgrade', context, namespace, release, values),

  // Helm repo browser
  repoList: () => ipcRenderer.invoke('helm:repoList'),
  repoSearch: (query: string, limit: number, offset: number) =>
    ipcRenderer.invoke('helm:repoSearch', query, limit, offset),
  repoVersions: (repoName: string, chartName: string) =>
    ipcRenderer.invoke('helm:repoVersions', repoName, chartName),
  repoValues: (repoName: string, chartName: string, version: string) =>
    ipcRenderer.invoke('helm:repoValues', repoName, chartName, version),
  repoRefresh: () => ipcRenderer.invoke('helm:repoRefresh'),
  install: (chart: string, version: string, releaseName: string, namespace: string, values: string, context: string) =>
    ipcRenderer.invoke('helm:install', chart, version, releaseName, namespace, values, context),
  onInstallProgress: (cb: (msg: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, msg: string): void => cb(msg)
    ipcRenderer.on('helm:installProgress', handler)
    return () => ipcRenderer.off('helm:installProgress', handler)
  },
  onRefreshProgress: (cb: (msg: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, msg: string): void => cb(msg)
    ipcRenderer.on('helm:refreshProgress', handler)
    return () => ipcRenderer.off('helm:refreshProgress', handler)
  },
}

// ─── settings API ─────────────────────────────────────────────────────────────

const settings = {
  get: (): Promise<{ shellPath: string; theme: string; kubeconfigPath: string; prodContexts: string[]; prometheusUrls?: Record<string, string>; tourCompleted: boolean }> =>
    ipcRenderer.invoke('settings:get'),
  set: (s: { shellPath: string; theme: string; kubeconfigPath: string; prodContexts: string[]; prometheusUrls?: Record<string, string>; tourCompleted: boolean }): Promise<void> =>
    ipcRenderer.invoke('settings:set', s),
  checkTools: (): Promise<{ kubeconfigOk: boolean; trivyOk: boolean }> =>
    ipcRenderer.invoke('settings:checkTools')
}

// ─── kubeconfig API ───────────────────────────────────────────────────────────

const kubeconfig = {
  get: (): Promise<{ path: string; content: string }> =>
    ipcRenderer.invoke('kubeconfig:get'),
  set: (content: string): Promise<void> =>
    ipcRenderer.invoke('kubeconfig:set', content),
  reveal: (): Promise<void> =>
    ipcRenderer.invoke('kubeconfig:reveal'),
  selectPath: (): Promise<string | null> =>
    ipcRenderer.invoke('kubeconfig:selectPath'),
  clearPath: (): Promise<void> =>
    ipcRenderer.invoke('kubeconfig:clearPath')
}

// ─── updater API ──────────────────────────────────────────────────────────────

const updater = {
  onAvailable: (cb: (info: { version: string }) => void): (() => void) => {
    const h = (_e: Electron.IpcRendererEvent, info: { version: string }): void => cb(info)
    ipcRenderer.on('updater:available', h)
    return () => ipcRenderer.off('updater:available', h)
  },
  onProgress: (cb: (p: { percent: number }) => void): (() => void) => {
    const h = (_e: Electron.IpcRendererEvent, p: { percent: number }): void => cb(p)
    ipcRenderer.on('updater:progress', h)
    return () => ipcRenderer.off('updater:progress', h)
  },
  onDownloaded: (cb: (info: { version: string }) => void): (() => void) => {
    const h = (_e: Electron.IpcRendererEvent, info: { version: string }): void => cb(info)
    ipcRenderer.on('updater:downloaded', h)
    return () => ipcRenderer.off('updater:downloaded', h)
  },
  onError: (cb: (msg: string) => void): (() => void) => {
    const h = (_e: Electron.IpcRendererEvent, msg: string): void => cb(msg)
    ipcRenderer.on('updater:error', h)
    return () => ipcRenderer.off('updater:error', h)
  },
  check: (): Promise<void> => ipcRenderer.invoke('updater:check'),
  download: (): Promise<void> => ipcRenderer.invoke('updater:download'),
  install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
}

// ─── sidecar API ──────────────────────────────────────────────────────────────

const sidecar = {
  onCrashed: (cb: (info: { code: number | null; signal: string | null }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { code: number | null; signal: string | null }): void => cb(info)
    ipcRenderer.on('sidecar:crashed', handler)
    return () => ipcRenderer.off('sidecar:crashed', handler)
  },
  restart: (): Promise<void> => ipcRenderer.invoke('sidecar:restart'),
}

// ─── Expose ───────────────────────────────────────────────────────────────────

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', {
      ...electronAPI,
      shell: { openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url) },
    })
    contextBridge.exposeInMainWorld('kubectl', kubectl)
    contextBridge.exposeInMainWorld('helm', helm)
    contextBridge.exposeInMainWorld('exec', exec)
    contextBridge.exposeInMainWorld('settings', settings)
    contextBridge.exposeInMainWorld('kubeconfig', kubeconfig)
    contextBridge.exposeInMainWorld('dialog', dialog)
    contextBridge.exposeInMainWorld('updater', updater)
    contextBridge.exposeInMainWorld('sidecar', sidecar)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = {
    ...electronAPI,
    shell: { openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url) },
  }
  // @ts-ignore
  window.kubectl = kubectl
  // @ts-ignore
  window.helm = helm
  // @ts-ignore
  window.exec = exec
  // @ts-ignore
  window.settings = settings
  // @ts-ignore
  window.kubeconfig = kubeconfig
  // @ts-ignore
  window.dialog = dialog
  // @ts-ignore
  window.updater = updater
  // @ts-ignore
  window.sidecar = sidecar
}
