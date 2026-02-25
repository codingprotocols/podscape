import { create } from 'zustand'
import type {
  KubeContextEntry, KubeNamespace, KubePod, KubeDeployment, KubeStatefulSet,
  KubeReplicaSet, KubeJob, KubeCronJob, KubeService, KubeIngress,
  KubeConfigMap, KubeSecret, KubeNode, KubeEvent, KubeCRD,
  NodeMetrics, PodMetrics, Plugin, ResourceKind, AnyKubeResource
} from './types'

// ─── Window type declarations ─────────────────────────────────────────────────

declare global {
  interface Window {
    kubectl: {
      getContexts: () => Promise<KubeContextEntry[]>
      getCurrentContext: () => Promise<string>
      switchContext: (context: string) => Promise<void>
      getNamespaces: (context: string) => Promise<KubeNamespace[]>
      getPods: (context: string, namespace: string) => Promise<KubePod[]>
      getDeployments: (context: string, namespace: string) => Promise<KubeDeployment[]>
      getStatefulSets: (context: string, namespace: string) => Promise<KubeStatefulSet[]>
      getReplicaSets: (context: string, namespace: string) => Promise<KubeReplicaSet[]>
      getJobs: (context: string, namespace: string) => Promise<KubeJob[]>
      getCronJobs: (context: string, namespace: string) => Promise<KubeCronJob[]>
      getServices: (context: string, namespace: string) => Promise<KubeService[]>
      getIngresses: (context: string, namespace: string) => Promise<KubeIngress[]>
      getConfigMaps: (context: string, namespace: string) => Promise<KubeConfigMap[]>
      getSecrets: (context: string, namespace: string) => Promise<KubeSecret[]>
      getNodes: (context: string) => Promise<KubeNode[]>
      getCRDs: (context: string) => Promise<KubeCRD[]>
      getEvents: (context: string, namespace: string) => Promise<KubeEvent[]>
      getPodMetrics: (context: string, namespace: string) => Promise<PodMetrics[]>
      getNodeMetrics: (context: string) => Promise<NodeMetrics[]>
      scale: (context: string, namespace: string, name: string, replicas: number) => Promise<string>
      rolloutRestart: (context: string, namespace: string, kind: string, name: string) => Promise<string>
      deleteResource: (context: string, namespace: string | null, kind: string, name: string) => Promise<string>
      getYAML: (context: string, namespace: string | null, kind: string, name: string) => Promise<string>
      applyYAML: (context: string, yaml: string) => Promise<string>
      streamLogs: (
        context: string, namespace: string, pod: string, container: string | undefined,
        onChunk: (chunk: string) => void, onEnd: () => void
      ) => Promise<string>
      stopLogs: (streamId: string) => Promise<void>
    }
    terminal: {
      create: (context?: string, namespace?: string) => Promise<string>
      write: (id: string, data: string) => Promise<void>
      resize: (id: string, cols: number, rows: number) => Promise<void>
      kill: (id: string) => Promise<void>
      onData: (id: string, cb: (data: string) => void) => () => void
      onExit: (id: string, cb: () => void) => () => void
    }
    exec: {
      start: (context: string, namespace: string, pod: string, container: string) => Promise<string>
      write: (id: string, data: string) => Promise<void>
      resize: (id: string, cols: number, rows: number) => Promise<void>
      kill: (id: string) => Promise<void>
      onData: (id: string, cb: (data: string) => void) => () => void
      onExit: (id: string, cb: () => void) => () => void
    }
    plugins: {
      list: () => Promise<Plugin[]>
    }
  }
}

// ─── Exec Modal State ─────────────────────────────────────────────────────────

export interface ExecTarget {
  pod: string
  container: string
  namespace: string
}

// ─── Store ────────────────────────────────────────────────────────────────────

export interface AppStore {
  // Navigation
  section: ResourceKind
  setSection: (s: ResourceKind) => void

  // Cluster selection
  contexts: KubeContextEntry[]
  selectedContext: string | null
  namespaces: KubeNamespace[]
  selectedNamespace: string | null
  selectedResource: AnyKubeResource | null

  // Resources
  pods: KubePod[]
  deployments: KubeDeployment[]
  statefulsets: KubeStatefulSet[]
  replicasets: KubeReplicaSet[]
  jobs: KubeJob[]
  cronjobs: KubeCronJob[]
  services: KubeService[]
  ingresses: KubeIngress[]
  configmaps: KubeConfigMap[]
  secrets: KubeSecret[]
  nodes: KubeNode[]
  events: KubeEvent[]
  crds: KubeCRD[]
  podMetrics: PodMetrics[]
  nodeMetrics: NodeMetrics[]
  plugins: Plugin[]

  // Grafana
  grafanaUrl: string
  setGrafanaUrl: (url: string) => void

  // Exec modal
  execTarget: ExecTarget | null
  openExec: (target: ExecTarget) => void
  closeExec: () => void

  // Loading / errors
  loadingContexts: boolean
  loadingNamespaces: boolean
  loadingResources: boolean
  error: string | null
  clearError: () => void

  // Actions
  init: () => Promise<void>
  selectContext: (name: string) => Promise<void>
  selectNamespace: (name: string) => void
  selectResource: (r: AnyKubeResource | null) => void
  loadSection: (section: ResourceKind) => Promise<void>
  refresh: () => Promise<void>

  // Operations
  scaleDeployment: (name: string, replicas: number) => Promise<void>
  rolloutRestart: (kind: string, name: string) => Promise<void>
  deleteResource: (kind: string, name: string, clusterScoped?: boolean) => Promise<void>
  getYAML: (kind: string, name: string, clusterScoped?: boolean) => Promise<string>
  applyYAML: (yaml: string) => Promise<string>
}

export const useAppStore = create<AppStore>((set, get) => ({
  // ── Navigation ─────────────────────────────────────────────────────────────

  section: 'pods',
  setSection: (section) => {
    set({ section, selectedResource: null })
    get().loadSection(section)
  },

  // ── Selection ──────────────────────────────────────────────────────────────

  contexts: [],
  selectedContext: null,
  namespaces: [],
  selectedNamespace: null,
  selectedResource: null,

  // ── Resources ──────────────────────────────────────────────────────────────

  pods: [],
  deployments: [],
  statefulsets: [],
  replicasets: [],
  jobs: [],
  cronjobs: [],
  services: [],
  ingresses: [],
  configmaps: [],
  secrets: [],
  nodes: [],
  events: [],
  crds: [],
  podMetrics: [],
  nodeMetrics: [],
  plugins: [],

  // ── Grafana ────────────────────────────────────────────────────────────────

  grafanaUrl: '',
  setGrafanaUrl: (url) => set({ grafanaUrl: url }),

  // ── Exec ───────────────────────────────────────────────────────────────────

  execTarget: null,
  openExec: (target) => set({ execTarget: target }),
  closeExec: () => set({ execTarget: null }),

  // ── Loading / Errors ───────────────────────────────────────────────────────

  loadingContexts: false,
  loadingNamespaces: false,
  loadingResources: false,
  error: null,
  clearError: () => set({ error: null }),

  // ── Init ───────────────────────────────────────────────────────────────────

  init: async () => {
    set({ loadingContexts: true, error: null })
    try {
      const [ctxList, currentCtx] = await Promise.all([
        window.kubectl.getContexts(),
        window.kubectl.getCurrentContext().catch(() => null)
      ])
      const active = currentCtx && ctxList.find(c => c.name === currentCtx)
      const chosen = active ? currentCtx! : ctxList[0]?.name ?? null
      set({ contexts: ctxList, selectedContext: chosen, loadingContexts: false })

      if (chosen) await get().selectContext(chosen)

      const pluginList = await window.plugins.list().catch(() => [])
      set({ plugins: pluginList })
    } catch (err) {
      set({ error: (err as Error).message, loadingContexts: false })
    }
  },

  // ── Context selection ─────────────────────────────────────────────────────

  selectContext: async (name) => {
    set({
      selectedContext: name, loadingNamespaces: true,
      namespaces: [], selectedNamespace: null, selectedResource: null, error: null,
      pods: [], deployments: [], statefulsets: [], replicasets: [],
      jobs: [], cronjobs: [], services: [], ingresses: [],
      configmaps: [], secrets: [], nodes: [], events: [], crds: []
    })
    try {
      const nsList = await window.kubectl.getNamespaces(name)
      const defaultNs = nsList.find(ns => ns.metadata.name === 'default')
      const chosen = defaultNs ? 'default' : nsList[0]?.metadata.name ?? null
      set({ namespaces: nsList, selectedNamespace: chosen, loadingNamespaces: false })
      if (chosen) {
        set({ selectedNamespace: chosen })
        await get().loadSection(get().section)
      }
    } catch (err) {
      set({ error: (err as Error).message, loadingNamespaces: false })
    }
  },

  // ── Namespace selection ───────────────────────────────────────────────────

  selectNamespace: (name) => {
    set({ selectedNamespace: name, selectedResource: null })
    get().loadSection(get().section)
  },

  selectResource: (r) => set({ selectedResource: r }),

  // ── Load section ──────────────────────────────────────────────────────────

  loadSection: async (section) => {
    const { selectedContext: ctx, selectedNamespace: ns } = get()
    if (!ctx) return

    // These sections don't need resource loading
    if (['terminal', 'grafana', 'extensions', 'metrics'].includes(section)) {
      if (section === 'metrics' && ctx && ns) {
        set({ loadingResources: true })
        try {
          const [pm, nm] = await Promise.all([
            window.kubectl.getPodMetrics(ctx, ns!),
            window.kubectl.getNodeMetrics(ctx)
          ])
          set({ podMetrics: pm, nodeMetrics: nm, loadingResources: false })
        } catch {
          set({ loadingResources: false })
        }
      }
      return
    }

    set({ loadingResources: true, error: null, selectedResource: null })
    try {
      switch (section) {
        case 'pods':
          set({ pods: ns ? await window.kubectl.getPods(ctx, ns) : [] })
          break
        case 'deployments':
          set({ deployments: ns ? await window.kubectl.getDeployments(ctx, ns) : [] })
          break
        case 'statefulsets':
          set({ statefulsets: ns ? await window.kubectl.getStatefulSets(ctx, ns) : [] })
          break
        case 'replicasets':
          set({ replicasets: ns ? await window.kubectl.getReplicaSets(ctx, ns) : [] })
          break
        case 'jobs':
          set({ jobs: ns ? await window.kubectl.getJobs(ctx, ns) : [] })
          break
        case 'cronjobs':
          set({ cronjobs: ns ? await window.kubectl.getCronJobs(ctx, ns) : [] })
          break
        case 'services':
          set({ services: ns ? await window.kubectl.getServices(ctx, ns) : [] })
          break
        case 'ingresses':
          set({ ingresses: ns ? await window.kubectl.getIngresses(ctx, ns) : [] })
          break
        case 'configmaps':
          set({ configmaps: ns ? await window.kubectl.getConfigMaps(ctx, ns) : [] })
          break
        case 'secrets':
          set({ secrets: ns ? await window.kubectl.getSecrets(ctx, ns) : [] })
          break
        case 'nodes':
          set({ nodes: await window.kubectl.getNodes(ctx) })
          break
        case 'namespaces':
          set({ namespaces: await window.kubectl.getNamespaces(ctx) })
          break
        case 'events':
          set({ events: ns ? await window.kubectl.getEvents(ctx, ns) : [] })
          break
        case 'crds':
          set({ crds: await window.kubectl.getCRDs(ctx) })
          break
      }
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loadingResources: false })
    }
  },

  refresh: () => get().loadSection(get().section),

  // ── Operations ────────────────────────────────────────────────────────────

  scaleDeployment: async (name, replicas) => {
    const { selectedContext: ctx, selectedNamespace: ns } = get()
    if (!ctx || !ns) return
    await window.kubectl.scale(ctx, ns, name, replicas)
    await get().loadSection('deployments')
  },

  rolloutRestart: async (kind, name) => {
    const { selectedContext: ctx, selectedNamespace: ns } = get()
    if (!ctx || !ns) return
    await window.kubectl.rolloutRestart(ctx, ns, kind, name)
  },

  deleteResource: async (kind, name, clusterScoped = false) => {
    const { selectedContext: ctx, selectedNamespace: ns } = get()
    if (!ctx) return
    await window.kubectl.deleteResource(ctx, clusterScoped ? null : ns, kind, name)
    set({ selectedResource: null })
    await get().loadSection(get().section)
  },

  getYAML: async (kind, name, clusterScoped = false) => {
    const { selectedContext: ctx, selectedNamespace: ns } = get()
    if (!ctx) return ''
    return window.kubectl.getYAML(ctx, clusterScoped ? null : ns, kind, name)
  },

  applyYAML: async (yaml) => {
    const { selectedContext: ctx } = get()
    if (!ctx) return ''
    const result = await window.kubectl.applyYAML(ctx, yaml)
    await get().loadSection(get().section)
    return result
  }
}))
