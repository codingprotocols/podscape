import { randomBytes } from 'crypto'

/**
 * A per-session secret shared between Electron and the Go sidecar.
 * Passed as the -token flag at sidecar startup; included as X-Podscape-Token
 * on every HTTP request so the sidecar can reject calls from other processes.
 */
export const sidecarToken: string = randomBytes(32).toString('hex')
