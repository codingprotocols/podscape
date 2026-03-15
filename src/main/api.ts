import { activeSidecarPort } from './runtime'
import { sidecarToken } from './auth'

export async function sidecarFetch(path: string, options?: RequestInit) {
  const url = `http://127.0.0.1:${activeSidecarPort}${path.startsWith('/') ? '' : '/'}${path}`

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
      // Only retry on connection-refused (sidecar still starting up).
      // Any other network error (DNS failure, TLS error, etc.) is a hard fault.
      const isConnRefused =
        err?.code === 'ECONNREFUSED' ||
        err?.cause?.code === 'ECONNREFUSED' ||
        String(err?.message ?? '').includes('ECONNREFUSED')

      if (!isConnRefused) {
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
