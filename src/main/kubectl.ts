import { ipcMain } from 'electron'
import { execFile, spawn } from 'child_process'
import { existsSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getAugmentedEnv } from './env'
import { getSettings } from './settings_storage'
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

const EXEC_ALLOWED_COMMANDS = new Set(['curl', 'nc', 'ping', 'nslookup'])

/**
 * Maps raw kubectl stderr / Node.js child-process errors to short, user-friendly messages.
 * The `raw` argument is the Node.js Error object from execFile.
 */
function humanizeKubectlError(stderr: string, raw: Error & { code?: unknown; killed?: boolean }): Error {
  const text = stderr.trim() || raw.message

  // Timeout / network unreachable
  if (
    raw.killed ||
    text.includes('i/o timeout') ||
    raw.code === 'ETIMEDOUT' ||
    raw.name === 'AbortError'
  ) return new Error('Cluster connection timed out. Check your network or VPN and try again.')

  if (text.includes('Unable to connect to the server') || text.includes('connection refused'))
    return new Error('Cannot reach the cluster. Check that it is running and your network/VPN is active.')

  // Auth / OIDC
  if (text.includes('Unauthorized') || text.includes('You must be logged in') || text.includes('401'))
    return new Error('Authentication failed. Your token may have expired — try re-logging into the cluster.')

  // RBAC
  if (text.includes('Forbidden') || text.includes('cannot list') || text.includes('cannot get') || text.includes('403'))
    return new Error('Permission denied. Your account does not have access to this resource in this cluster.')

  // Context / kubeconfig
  if (text.includes('does not exist') && text.includes('context'))
    return new Error('Context not found in kubeconfig. The cluster entry may have been removed or renamed.')

  if (text.includes('no server found for cluster') || text.includes('no such host'))
    return new Error('Cluster host not found. The server address in your kubeconfig may be incorrect.')

  // kubectl cp: tar missing in container (distroless / scratch / minimal images)
  if (text.includes('"tar": executable file not found') || text.includes("exec: \"tar\""))
    return new Error('tar not found in container. kubectl cp requires tar to be installed inside the container. For distroless or minimal images, copy tar in first via a debug container, or switch to an image that includes tar (e.g. busybox).')

  // Resource type unsupported (e.g. CRD not installed)
  if (text.includes("server doesn't have a resource type") || text.includes('no matches for kind'))
    return new Error('This resource type is not available in the cluster. The required API or CRD may not be installed.')

  // kubectl binary missing
  if (raw.code === 'ENOENT')
    return new Error('kubectl not found. Set the path in Settings or install kubectl and restart the app.')

  // EKS / AWS auth
  if (text.includes('exec plugin') || text.includes('aws-iam-authenticator') || text.includes('aws eks'))
    return new Error('AWS authentication failed. Ensure aws-iam-authenticator or aws CLI is installed and configured.')

  // Strip the "Command failed: /path/kubectl arg1 arg2 ..." prefix that Node appends
  // when stderr is empty — it leaks full command args including sensitive context names.
  if (!stderr.trim() && raw.message.startsWith('Command failed:'))
    return new Error('kubectl command failed. The cluster may be unavailable or you may lack permissions.')

  // Fallback: use stderr if available (it's already the kubectl-formatted message), otherwise generic
  return new Error(text || 'An unknown kubectl error occurred.')
}

export class KubectlProvider implements KubeProvider {
  private spawnKubectl(args: string[], timeoutMs = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
      const binary = findKubectl()
      const env = getAugmentedEnv()
      execFile(binary, args, { maxBuffer: 20 * 1024 * 1024, env, timeout: timeoutMs }, (error, stdout, stderr) => {
        if (error) {
          reject(humanizeKubectlError(stderr, error))
        } else {
          resolve(stdout)
        }
      })
    })
  }

  // Unlike spawnKubectl, this always resolves — even on non-zero exit — so callers
  // can inspect exitCode and present the output (e.g. the connectivity tester).
  private spawnKubectlExec(args: string[], timeoutMs = 30000): Promise<{ stdout: string; exitCode: number }> {
    return new Promise((resolve) => {
      const binary = findKubectl()
      const env = getAugmentedEnv()
      execFile(binary, args, { maxBuffer: 20 * 1024 * 1024, env, timeout: timeoutMs }, (error, stdout, stderr) => {
        if (error) {
          const exitCode = typeof (error as any).code === 'number' ? (error as any).code : 1
          resolve({ stdout: stdout + (stderr ? '\n' + stderr : ''), exitCode })
        } else {
          resolve({ stdout, exitCode: 0 })
        }
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
    // Namespaces are cluster-scoped — never pass --all-namespaces or --namespace.
    // Use a longer timeout since EKS token refresh can take several seconds.
    return this.getResources(context, undefined, 'namespaces', 25000)
  }

  async getResources(context: string, namespace: string | null | undefined, kind: string, timeoutMs?: number): Promise<unknown[]> {
    const args = ['get', kind]
    if (context) args.push('--context', context)
    if (typeof namespace === 'string') {
      // Named namespace: scope to it
      args.push('--namespace', namespace)
    } else if (namespace === null) {
      // null means "all namespaces" — only valid for namespace-scoped resources
      args.push('--all-namespaces')
    }
    // undefined means cluster-scoped — no namespace flag at all
    args.push('-o', 'json')
    try {
      const output = await this.spawnKubectl(args, timeoutMs)
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
      // Node metrics are cluster-scoped
      return await this.getResources(context, undefined, 'nodemetrics.metrics.k8s.io')
    } catch { return [] }
  }

  async createDebugPod(context: string, namespace: string, image: string, name: string): Promise<void> {
    await this.spawnKubectl([
      'run', name,
      '--image', image,
      '--restart=Never',
      '--namespace', namespace,
      '--context', context,
      '--labels', 'created-by=podscape',
      '--', 'sleep', 'infinity',
    ], 30000)
    // Wait until pod is Ready (up to 90s)
    await this.spawnKubectl([
      'wait', `pod/${name}`,
      '--for=condition=Ready',
      '--namespace', namespace,
      '--context', context,
      '--timeout=90s',
    ], 100000)
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
    const env = getAugmentedEnv()
    return spawn(binary, args, { env })
  }

  spawnPortForward(context: string, namespace: string, type: string, name: string, localPort: number, remotePort: number) {
    const binary = findKubectl()
    const env = getAugmentedEnv()
    return spawn(binary, [
      'port-forward', `${type}/${name}`, `${localPort}:${remotePort}`,
      '--context', context, '--namespace', namespace
    ], { env })
  }
  async execCommand(context: string, namespace: string, pod: string, container: string, command: string[]): Promise<{ stdout: string; exitCode: number }> {
    if (command.length === 0 || !EXEC_ALLOWED_COMMANDS.has(command[0])) {
      throw new Error(`Command not allowed: '${command[0] ?? ''}'. Permitted: ${[...EXEC_ALLOWED_COMMANDS].join(', ')}`)
    }
    return this.spawnKubectlExec([
      'exec', pod, '--context', context, '--namespace', namespace, '--container', container, '--', ...command
    ])
  }

  /** Upload a local file into a running container via `kubectl cp`. */
  async copyToContainer(
    context: string, namespace: string, pod: string, container: string,
    localPath: string, remotePath: string
  ): Promise<void> {
    await this.spawnKubectl([
      'cp', localPath, `${namespace}/${pod}:${remotePath}`,
      '--context', context, '-c', container
    ], 300_000) // 5-minute ceiling for large files
  }

  /** Download a file from a running container to local disk via `kubectl cp`. */
  async copyFromContainer(
    context: string, namespace: string, pod: string, container: string,
    remotePath: string, localPath: string
  ): Promise<void> {
    await this.spawnKubectl([
      'cp', `${namespace}/${pod}:${remotePath}`, localPath,
      '--context', context, '-c', container
    ], 300_000)
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
  // Generic handler for CRD instances (e.g. IngressRoute, VirtualService, HTTPProxy)
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
  ipcMain.handle('kubectl:deleteResource', (_e, ctx, ns, kind, name) => provider.deleteResource(ctx, ns, kind, name))
  ipcMain.handle('kubectl:getYAML', (_e, ctx, ns, kind, name) => provider.getYAML(ctx, ns, kind, name))
  ipcMain.handle('kubectl:getSecretValue', (_e, ctx, ns, name, key) => provider.getSecretValue(ctx, ns, name, key))
  ipcMain.handle('kubectl:execCommand', (_e, ctx, ns, pod, container, cmd) => provider.execCommand(ctx, ns, pod, container, cmd))
  ipcMain.handle('kubectl:applyYAML', (_e, ctx, yaml) => provider.applyYAML(ctx, yaml))

  ipcMain.handle('kubectl:copyToContainer',
    (_e, ctx: string, ns: string, pod: string, container: string, localPath: string, remotePath: string) =>
      provider.copyToContainer(ctx, ns, pod, container, localPath, remotePath))

  ipcMain.handle('kubectl:copyFromContainer',
    (_e, ctx: string, ns: string, pod: string, container: string, remotePath: string, localPath: string) =>
      provider.copyFromContainer(ctx, ns, pod, container, remotePath, localPath))

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
