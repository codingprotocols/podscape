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
  getEvents: (context: string, namespace: string | null) =>
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
}

// ─── settings API ─────────────────────────────────────────────────────────────

const settings = {
  get: (): Promise<{ kubectlPath: string; shellPath: string; helmPath: string; theme: string; kubeconfigPath: string; prodContexts: string[] }> =>
    ipcRenderer.invoke('settings:get'),
  set: (s: { kubectlPath: string; shellPath: string; helmPath: string; theme: string; kubeconfigPath: string; prodContexts: string[] }): Promise<void> =>
    ipcRenderer.invoke('settings:set', s),
  checkTools: (): Promise<{ kubectlOk: boolean; helmOk: boolean; kubeconfigOk: boolean }> =>
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

// ─── Expose ───────────────────────────────────────────────────────────────────

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('kubectl', kubectl)
    contextBridge.exposeInMainWorld('helm', helm)
    contextBridge.exposeInMainWorld('exec', exec)
    contextBridge.exposeInMainWorld('settings', settings)
    contextBridge.exposeInMainWorld('kubeconfig', kubeconfig)
    contextBridge.exposeInMainWorld('dialog', dialog)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
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
}
