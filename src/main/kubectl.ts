import { ipcMain } from 'electron'
import { execFile, spawn } from 'child_process'
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getSettings } from './settings'
import { KubeProvider } from './kubeProvider'

const KUBECTL_PATHS = [
  '/opt/homebrew/bin/kubectl',
  '/usr/local/bin/kubectl',
  '/usr/bin/kubectl',
  'kubectl'
]

export function findKubectl(): string {
  const { kubectlPath } = getSettings()
  if (kubectlPath && existsSync(kubectlPath)) return kubectlPath
  for (const p of KUBECTL_PATHS) {
    if (p === 'kubectl' || existsSync(p)) return p
  }
  return 'kubectl'
}

export class KubectlProvider implements KubeProvider {
  private spawnKubectl(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const binary = findKubectl()
      execFile(binary, args, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message))
        else resolve(stdout)
      })
    })
  }

  async getContexts(): Promise<unknown[]> {
    const output = await this.spawnKubectl(['config', 'view', '-o', 'json'])
    try { return (JSON.parse(output).contexts ?? []) as unknown[] } catch { return [] }
  }

  async getCurrentContext(): Promise<string> {
    const output = await this.spawnKubectl(['config', 'current-context'])
    return output.trim()
  }

  async switchContext(context: string): Promise<void> {
    await this.spawnKubectl(['config', 'use-context', context])
  }

  async getNamespaces(context: string): Promise<unknown[]> {
    return this.getResources(context, null, 'namespaces')
  }

  async getResources(context: string, namespace: string | null, kind: string): Promise<unknown[]> {
    const args = ['get', kind]
    if (context) args.push('--context', context)
    if (namespace) args.push('--namespace', namespace)
    else if (namespace === null) args.push('--all-namespaces')
    args.push('-o', 'json')
    try {
      const output = await this.spawnKubectl(args)
      try { return (JSON.parse(output).items ?? []) as unknown[] } catch { return [] }
    } catch (err) {
      console.error(`[kubectl] getResources ${kind} failed:`, (err as Error).message)
      throw err
    }
  }

  async getPodMetrics(context: string, namespace: string | null): Promise<unknown[]> {
    try {
      return await this.getResources(context, namespace, 'podmetrics.metrics.k8s.io')
    } catch { return [] }
  }

  async getNodeMetrics(context: string): Promise<unknown[]> {
    try {
      return await this.getResources(context, null, 'nodemetrics.metrics.k8s.io')
    } catch { return [] }
  }

  async getSecretValue(context: string, namespace: string, name: string, key: string): Promise<string> {
    const output = await this.spawnKubectl(['get', 'secret', name, '--context', context, '--namespace', namespace, '-o', 'json'])
    const secret = JSON.parse(output) as { data?: Record<string, string> }
    const encoded = secret.data?.[key]
    if (!encoded) throw new Error(`Key '${key}' not found in secret`)
    return Buffer.from(encoded, 'base64').toString('utf8')
  }

  async scaleResource(context: string, namespace: string, kind: string, name: string, replicas: number): Promise<string> {
    return this.spawnKubectl(['scale', kind, name, `--replicas=${replicas}`, '--context', context, '--namespace', namespace])
  }

  async rolloutRestart(context: string, namespace: string, kind: string, name: string): Promise<string> {
    return this.spawnKubectl(['rollout', 'restart', `${kind}/${name}`, '--context', context, '--namespace', namespace])
  }

  async rolloutHistory(context: string, namespace: string, kind: string, name: string): Promise<string> {
    return this.spawnKubectl(['rollout', 'history', `${kind}/${name}`, '--context', context, '--namespace', namespace])
  }

  async rolloutUndo(context: string, namespace: string, kind: string, name: string, revision?: number): Promise<string> {
    const args = ['rollout', 'undo', `${kind}/${name}`, '--context', context, '--namespace', namespace]
    if (revision) args.push(`--to-revision=${revision}`)
    return this.spawnKubectl(args)
  }

  async getResourceEvents(context: string, namespace: string, kind: string, name: string): Promise<unknown[]> {
    try {
      const output = await this.spawnKubectl([
        'get', 'events', `--field-selector=involvedObject.kind=${kind},involvedObject.name=${name}`,
        '--context', context, '--namespace', namespace, '-o', 'json'
      ])
      return (JSON.parse(output).items ?? []) as unknown[]
    } catch { return [] }
  }

  async deleteResource(context: string, namespace: string | null, kind: string, name: string): Promise<string> {
    const args = ['delete', kind, name, '--context', context]
    if (namespace) args.push('--namespace', namespace)
    return this.spawnKubectl(args)
  }

  async getYAML(context: string, namespace: string | null, kind: string, name: string): Promise<string> {
    const args = ['get', kind, name, '--context', context, '-o', 'yaml']
    if (namespace) args.push('--namespace', namespace)
    return this.spawnKubectl(args)
  }

  async applyYAML(context: string, yamlContent: string): Promise<string> {
    const tmpDir = mkdtempSync(join(tmpdir(), 'podscape-'))
    const tmpFile = join(tmpDir, 'manifest.yaml')
    writeFileSync(tmpFile, yamlContent, 'utf-8')
    try {
      return await this.spawnKubectl(['apply', '-f', tmpFile, '--context', context])
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }

  spawnLogs(context: string, namespace: string, pod: string, container?: string) {
    const binary = findKubectl()
    const args = ['logs', pod, '--context', context, '--namespace', namespace, '--follow', '--tail', '200']
    if (container) args.push('--container', container)
    return spawn(binary, args)
  }

  spawnPortForward(context: string, namespace: string, type: string, name: string, localPort: number, remotePort: number) {
    const binary = findKubectl()
    return spawn(binary, [
      'port-forward', `${type}/${name}`, `${localPort}:${remotePort}`,
      '--context', context, '--namespace', namespace
    ])
  }
}

const activeStreams = new Map<string, ReturnType<typeof spawn>>()
const activeForwards = new Map<string, ReturnType<typeof spawn>>()

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
  ipcMain.handle('kubectl:getIngressClasses', (_e, ctx) => provider.getResources(ctx, null, 'ingressclasses'))
  ipcMain.handle('kubectl:getNetworkPolicies', (_e, ctx, ns) => provider.getResources(ctx, ns, 'networkpolicies'))
  ipcMain.handle('kubectl:getEndpoints', (_e, ctx, ns) => provider.getResources(ctx, ns, 'endpoints'))
  ipcMain.handle('kubectl:getConfigMaps', (_e, ctx, ns) => provider.getResources(ctx, ns, 'configmaps'))
  ipcMain.handle('kubectl:getSecrets', async (_e, ctx, ns) => {
    const items = await provider.getResources(ctx, ns, 'secrets') as Array<{ metadata: unknown; type?: string; data?: Record<string, string> }>
    return items.map(s => ({ ...s, data: s.data ? Object.fromEntries(Object.keys(s.data).map(k => [k, '***MASKED***'])) : undefined }))
  })
  ipcMain.handle('kubectl:getPVCs', (_e, ctx, ns) => provider.getResources(ctx, ns, 'persistentvolumeclaims'))
  ipcMain.handle('kubectl:getPVs', (_e, ctx) => provider.getResources(ctx, null, 'persistentvolumes'))
  ipcMain.handle('kubectl:getStorageClasses', (_e, ctx) => provider.getResources(ctx, null, 'storageclasses'))
  ipcMain.handle('kubectl:getServiceAccounts', (_e, ctx, ns) => provider.getResources(ctx, ns, 'serviceaccounts'))
  ipcMain.handle('kubectl:getRoles', (_e, ctx, ns) => provider.getResources(ctx, ns, 'roles'))
  ipcMain.handle('kubectl:getClusterRoles', (_e, ctx) => provider.getResources(ctx, null, 'clusterroles'))
  ipcMain.handle('kubectl:getRoleBindings', (_e, ctx, ns) => provider.getResources(ctx, ns, 'rolebindings'))
  ipcMain.handle('kubectl:getClusterRoleBindings', (_e, ctx) => provider.getResources(ctx, null, 'clusterrolebindings'))
  ipcMain.handle('kubectl:getNodes', (_e, ctx) => provider.getResources(ctx, null, 'nodes'))
  ipcMain.handle('kubectl:getCRDs', (_e, ctx) => provider.getResources(ctx, null, 'customresourcedefinitions'))
  ipcMain.handle('kubectl:getEvents', (_e, ctx, ns) => provider.getResources(ctx, ns, 'events'))
  ipcMain.handle('kubectl:getPodMetrics', (_e, ctx, ns) => provider.getPodMetrics(ctx, ns))
  ipcMain.handle('kubectl:getNodeMetrics', (_e, ctx) => provider.getNodeMetrics(ctx))
  ipcMain.handle('kubectl:scale', (_e, ctx, ns, name, replicas) => provider.scaleResource(ctx, ns, 'deployment', name, replicas))
  ipcMain.handle('kubectl:scaleResource', (_e, ctx, ns, kind, name, replicas) => provider.scaleResource(ctx, ns, kind, name, replicas))
  ipcMain.handle('kubectl:rolloutHistory', (_e, ctx, ns, kind, name) => provider.rolloutHistory(ctx, ns, kind, name))
  ipcMain.handle('kubectl:rolloutUndo', (_e, ctx, ns, kind, name, rev) => provider.rolloutUndo(ctx, ns, kind, name, rev))
  ipcMain.handle('kubectl:getResourceEvents', (_e, ctx, ns, kind, name) => provider.getResourceEvents(ctx, ns, kind, name))
  ipcMain.handle('kubectl:rolloutRestart', (_e, ctx, ns, kind, name) => provider.rolloutRestart(ctx, ns, kind, name))
  ipcMain.handle('kubectl:deleteResource', (_e, ctx, ns, kind, name) => provider.deleteResource(ctx, ns, kind, name))
  ipcMain.handle('kubectl:getYAML', (_e, ctx, ns, kind, name) => provider.getYAML(ctx, ns, kind, name))
  ipcMain.handle('kubectl:getSecretValue', (_e, ctx, ns, name, key) => provider.getSecretValue(ctx, ns, name, key))
  ipcMain.handle('kubectl:applyYAML', (_e, ctx, yaml) => provider.applyYAML(ctx, yaml))

  ipcMain.handle('kubectl:streamLogs', async (event, ctx, ns, pod, container) => {
    const streamId = `${ctx}/${ns}/${pod}${container ? '/' + container : ''}`
    if (activeStreams.has(streamId)) { activeStreams.get(streamId)!.kill(); activeStreams.delete(streamId) }
    const child = provider.spawnLogs(ctx, ns, pod, container)
    activeStreams.set(streamId, child)
    const sender = event.sender
    child.stdout.on('data', (chunk: Buffer) => { if (!sender.isDestroyed()) sender.send('kubectl:logChunk', streamId, chunk.toString()) })
    child.stderr.on('data', (chunk: Buffer) => { if (!sender.isDestroyed()) sender.send('kubectl:logError', streamId, chunk.toString()) })
    child.on('close', () => { activeStreams.delete(streamId); if (!sender.isDestroyed()) sender.send('kubectl:logEnd', streamId) })
    return streamId
  })

  ipcMain.handle('kubectl:stopLogs', async (_e, streamId) => {
    if (activeStreams.has(streamId)) { activeStreams.get(streamId)!.kill(); activeStreams.delete(streamId) }
  })

  ipcMain.handle('kubectl:portForward', async (event, ctx, ns, type, name, localPort, remotePort, id) => {
    const child = provider.spawnPortForward(ctx, ns, type, name, localPort, remotePort)
    activeForwards.set(id, child)
    child.stdout.on('data', (chunk: Buffer) => { if (!event.sender.isDestroyed()) event.sender.send('portforward:ready', id, chunk.toString()) })
    child.stderr.on('data', (chunk: Buffer) => { if (!event.sender.isDestroyed()) event.sender.send('portforward:error', id, chunk.toString()) })
    child.on('close', () => { activeForwards.delete(id); if (!event.sender.isDestroyed()) event.sender.send('portforward:exit', id) })
    return id
  })

  ipcMain.handle('kubectl:stopPortForward', async (_e, id) => {
    activeForwards.get(id)?.kill()
    activeForwards.delete(id)
  })

  ipcMain.handle('plugins:list', async () => {
    const { homedir } = await import('os')
    const { readdirSync, existsSync: fsExists, readFileSync } = await import('fs')
    const pluginsDir = join(homedir(), '.podscape', 'plugins')
    if (!fsExists(pluginsDir)) return []
    const plugins: unknown[] = []
    for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const manifestPath = join(pluginsDir, entry.name, 'package.json')
      if (!fsExists(manifestPath)) continue
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        plugins.push({
          id: entry.name,
          name: manifest.name ?? entry.name,
          version: manifest.version ?? '0.0.0',
          description: manifest.description ?? '',
          author: manifest.author ?? '',
          panels: manifest.podscape?.panels ?? []
        })
      } catch { /* skip */ }
    }
    return plugins
  })
}
