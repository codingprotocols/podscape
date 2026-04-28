import http from 'http'
import { ipcMain } from 'electron'
import { checkedSidecarFetch, sidecarFetch } from '../sidecar/api'
import { activeSidecarPort } from '../sidecar/runtime'
import { sidecarToken } from '../sidecar/auth'
import { SIDECAR_HOST } from '../../common/constants'

export function transformRelease(r: any) {
  const info = r.info || r.Info || {}
  const chart = r.chart || r.Chart || {}
  const metadata = chart.metadata || chart.Metadata || {}

  return {
    name: r.name || r.Name || '',
    namespace: r.namespace || r.Namespace || '',
    revision: String(r.version || r.Version || '0'),
    updated: info.last_deployed || info.LastDeployed || '',
    status: String(info.status || info.Status || 'unknown'),
    chart: metadata.name ? `${metadata.name}-${metadata.version || ''}` : 'unknown',
    chart_name: metadata.name || '',
    chart_version: metadata.version || '',
    app_version: metadata.appVersion || metadata.AppVersion || '',
    description: info.description || info.Description || '',
  }
}

export function registerHelmHandlers(): void {

  // List all releases across namespaces
  ipcMain.handle('helm:list', async (_event, context: string) => {
    const res = await checkedSidecarFetch(`/helm/list?context=${encodeURIComponent(context)}`)
    const raw = await res.json() as any[]
    return (Array.isArray(raw) ? raw : []).map(transformRelease)
  })

  // Get release status (detailed info)
  ipcMain.handle('helm:status', async (_event, _context: string, namespace: string, release: string) => {
    const res = await checkedSidecarFetch(`/helm/status?namespace=${encodeURIComponent(namespace)}&release=${encodeURIComponent(release)}`)
    return await res.json()
  })

  // Get release values (YAML format, including all computed values)
  ipcMain.handle('helm:values', async (_event, _context: string, namespace: string, release: string) => {
    const res = await checkedSidecarFetch(`/helm/values?namespace=${encodeURIComponent(namespace)}&release=${encodeURIComponent(release)}&all=true`)
    return await res.text()
  })

  // Get release history
  ipcMain.handle('helm:history', async (_event, _context: string, namespace: string, release: string) => {
    const res = await checkedSidecarFetch(`/helm/history?namespace=${encodeURIComponent(namespace)}&release=${encodeURIComponent(release)}`)
    const raw = await res.json() as any[]
    return (Array.isArray(raw) ? raw : []).map(transformRelease)
  })

  // Rollback to revision
  ipcMain.handle('helm:rollback', async (_event, _context: string, namespace: string, release: string, revision: number) => {
    await checkedSidecarFetch(`/helm/rollback?namespace=${encodeURIComponent(namespace)}&release=${encodeURIComponent(release)}&revision=${revision}`)
    return 'Rollback successful'
  })


  // Uninstall release
  ipcMain.handle('helm:uninstall', async (_event, _context: string, namespace: string, release: string) => {
    await checkedSidecarFetch(`/helm/uninstall?namespace=${encodeURIComponent(namespace)}&release=${encodeURIComponent(release)}`)
    return 'Uninstall successful'
  })

  // ── Helm Repo Browser ─────────────────────────────────────────────────────

  ipcMain.handle('helm:repoList', async () => {
    const res = await checkedSidecarFetch('/helm/repos')
    return res.json()
  })

  ipcMain.handle('helm:repoAdd', async (_e, name: string, url: string) => {
    const params = new URLSearchParams({ name, url })
    const res = await checkedSidecarFetch(`/helm/repos/add?${params}`, { method: 'POST' })
    return res.json()
  })

  ipcMain.handle('helm:repoSearch', async (_e, query: string, limit: number, offset: number) => {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      offset: String(offset),
    })
    const res = await checkedSidecarFetch(`/helm/repos/search?${params}`)
    return res.json()
  })

  ipcMain.handle('helm:repoLatest', async (_e, chartName: string) => {
    const res = await sidecarFetch(`/helm/repos/latest?chart=${encodeURIComponent(chartName)}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Go sidecar returned ${res.status} for /helm/repos/latest`)
    return res.json()
  })

  ipcMain.handle('helm:repoVersions', async (_e, repoName: string, chartName: string) => {
    const params = new URLSearchParams({ repo: repoName, chart: chartName })
    const res = await checkedSidecarFetch(`/helm/repos/versions?${params}`)
    return res.json()
  })

  ipcMain.handle('helm:repoValues', async (_e, repoName: string, chartName: string, version: string) => {
    const params = new URLSearchParams({ repo: repoName, chart: chartName, version })
    const res = await checkedSidecarFetch(`/helm/repos/values?${params}`)
    return res.text()
  })

  // helm:repoRefresh — SSE relay (mirrors kubectl:scanSecurity pattern)
  ipcMain.handle('helm:repoRefresh', (event) => {
    return new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: SIDECAR_HOST,
          port: activeSidecarPort,
          path: '/helm/repos/refresh',
          method: 'POST',
          headers: { 'X-Podscape-Token': sidecarToken },
        },
        (res) => {
          let buf = ''
          res.on('data', (chunk: Buffer) => {
            buf += chunk.toString()
            const parts = buf.split('\n\n')
            buf = parts.pop() ?? ''
            for (const part of parts) {
              const eventLine = part.split('\n').find(l => l.startsWith('event:'))
              const dataLine = part.split('\n').find(l => l.startsWith('data:'))
              if (!eventLine || !dataLine) continue
              const evtType = eventLine.slice(6).trim()
              const data = dataLine.slice(5).trim()
              if (evtType === 'progress') {
                if (!event.sender.isDestroyed()) event.sender.send('helm:refreshProgress', data)
              } else if (evtType === 'result') {
                resolve()
              } else if (evtType === 'error') {
                reject(new Error(data))
              }
            }
          })
          res.on('end', () => resolve())
          res.on('error', reject)
        }
      )
      req.on('error', reject)
      req.end()
    })
  })

  // helm:install — SSE relay
  ipcMain.handle('helm:install', (event, chart: string, version: string, releaseName: string, namespace: string, values: string, context: string) => {
    return new Promise<void>((resolve, reject) => {
      const body = JSON.stringify({ chart, version, name: releaseName, namespace, values, context })
      const req = http.request(
        {
          hostname: SIDECAR_HOST,
          port: activeSidecarPort,
          path: '/helm/install',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Podscape-Token': sidecarToken,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let buf = ''
          res.on('data', (chunk: Buffer) => {
            buf += chunk.toString()
            const parts = buf.split('\n\n')
            buf = parts.pop() ?? ''
            for (const part of parts) {
              const eventLine = part.split('\n').find(l => l.startsWith('event:'))
              const dataLine = part.split('\n').find(l => l.startsWith('data:'))
              if (!eventLine || !dataLine) continue
              const evtType = eventLine.slice(6).trim()
              const data = dataLine.slice(5).trim()
              if (evtType === 'progress') {
                if (!event.sender.isDestroyed()) event.sender.send('helm:installProgress', data)
              } else if (evtType === 'result') {
                resolve()
              } else if (evtType === 'error') {
                reject(new Error(data))
              }
            }
          })
          res.on('end', () => resolve())
          res.on('error', reject)
        }
      )
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  })
}
