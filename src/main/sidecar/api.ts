import { activeSidecarPort } from './runtime'
import { sidecarToken } from './auth'
import { SIDECAR_HOST } from '../../common/constants'

export async function sidecarFetch(path: string, options?: RequestInit) {
  const url = `http://${SIDECAR_HOST}:${activeSidecarPort}${path.startsWith('/') ? '' : '/'}${path}`

  const maxRetries = 20
  // Delay between retries:
  //  ECONNREFUSED          → 500 ms (sidecar process still starting up)
  //  socket-reset errors   → 0 ms   (sidecar is running; the connection was
  //                                   stale from the pool — a fresh connection
  //                                   succeeds immediately, no sleep needed)
  const startupDelay = 500

  const authHeaders = { 'X-Podscape-Token': sidecarToken }
  const mergedOptions: RequestInit = {
    ...options,
    headers: { ...(options?.headers as Record<string, string>), ...authHeaders },
  }

  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, mergedOptions)
      return res
    } catch (err: any) {
      // Retry on transient sidecar-level socket errors in addition to the
      // startup ECONNREFUSED case:
      //
      //  ECONNREFUSED   — sidecar process still starting up
      //  UND_ERR_SOCKET — stale keep-alive connection was reset by the server;
      //                   the next attempt opens a fresh TCP connection and
      //                   succeeds immediately with no delay needed.
      const errCode = err?.code ?? err?.cause?.code ?? ''
      const errMsg = String(err?.message ?? '')

      const isStartupError =
        errCode === 'ECONNREFUSED' ||
        errMsg.includes('ECONNREFUSED')

      const isSocketReset =
        errCode === 'UND_ERR_SOCKET' ||
        errMsg.includes('other side closed') ||
        errMsg.includes('socket hang up')

      if (!isStartupError && !isSocketReset) {
        console.error(`[API] Non-retriable error for ${url}:`, err)
        throw err
      }

      if (i < maxRetries - 1) {
        const delay = isStartupError ? startupDelay : 0
        if (delay > 0) {
          console.log(`[API] Sidecar not ready (attempt ${i + 1}/${maxRetries}) at ${url}. Retrying in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        continue
      }
      console.error(`[API] Sidecar unreachable at ${url} after ${maxRetries} attempts:`, err)
      throw err
    }
  }
  throw new Error(`Failed to reach Sidecar at ${url} after ${maxRetries} attempts`)
}

/**
 * Helper that throws if the response is not OK.
 */
export async function checkedSidecarFetch(path: string, options?: RequestInit) {
  const res = await sidecarFetch(path, options)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Go sidecar returned ${res.status} for ${path}: ${text}`)
  }
  return res
}
