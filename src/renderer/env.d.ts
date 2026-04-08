/// <reference types="vite/client" />

interface UpdaterAPI {
  onAvailable: (cb: (info: { version: string }) => void) => () => void
  onProgress: (cb: (p: { percent: number }) => void) => () => void
  onDownloaded: (cb: (info: { version: string }) => void) => () => void
  onError: (cb: (msg: string) => void) => () => void
  check: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
}

interface SidecarAPI {
  onCrashed: (cb: (info: { code: number | null; signal: string | null }) => void) => () => void
  restart: () => Promise<void>
}

declare interface Window {
  updater?: UpdaterAPI
  sidecar?: SidecarAPI
  electron: any
}
