import { ipcMain } from 'electron'
import { execFile, spawn } from 'child_process'
import { existsSync, writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getSettings } from './settings'

const KUBECTL_PATHS = [
  '/opt/homebrew/bin/kubectl',
  '/usr/local/bin/kubectl',
  '/usr/bin/kubectl',
  'kubectl'
]

export function findKubectl(): string {
  // User-configured path takes priority
  const { kubectlPath } = getSettings()
  if (kubectlPath && existsSync(kubectlPath)) return kubectlPath
  // Auto-detect
  for (const p of KUBECTL_PATHS) {
    if (p === 'kubectl' || existsSync(p)) return p
  }
  return 'kubectl'
}

function spawnKubectl(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const binary = findKubectl()
    execFile(binary, args, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message))
      else resolve(stdout)
    })
  })
}

async function getResources(
  context: string,
  namespace: string | null,
  kind: string
): Promise<unknown[]> {
  const args = ['--context', context]
  if (namespace) args.push('--namespace', namespace)
  args.push('get', kind, '-o', 'json')
  const output = await spawnKubectl(args)
  return (JSON.parse(output).items ?? []) as unknown[]
}

async function getAllNamespaceResources(context: string, kind: string): Promise<unknown[]> {
  const output = await spawnKubectl(['--context', context, 'get', kind, '--all-namespaces', '-o', 'json'])
  return (JSON.parse(output).items ?? []) as unknown[]
}

// Active log streams
const activeStreams = new Map<string, ReturnType<typeof spawn>>()

export function registerKubectlHandlers(): void {
  // ── Context / Config ──────────────────────────────────────────────────────

  ipcMain.handle('kubectl:getContexts', async () => {
    const output = await spawnKubectl(['config', 'view', '-o', 'json'])
    return (JSON.parse(output).contexts ?? []) as unknown[]
  })

  ipcMain.handle('kubectl:getCurrentContext', async () => {
    const output = await spawnKubectl(['config', 'current-context'])
    return output.trim()
  })

  ipcMain.handle('kubectl:switchContext', async (_event, context: string) => {
    await spawnKubectl(['config', 'use-context', context])
  })

  // ── Namespaces ────────────────────────────────────────────────────────────

  ipcMain.handle('kubectl:getNamespaces', async (_event, context: string) => {
    return getResources(context, null, 'namespaces')
  })

  // ── Workloads ─────────────────────────────────────────────────────────────

  ipcMain.handle('kubectl:getPods', async (_event, context: string, namespace: string | null) =>
    namespace ? getResources(context, namespace, 'pods') : getAllNamespaceResources(context, 'pods'))

  ipcMain.handle('kubectl:getDeployments', async (_event, context: string, namespace: string | null) =>
    namespace ? getResources(context, namespace, 'deployments') : getAllNamespaceResources(context, 'deployments'))

  ipcMain.handle('kubectl:getStatefulSets', async (_event, context: string, namespace: string | null) =>
    namespace ? getResources(context, namespace, 'statefulsets') : getAllNamespaceResources(context, 'statefulsets'))

  ipcMain.handle('kubectl:getReplicaSets', async (_event, context: string, namespace: string | null) =>
    namespace ? getResources(context, namespace, 'replicasets') : getAllNamespaceResources(context, 'replicasets'))

  ipcMain.handle('kubectl:getJobs', async (_event, context: string, namespace: string | null) =>
    namespace ? getResources(context, namespace, 'jobs') : getAllNamespaceResources(context, 'jobs'))

  ipcMain.handle('kubectl:getCronJobs', async (_event, context: string, namespace: string | null) =>
    namespace ? getResources(context, namespace, 'cronjobs') : getAllNamespaceResources(context, 'cronjobs'))

  // ── Network ───────────────────────────────────────────────────────────────

  ipcMain.handle('kubectl:getServices', async (_event, context: string, namespace: string | null) =>
    namespace ? getResources(context, namespace, 'services') : getAllNamespaceResources(context, 'services'))

  ipcMain.handle('kubectl:getIngresses', async (_event, context: string, namespace: string | null) =>
    namespace ? getResources(context, namespace, 'ingresses') : getAllNamespaceResources(context, 'ingresses'))

  // ── Config ────────────────────────────────────────────────────────────────

  ipcMain.handle('kubectl:getConfigMaps', async (_event, context: string, namespace: string | null) =>
    namespace ? getResources(context, namespace, 'configmaps') : getAllNamespaceResources(context, 'configmaps'))

  ipcMain.handle('kubectl:getSecrets', async (_event, context: string, namespace: string | null) => {
    const items = (namespace
      ? await getResources(context, namespace, 'secrets')
      : await getAllNamespaceResources(context, 'secrets')
    ) as Array<{ metadata: unknown; type?: string; data?: Record<string, string> }>
    return items.map(s => ({
      ...s,
      data: s.data ? Object.fromEntries(Object.keys(s.data).map(k => [k, '***MASKED***'])) : undefined
    }))
  })

  // ── Cluster ───────────────────────────────────────────────────────────────

  ipcMain.handle('kubectl:getNodes', async (_event, context: string) =>
    getResources(context, null, 'nodes'))

  ipcMain.handle('kubectl:getCRDs', async (_event, context: string) =>
    getResources(context, null, 'customresourcedefinitions'))

  // ── Events ────────────────────────────────────────────────────────────────

  ipcMain.handle('kubectl:getEvents', async (_event, context: string, namespace: string | null) => {
    if (!namespace) {
      const output = await spawnKubectl(['--context', context, 'get', 'events', '--all-namespaces', '-o', 'json'])
      return (JSON.parse(output).items ?? []) as unknown[]
    }
    return getResources(context, namespace, 'events')
  })

  // ── Metrics (metrics-server) ──────────────────────────────────────────────

  ipcMain.handle('kubectl:getPodMetrics', async (_event, context: string, namespace: string | null) => {
    try {
      return namespace
        ? await getResources(context, namespace, 'podmetrics.metrics.k8s.io')
        : await getAllNamespaceResources(context, 'podmetrics.metrics.k8s.io')
    } catch {
      return []
    }
  })

  ipcMain.handle('kubectl:getNodeMetrics', async (_event, context: string) => {
    try {
      return await getResources(context, null, 'nodemetrics.metrics.k8s.io')
    } catch {
      return []
    }
  })

  // ── Workload Operations ───────────────────────────────────────────────────

  ipcMain.handle(
    'kubectl:scale',
    async (_event, context: string, namespace: string, name: string, replicas: number) => {
      return spawnKubectl([
        '--context', context, '--namespace', namespace,
        'scale', 'deployment', name, `--replicas=${replicas}`
      ])
    }
  )

  ipcMain.handle(
    'kubectl:rolloutRestart',
    async (_event, context: string, namespace: string, kind: string, name: string) => {
      return spawnKubectl([
        '--context', context, '--namespace', namespace,
        'rollout', 'restart', `${kind}/${name}`
      ])
    }
  )

  ipcMain.handle(
    'kubectl:deleteResource',
    async (_event, context: string, namespace: string | null, kind: string, name: string) => {
      const args = ['--context', context, 'delete', kind, name]
      if (namespace) args.push('--namespace', namespace)
      return spawnKubectl(args)
    }
  )

  ipcMain.handle(
    'kubectl:getYAML',
    async (_event, context: string, namespace: string | null, kind: string, name: string) => {
      const args = ['--context', context, 'get', kind, name, '-o', 'yaml']
      if (namespace) args.push('--namespace', namespace)
      return spawnKubectl(args)
    }
  )

  ipcMain.handle(
    'kubectl:applyYAML',
    async (_event, context: string, yamlContent: string) => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'podscape-'))
      const tmpFile = join(tmpDir, 'manifest.yaml')
      writeFileSync(tmpFile, yamlContent, 'utf-8')
      try {
        return await spawnKubectl(['--context', context, 'apply', '-f', tmpFile])
      } finally {
        try { require('fs').unlinkSync(tmpFile) } catch { /* ignore */ }
      }
    }
  )

  // ── Log Streaming ─────────────────────────────────────────────────────────

  ipcMain.handle(
    'kubectl:streamLogs',
    async (event, context: string, namespace: string, pod: string, container?: string) => {
      const streamId = `${context}/${namespace}/${pod}${container ? '/' + container : ''}`

      if (activeStreams.has(streamId)) {
        activeStreams.get(streamId)!.kill()
        activeStreams.delete(streamId)
      }

      const binary = findKubectl()
      const args = [
        '--context', context, '--namespace', namespace,
        'logs', pod, '--follow', '--tail', '200'
      ]
      if (container) args.push('--container', container)

      const child = spawn(binary, args)
      activeStreams.set(streamId, child)
      const sender = event.sender

      child.stdout.on('data', (chunk: Buffer) => {
        if (!sender.isDestroyed()) sender.send('kubectl:logChunk', streamId, chunk.toString())
      })
      child.stderr.on('data', (chunk: Buffer) => {
        if (!sender.isDestroyed()) sender.send('kubectl:logError', streamId, chunk.toString())
      })
      child.on('close', () => {
        activeStreams.delete(streamId)
        if (!sender.isDestroyed()) sender.send('kubectl:logEnd', streamId)
      })

      return streamId
    }
  )

  ipcMain.handle('kubectl:stopLogs', async (_event, streamId: string) => {
    if (activeStreams.has(streamId)) {
      activeStreams.get(streamId)!.kill()
      activeStreams.delete(streamId)
    }
  })

  // ── Extensions: load plugins from ~/.podscape/plugins ────────────────────

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
      } catch { /* skip malformed plugins */ }
    }
    return plugins
  })
}
