import http from 'http'
import { ipcMain } from 'electron'
import { checkedSidecarFetch, sidecarFetch } from './api'
import { activeSidecarPort } from './runtime'
import { sidecarToken } from './auth'
import { SIDECAR_HOST } from '../common/constants'

export class KubectlProvider {
  async getContexts(): Promise<unknown[]> {
    const res = await checkedSidecarFetch('/config/contexts')
    const contextsMap = await res.json() as Record<string, any>
    return Object.entries(contextsMap).map(([name, context]) => ({
      name,
      context
    }))
  }

  async getCurrentContext(): Promise<string> {
    const res = await checkedSidecarFetch('/config/current-context')
    return (await res.text()).trim()
  }

  async switchContext(context: string): Promise<void> {
    await checkedSidecarFetch(`/config/switch?context=${encodeURIComponent(context)}`)
  }

  async getNamespaces(_context: string): Promise<unknown[]> {
    return this.getResources(_context, undefined, 'namespaces')
  }

  async getResources(_context: string, namespace: string | null | undefined, kind: string): Promise<any[]> {
    const sidecarMap: Record<string, string> = {
      'nodes': 'nodes',
      'namespaces': 'namespaces',
      'pods': 'pods',
      'deployments': 'deployments',
      'daemonsets': 'daemonsets',
      'statefulsets': 'statefulsets',
      'replicasets': 'replicasets',
      'jobs': 'jobs',
      'cronjobs': 'cronjobs',
      'horizontalpodautoscalers': 'hpas',
      'poddisruptionbudgets': 'pdbs',
      'services': 'services',
      'ingresses': 'ingresses',
      'ingressclasses': 'ingressclasses',
      'networkpolicies': 'networkpolicies',
      'endpoints': 'endpoints',
      'configmaps': 'configmaps',
      'secrets': 'secrets',
      'persistentvolumeclaims': 'pvcs',
      'persistentvolumes': 'pvs',
      'storageclasses': 'storageclasses',
      'serviceaccounts': 'serviceaccounts',
      'roles': 'roles',
      'clusterroles': 'clusterroles',
      'rolebindings': 'rolebindings',
      'clusterrolebindings': 'clusterrolebindings',
      'customresourcedefinitions': 'crds',
      'events': 'events'
    }

    const endpoint = sidecarMap[kind.toLowerCase()] || kind
    const url = `/${endpoint}${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''}`
    const res = await sidecarFetch(url)
    if (res.ok) {
      return await res.json() as any[]
    }
    return []
  }

  async getPodMetrics(_context: string, namespace: string | null): Promise<unknown[]> {
    const url = `/metrics/pods${namespace ? `?namespace=${namespace}` : ''}`
    const res = await sidecarFetch(url)
    if (res.ok) {
      const data = await res.json()
      return Array.isArray(data) ? data : (data.items || [])
    }
    return []
  }

  async getNodeMetrics(_context: string): Promise<unknown[]> {
    const res = await sidecarFetch('/metrics/nodes')
    if (res.ok) {
      const data = await res.json()
      return Array.isArray(data) ? data : (data.items || [])
    }
    return []
  }

  async createDebugPod(_context: string, namespace: string, image: string, name: string): Promise<void> {
    const url = `/debugpod/create?namespace=${namespace}&image=${encodeURIComponent(image)}&name=${encodeURIComponent(name)}`
    await checkedSidecarFetch(url, { method: 'POST' })
  }

  async getSecretValue(context: string, namespace: string, name: string, key: string): Promise<string> {
    const url = `/secret/value?context=${encodeURIComponent(context)}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}&key=${encodeURIComponent(key)}`
    const res = await checkedSidecarFetch(url)
    return await res.text()
  }

  async scaleResource(_context: string, namespace: string, kind: string, name: string, replicas: number): Promise<string> {
    const url = `/scale?namespace=${encodeURIComponent(namespace)}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}&replicas=${replicas}`
    await checkedSidecarFetch(url)
    return 'Scaled successfully'
  }

  async rolloutRestart(_context: string, namespace: string, kind: string, name: string): Promise<string> {
    const url = `/rollout/restart?namespace=${encodeURIComponent(namespace)}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`
    await checkedSidecarFetch(url)
    return 'Restarted successfully'
  }

  async rolloutHistory(_context: string, namespace: string, kind: string, name: string): Promise<string> {
    const url = `/rollout/history?namespace=${encodeURIComponent(namespace)}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`
    const res = await checkedSidecarFetch(url)
    const data = await res.json()
    return JSON.stringify(data, null, 2)
  }

  async rolloutUndo(_context: string, namespace: string, kind: string, name: string, revision?: number): Promise<string> {
    const url = `/rollout/undo?namespace=${encodeURIComponent(namespace)}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}${revision ? `&revision=${revision}` : ''}`
    await checkedSidecarFetch(url)
    return 'Undo successful'
  }

  async getResourceEvents(_context: string, namespace: string, kind: string, name: string): Promise<unknown[]> {
    const url = `/events?namespace=${namespace}&kind=${kind}&name=${name}`
    const res = await sidecarFetch(url)
    if (res.ok) return await res.json()
    return []
  }

  async cordonNode(name: string, unschedulable: boolean): Promise<void> {
    await checkedSidecarFetch(`/node/cordon?name=${encodeURIComponent(name)}&unschedulable=${unschedulable}`, { method: 'POST' })
  }

  async drainNode(name: string): Promise<void> {
    await checkedSidecarFetch(`/node/drain?name=${encodeURIComponent(name)}`, { method: 'POST' })
  }

  async deleteResource(_context: string, namespace: string | null, kind: string, name: string): Promise<string> {
    const url = `/delete?namespace=${encodeURIComponent(namespace || '')}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`
    await checkedSidecarFetch(url)
    return 'Deleted successfully'
  }

  async getYAML(_context: string, namespace: string | null, kind: string, name: string): Promise<string> {
    const url = `/getYAML?namespace=${encodeURIComponent(namespace || '')}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`
    const res = await checkedSidecarFetch(url)
    return await res.text()
  }

  async applyYAML(_context: string, yamlContent: string): Promise<string> {
    const url = `/apply`
    await checkedSidecarFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/yaml' },
      body: yamlContent
    })
    return 'Applied successfully'
  }

  async execCommand(_context: string, namespace: string, pod: string, container: string, command: string[]): Promise<{ stdout: string; exitCode: number }> {
    const url = `/exec/oneshot?namespace=${namespace}&pod=${pod}&container=${container}&${command.map(c => `command=${encodeURIComponent(c)}`).join('&')}`
    const res = await checkedSidecarFetch(url)
    const data = await res.json() as { stdout: string; stderr: string; error?: string }
    return { stdout: data.stdout + (data.stderr || ''), exitCode: data.error ? 1 : 0 }
  }

  async copyToContainer(
    _context: string, namespace: string, pod: string, container: string,
    localPath: string, remotePath: string
  ): Promise<void> {
    const tar = require('tar')
    const { basename, dirname } = require('path')
    const tarStream = tar.c({ gzip: false, C: dirname(localPath) }, [basename(localPath)])
    const url = `/cp/to?namespace=${namespace}&pod=${pod}&container=${container}&path=${encodeURIComponent(remotePath)}`
    await checkedSidecarFetch(url, {
      method: 'POST',
      body: tarStream as any,
      // @ts-ignore
      duplex: 'half'
    })
  }

  async copyFromContainer(
    _context: string, namespace: string, pod: string, container: string,
    remotePath: string, localPath: string
  ): Promise<void> {
    const { writeFile } = require('fs/promises')
    const url = `/cp/from?namespace=${namespace}&pod=${pod}&container=${container}&path=${encodeURIComponent(remotePath)}`
    const res = await checkedSidecarFetch(url)
    const buffer = await res.arrayBuffer()
    await writeFile(localPath, Buffer.from(buffer))
  }

  async scanSecurity(): Promise<any> {
    const res = await checkedSidecarFetch('/security/scan')
    return await res.json()
  }

  async scanKubesec(yaml: string): Promise<any> {
    const res = await checkedSidecarFetch('/security/kubesec', {
      method: 'POST',
      headers: { 'Content-Type': 'text/yaml' },
      body: yaml
    })
    return await res.json()
  }

  async scanKubesecBatch(resources: any[]): Promise<any[]> {
    const res = await checkedSidecarFetch('/security/kubesec/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resources),
    })
    return await res.json()
  }
}

async function getTopology(ns: string): Promise<any> {
  const url = `/topology?namespace=${encodeURIComponent(ns)}`
  const res = await checkedSidecarFetch(url)
  return await res.json()
}

const activeStreams = new Map<string, any>()

export function registerKubectlHandlers(): void {
  const provider = new KubectlProvider()

  ipcMain.handle('kubectl:getContexts', () => provider.getContexts())
  ipcMain.handle('kubectl:getCurrentContext', () => provider.getCurrentContext())
  ipcMain.handle('kubectl:switchContext', (_e, ctx) => provider.switchContext(ctx))
  ipcMain.handle('kubectl:getNamespaces', (_e, ctx) => provider.getNamespaces(ctx))
  ipcMain.handle('kubectl:getPods', (_e, ctx, ns) => provider.getResources(ctx, ns, 'pods'))
  ipcMain.handle('kubectl:getDeployments', (_e, ctx, ns) => provider.getResources(ctx, ns, 'deployments'))
  ipcMain.handle('kubectl:getStatefulSets', (_e, ctx, ns) => provider.getResources(ctx, ns, 'statefulsets'))
  ipcMain.handle('kubectl:getReplicaSets', (_e, ctx, ns) => provider.getResources(ctx, ns, 'replicasets'))
  ipcMain.handle('kubectl:getJobs', (_e, ctx, ns) => provider.getResources(ctx, ns, 'jobs'))
  ipcMain.handle('kubectl:getCronJobs', (_e, ctx, ns) => provider.getResources(ctx, ns, 'cronjobs'))
  ipcMain.handle('kubectl:getDaemonSets', (_e, ctx, ns) => provider.getResources(ctx, ns, 'daemonsets'))
  ipcMain.handle('kubectl:getHPAs', (_e, ctx, ns) => provider.getResources(ctx, ns, 'horizontalpodautoscalers'))
  ipcMain.handle('kubectl:getPodDisruptionBudgets', (_e, ctx, ns) => provider.getResources(ctx, ns, 'poddisruptionbudgets'))
  ipcMain.handle('kubectl:getServices', (_e, ctx, ns) => provider.getResources(ctx, ns, 'services'))
  ipcMain.handle('kubectl:getIngresses', (_e, ctx, ns) => provider.getResources(ctx, ns, 'ingresses'))
  ipcMain.handle('kubectl:getIngressClasses', (_e, ctx) => provider.getResources(ctx, undefined, 'ingressclasses'))
  ipcMain.handle('kubectl:getNetworkPolicies', (_e, ctx, ns) => provider.getResources(ctx, ns, 'networkpolicies'))
  ipcMain.handle('kubectl:getEndpoints', (_e, ctx, ns) => provider.getResources(ctx, ns, 'endpoints'))
  ipcMain.handle('kubectl:getConfigMaps', (_e, ctx, ns) => provider.getResources(ctx, ns, 'configmaps'))
  ipcMain.handle('kubectl:getSecrets', async (_e, ctx, ns) => {
    const items = await provider.getResources(ctx, ns, 'secrets') as Array<{ metadata: unknown; type?: string; data?: Record<string, string> }>
    return items.map(s => ({ ...s, data: s.data ? Object.fromEntries(Object.keys(s.data).map(k => [k, '***MASKED***'])) : undefined }))
  })
  ipcMain.handle('kubectl:getPVCs', (_e, ctx, ns) => provider.getResources(ctx, ns, 'persistentvolumeclaims'))
  ipcMain.handle('kubectl:getPVs', (_e, ctx) => provider.getResources(ctx, undefined, 'persistentvolumes'))
  ipcMain.handle('kubectl:getStorageClasses', (_e, ctx) => provider.getResources(ctx, undefined, 'storageclasses'))
  ipcMain.handle('kubectl:getServiceAccounts', (_e, ctx, ns) => provider.getResources(ctx, ns, 'serviceaccounts'))
  ipcMain.handle('kubectl:getRoles', (_e, ctx, ns) => provider.getResources(ctx, ns, 'roles'))
  ipcMain.handle('kubectl:getClusterRoles', (_e, ctx) => provider.getResources(ctx, undefined, 'clusterroles'))
  ipcMain.handle('kubectl:getRoleBindings', (_e, ctx, ns) => provider.getResources(ctx, ns, 'rolebindings'))
  ipcMain.handle('kubectl:getClusterRoleBindings', (_e, ctx) => provider.getResources(ctx, undefined, 'clusterrolebindings'))
  ipcMain.handle('kubectl:getNodes', (_e, ctx) => provider.getResources(ctx, undefined, 'nodes'))
  ipcMain.handle('kubectl:getCRDs', (_e, ctx) => provider.getResources(ctx, undefined, 'customresourcedefinitions'))
  ipcMain.handle('kubectl:getEvents', (_e, ctx, ns) => provider.getResources(ctx, ns, 'events'))
  ipcMain.handle('kubectl:getCustomResource', (_e, ctx, ns, crdName: string) => provider.getResources(ctx, ns, crdName))
  ipcMain.handle('kubectl:getPodMetrics', (_e, ctx, ns) => provider.getPodMetrics(ctx, ns))
  ipcMain.handle('kubectl:getNodeMetrics', (_e, ctx) => provider.getNodeMetrics(ctx))
  ipcMain.handle('kubectl:createDebugPod', (_e, ctx, ns, image, name) => provider.createDebugPod(ctx, ns, image, name))
  ipcMain.handle('kubectl:scale', (_e, ctx, ns, name, replicas) => provider.scaleResource(ctx, ns, 'deployment', name, replicas))
  ipcMain.handle('kubectl:scaleResource', (_e, ctx, ns, kind, name, replicas) => provider.scaleResource(ctx, ns, kind, name, replicas))
  ipcMain.handle('kubectl:rolloutHistory', (_e, ctx, ns, kind, name) => provider.rolloutHistory(ctx, ns, kind, name))
  ipcMain.handle('kubectl:rolloutUndo', (_e, ctx, ns, kind, name, rev) => provider.rolloutUndo(ctx, ns, kind, name, rev))
  ipcMain.handle('kubectl:getResourceEvents', (_e, ctx, ns, kind, name) => provider.getResourceEvents(ctx, ns, kind, name))
  ipcMain.handle('kubectl:rolloutRestart', (_e, ctx, ns, kind, name) => provider.rolloutRestart(ctx, ns, kind, name))
  ipcMain.handle('kubectl:cordonNode', (_e, _ctx, name, unschedulable) => provider.cordonNode(name, unschedulable))
  ipcMain.handle('kubectl:drainNode', (_e, _ctx, name) => provider.drainNode(name))
  ipcMain.handle('kubectl:deleteResource', (_e, ctx, ns, kind, name) => provider.deleteResource(ctx, ns, kind, name))
  ipcMain.handle('kubectl:getYAML', (_e, ctx, ns, kind, name) => provider.getYAML(ctx, ns, kind, name))
  ipcMain.handle('kubectl:getSecretValue', (_e, ctx, ns, name, key) => provider.getSecretValue(ctx, ns, name, key))
  ipcMain.handle('kubectl:execCommand', (_e, ctx, ns, pod, container, cmd) => provider.execCommand(ctx, ns, pod, container, cmd))
  ipcMain.handle('kubectl:applyYAML', (_e, ctx, yaml) => provider.applyYAML(ctx, yaml))
  ipcMain.handle('kubectl:copyToContainer', (_e, ctx, ns, pod, container, local, remote) => provider.copyToContainer(ctx, ns, pod, container, local, remote))
  ipcMain.handle('kubectl:copyFromContainer', (_e, ctx, ns, pod, container, remote, local) => provider.copyFromContainer(ctx, ns, pod, container, remote, local))

  ipcMain.handle('kubectl:streamLogs', async (event, ctx, ns, pod, container) => {
    const streamId = `${ctx}/${ns}/${pod}${container ? '/' + container : ''}`
    if (activeStreams.has(streamId)) { 
      activeStreams.get(streamId)!.close()
      activeStreams.delete(streamId)
    }

    const WebSocket = require('ws')
    const ws = new WebSocket(`ws://${SIDECAR_HOST}:${activeSidecarPort}/logs?pod=${pod}&namespace=${ns}&container=${container || ''}`, {
      headers: { 'X-Podscape-Token': sidecarToken }
    })
    activeStreams.set(streamId, ws)
    const sender = event.sender

    ws.on('message', (data: Buffer) => {
      if (!sender.isDestroyed()) sender.send('kubectl:logChunk', streamId, data.toString())
    })

    ws.on('error', (err: any) => {
      console.error(`[Logs] WS error for stream ${streamId}:`, err)
      if (!sender.isDestroyed()) sender.send('kubectl:logError', streamId, err.message)
    })

    ws.on('close', (code: number, reason: string) => {
      console.log(`[Logs] WS closed for stream ${streamId}. Code: ${code}, Reason: ${reason || 'no reason'}`)
      activeStreams.delete(streamId)
      if (!sender.isDestroyed()) sender.send('kubectl:logEnd', streamId)
    })

    return streamId
  })

  ipcMain.handle('kubectl:stopLogs', async (_e, streamId) => {
    if (activeStreams.has(streamId)) { 
      activeStreams.get(streamId)!.close()
      activeStreams.delete(streamId)
    }
  })

  ipcMain.handle('kubectl:getTopology', (_e, ns) => getTopology(ns))

  ipcMain.handle('kubectl:portForward', async (event, _ctx, ns, type, name, localPort, remotePort, id) => {
    try {
      const url = `/portforward?id=${id}&namespace=${ns}&type=${type ?? 'pod'}&name=${name}&localPort=${localPort}&remotePort=${remotePort}`
      const res = await sidecarFetch(url)
      if (res.ok) {
        if (!event.sender.isDestroyed()) event.sender.send('portforward:ready', id, 'Forwarding started')
      } else {
        if (!event.sender.isDestroyed()) event.sender.send('portforward:error', id, `Sidecar error: ${res.status}`)
      }
    } catch (err: any) {
       if (!event.sender.isDestroyed()) event.sender.send('portforward:error', id, err.message)
    }
  })

  ipcMain.handle('kubectl:stopPortForward', async (_e, id) => {
    try {
      await sidecarFetch(`/stopPortForward?id=${id}`)
    } catch (err) {
      console.error('Failed to stop port forward', err)
    }
  })

  // Returns true when the sidecar's informer cache is fully synced.
  // /health is token-exempt so no auth header is needed, but sidecarFetch
  // adds it anyway — the sidecar ignores extra headers on that route.
  ipcMain.handle('kubectl:isReady', async () => {
    try {
      const res = await sidecarFetch('/health')
      return res.ok
    } catch {
      return false
    }
  })

  // scanSecurity consumes an SSE stream from the sidecar via http.get (not fetch),
  // avoiding undici's 5-minute bodyTimeout which terminates long-running trivy scans.
  ipcMain.handle('kubectl:scanSecurity', (event) => {
    return new Promise<any>((resolve, reject) => {
      const req = http.get(
        { hostname: SIDECAR_HOST, port: activeSidecarPort, path: '/security/scan',
          headers: { 'X-Podscape-Token': sidecarToken } },
        (res) => {
          const contentType = res.headers['content-type'] ?? ''

          // Non-SSE: trivy_not_found 503 or unexpected status.
          if (!contentType.includes('text/event-stream')) {
            let body = ''
            res.on('data', (chunk: Buffer) => { body += chunk.toString() })
            res.on('end', () => {
              if (res.statusCode !== 200) {
                reject(new Error(`Go sidecar returned ${res.statusCode} for /security/scan: ${body}`))
              } else {
                try { resolve(JSON.parse(body)) } catch { resolve(null) }
              }
            })
            return
          }

          // SSE stream: parse event blocks and relay progress to the renderer.
          let buffer = ''
          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString()
            const blocks = buffer.split('\n\n')
            buffer = blocks.pop() ?? ''

            for (const block of blocks) {
              let eventType = 'message'
              let data = ''
              for (const line of block.split('\n')) {
                if (line.startsWith('event: ')) eventType = line.slice(7).trim()
                else if (line.startsWith('data: ')) data = line.slice(6)
              }

              if (eventType === 'progress' && data) {
                if (!event.sender.isDestroyed()) event.sender.send('security:progress', data)
              } else if (eventType === 'result') {
                res.destroy()
                try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
                return
              } else if (eventType === 'error') {
                res.destroy()
                reject(new Error(`trivy scan failed: ${data}`))
                return
              }
            }
          })

          res.on('end', () => resolve(null))
          res.on('error', reject)
        }
      )
      req.on('error', reject)
    })
  })
  ipcMain.handle('kubectl:scanTrivyImages', (event, workloads) => {
    return new Promise<any>((resolve, reject) => {
      const reqBody = JSON.stringify({ workloads })
      const req = http.request(
        {
          hostname: SIDECAR_HOST, port: activeSidecarPort,
          path: '/security/trivy/images', method: 'POST',
          headers: {
            'X-Podscape-Token': sidecarToken,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(reqBody),
          },
        },
        (res) => {
          const contentType = res.headers['content-type'] ?? ''
          if (!contentType.includes('text/event-stream')) {
            let body = ''
            res.on('data', (chunk: Buffer) => { body += chunk.toString() })
            res.on('end', () => {
              if (res.statusCode !== 200) {
                reject(new Error(`Go sidecar returned ${res.statusCode} for /security/trivy/images: ${body}`))
              } else {
                try { resolve(JSON.parse(body)) } catch { resolve(null) }
              }
            })
            return
          }
          let buffer = ''
          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString()
            const blocks = buffer.split('\n\n')
            buffer = blocks.pop() ?? ''
            for (const block of blocks) {
              let eventType = 'message', data = ''
              for (const line of block.split('\n')) {
                if (line.startsWith('event: ')) eventType = line.slice(7).trim()
                else if (line.startsWith('data: ')) data = line.slice(6)
              }
              if (eventType === 'progress' && data) {
                if (!event.sender.isDestroyed()) event.sender.send('security:progress', data)
              } else if (eventType === 'result') {
                res.destroy()
                try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
                return
              } else if (eventType === 'error') {
                res.destroy()
                reject(new Error(`trivy scan failed: ${data}`))
                return
              }
            }
          })
          res.on('end', () => resolve(null))
          res.on('error', reject)
        }
      )
      req.on('error', reject)
      req.write(reqBody)
      req.end()
    })
  })
  ipcMain.handle('kubectl:scanKubesec', (_e, yaml) => provider.scanKubesec(yaml))
  ipcMain.handle('kubectl:scanKubesecBatch', (_e, resources) => provider.scanKubesecBatch(resources))

  ipcMain.handle('kubectl:prometheusStatus', async (_e, url?: string) => {
    const path = url ? `/prometheus/status?url=${encodeURIComponent(url)}` : '/prometheus/status'
    const res = await checkedSidecarFetch(path)
    return res.json()
  })

  ipcMain.handle('kubectl:prometheusQueryBatch', async (_e, queries, start, end) => {
    const res = await checkedSidecarFetch('/prometheus/query_range_batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries, start, end }),
    })
    return res.json()
  })

  ipcMain.handle('kubectl:getOwnerChain', async (_e, kind, name, namespace) => {
    const params = new URLSearchParams({ kind, name, namespace: namespace ?? '' })
    const res = await checkedSidecarFetch(`/owner-chain?${params}`)
    return res.json()
  })

  ipcMain.handle('kubectl:getTLSCerts', async (_e, namespace?: string) => {
    const url = namespace ? `/tls-certs?namespace=${encodeURIComponent(namespace)}` : '/tls-certs'
    const res = await checkedSidecarFetch(url)
    return res.json()
  })

  ipcMain.handle('kubectl:getGitOps', async (_e, namespace?: string) => {
    const url = namespace ? `/gitops?namespace=${encodeURIComponent(namespace)}` : '/gitops'
    const res = await checkedSidecarFetch(url)
    return res.json()
  })

}
