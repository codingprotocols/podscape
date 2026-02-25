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

  // Metrics
  getPodMetrics: (context: string, namespace: string | null) =>
    ipcRenderer.invoke('kubectl:getPodMetrics', context, namespace),
  getNodeMetrics: (context: string) =>
    ipcRenderer.invoke('kubectl:getNodeMetrics', context),

  // Operations
  scale: (context: string, namespace: string, name: string, replicas: number) =>
    ipcRenderer.invoke('kubectl:scale', context, namespace, name, replicas),
  rolloutRestart: (context: string, namespace: string, kind: string, name: string) =>
    ipcRenderer.invoke('kubectl:rolloutRestart', context, namespace, kind, name),
  deleteResource: (context: string, namespace: string | null, kind: string, name: string) =>
    ipcRenderer.invoke('kubectl:deleteResource', context, namespace, kind, name),
  getYAML: (context: string, namespace: string | null, kind: string, name: string) =>
    ipcRenderer.invoke('kubectl:getYAML', context, namespace, kind, name),
  applyYAML: (context: string, yaml: string) =>
    ipcRenderer.invoke('kubectl:applyYAML', context, yaml),

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
  stopLogs: (streamId: string) => ipcRenderer.invoke('kubectl:stopLogs', streamId)
}

// ─── terminal API ─────────────────────────────────────────────────────────────

const terminal = {
  create: (context?: string, namespace?: string): Promise<string> =>
    ipcRenderer.invoke('terminal:create', context, namespace),
  write: (id: string, data: string): Promise<void> =>
    ipcRenderer.invoke('terminal:write', id, data),
  resize: (id: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke('terminal:resize', id, cols, rows),
  kill: (id: string): Promise<void> =>
    ipcRenderer.invoke('terminal:kill', id),
  onData: (id: string, cb: (data: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, ptId: string, data: string): void => {
      if (ptId === id) cb(data)
    }
    ipcRenderer.on('terminal:data', handler)
    return () => ipcRenderer.off('terminal:data', handler)
  },
  onExit: (id: string, cb: () => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, ptId: string): void => {
      if (ptId === id) cb()
    }
    ipcRenderer.on('terminal:exit', handler)
    return () => ipcRenderer.off('terminal:exit', handler)
  }
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

// ─── plugins API ──────────────────────────────────────────────────────────────

const plugins = {
  list: () => ipcRenderer.invoke('plugins:list')
}

// ─── Expose ───────────────────────────────────────────────────────────────────

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('kubectl', kubectl)
    contextBridge.exposeInMainWorld('terminal', terminal)
    contextBridge.exposeInMainWorld('exec', exec)
    contextBridge.exposeInMainWorld('plugins', plugins)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.kubectl = kubectl
  // @ts-ignore
  window.terminal = terminal
  // @ts-ignore
  window.exec = exec
  // @ts-ignore
  window.plugins = plugins
}
