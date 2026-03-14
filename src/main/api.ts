import { SIDECAR_BASE_URL } from '../common/constants'

export async function sidecarFetch(path: string, options?: RequestInit) {
  const url = `${SIDECAR_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`

  const maxRetries = 20
  const delay = 500

  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options)
      return res
    } catch (err: any) {
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
