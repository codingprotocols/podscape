import { ipcMain } from 'electron'
import { checkedSidecarFetch } from './api'

export function registerHelmHandlers(): void {
  const transformRelease = (r: any) => {
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
      app_version: metadata.appVersion || metadata.AppVersion || '',
      description: info.description || info.Description || ''
    }
  }

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
}
