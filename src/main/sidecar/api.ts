import { activeSidecarPort } from './runtime'
import { sidecarToken } from './auth'
import { SIDECAR_HOST } from '../../common/constants'

export async function sidecarFetch(path: string, options?: RequestInit) {
  const url = `http://${SIDECAR_HOST}:${activeSidecarPort}${path.startsWith('/') ? '' : '/'}${path}`

  const maxRetries = 20
  const delay = 500

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
      //  UND_ERR_SOCKET — sidecar dropped the connection mid-request (e.g. the
      //                   Go HTTP server's panic-recovery closed the response
      //                   writer after an upstream EKS stream reset). The next
      //                   attempt will open a fresh TCP connection.
      const errCode = err?.code ?? err?.cause?.code ?? ''
      const errMsg = String(err?.message ?? '')
      const isRetriable =
        errCode === 'ECONNREFUSED' ||
        errCode === 'UND_ERR_SOCKET' ||
        errMsg.includes('ECONNREFUSED') ||
        errMsg.includes('other side closed') ||
        errMsg.includes('socket hang up')

      if (!isRetriable) {
        console.error(`[API] Non-retriable error for ${url}:`, err)
        throw err
      }

      if (i < maxRetries - 1) {
        console.log(`[API] Sidecar not ready (attempt ${i + 1}/${maxRetries}) at ${url}. Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
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
