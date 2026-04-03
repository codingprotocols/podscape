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
