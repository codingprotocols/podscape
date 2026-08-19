/// <reference types="vite/client" />

/** Injected at build time by the `define` block in electron.vite.config.ts. */
declare const appVersion: string

interface UpdaterAPI {
  onChecking: (cb: () => void) => () => void
  onAvailable: (cb: (info: { version: string }) => void) => () => void
  onNotAvailable: (cb: () => void) => () => void
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
