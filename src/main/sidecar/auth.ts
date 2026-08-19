import { randomBytes } from 'crypto'

/**
 * A per-session secret shared between Electron and the Go sidecar.
 * Passed via the PODSCAPE_TOKEN environment variable at sidecar startup —
 * never as a command-line flag, since process arguments are world-readable
 * (`ps aux`). Included as X-Podscape-Token on every HTTP request so the
 * sidecar can reject calls from other processes.
 */
export const sidecarToken: string = randomBytes(32).toString('hex')
