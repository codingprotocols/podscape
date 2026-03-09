import { create } from 'zustand'
import type {
  KubeContextEntry, KubeNamespace, KubePod, KubeDeployment, KubeDaemonSet, KubeStatefulSet,
  KubeReplicaSet, KubeJob, KubeCronJob, KubeHPA, KubePDB,
  KubeService, KubeIngress, KubeIngressClass, KubeNetworkPolicy, KubeEndpoints,
  KubeConfigMap, KubeSecret, KubePVC, KubePV, KubeStorageClass,
  KubeServiceAccount, KubeRole, KubeClusterRole, KubeRoleBinding, KubeClusterRoleBinding,
  KubeNode, KubeEvent, KubeCRD,
  NodeMetrics, PodMetrics, Plugin, ResourceKind, AnyKubeResource, PortForwardEntry,
  HelmRelease
} from './types'

// ─── Window type declarations ─────────────────────────────────────────────────

declare global {
  interface Window {
    kubectl: {
      getContexts: () => Promise<KubeContextEntry[]>
      getCurrentContext: () => Promise<string>
      switchContext: (context: string) => Promise<void>
      getNamespaces: (context: string) => Promise<KubeNamespace[]>
      getPods: (context: string, namespace: string | null) => Promise<KubePod[]>
      getDeployments: (context: string, namespace: string | null) => Promise<KubeDeployment[]>
      getDaemonSets: (context: string, namespace: string | null) => Promise<KubeDaemonSet[]>
      getStatefulSets: (context: string, namespace: string | null) => Promise<KubeStatefulSet[]>
      getReplicaSets: (context: string, namespace: string | null) => Promise<KubeReplicaSet[]>
      getJobs: (context: string, namespace: string | null) => Promise<KubeJob[]>
      getCronJobs: (context: string, namespace: string | null) => Promise<KubeCronJob[]>
      getHPAs: (context: string, namespace: string | null) => Promise<KubeHPA[]>
      getPodDisruptionBudgets: (context: string, namespace: string | null) => Promise<KubePDB[]>
      getServices: (context: string, namespace: string | null) => Promise<KubeService[]>
      getIngresses: (context: string, namespace: string | null) => Promise<KubeIngress[]>
      getIngressClasses: (context: string) => Promise<KubeIngressClass[]>
      getNetworkPolicies: (context: string, namespace: string | null) => Promise<KubeNetworkPolicy[]>
      getEndpoints: (context: string, namespace: string | null) => Promise<KubeEndpoints[]>
      getConfigMaps: (context: string, namespace: string | null) => Promise<KubeConfigMap[]>
      getSecrets: (context: string, namespace: string | null) => Promise<KubeSecret[]>
      getPVCs: (context: string, namespace: string | null) => Promise<KubePVC[]>
      getPVs: (context: string) => Promise<KubePV[]>
      getStorageClasses: (context: string) => Promise<KubeStorageClass[]>
      getServiceAccounts: (context: string, namespace: string | null) => Promise<KubeServiceAccount[]>
      getRoles: (context: string, namespace: string | null) => Promise<KubeRole[]>
      getClusterRoles: (context: string) => Promise<KubeClusterRole[]>
      getRoleBindings: (context: string, namespace: string | null) => Promise<KubeRoleBinding[]>
      getClusterRoleBindings: (context: string) => Promise<KubeClusterRoleBinding[]>
      getNodes: (context: string) => Promise<KubeNode[]>
      getCRDs: (context: string) => Promise<KubeCRD[]>
      getEvents: (context: string, namespace: string | null) => Promise<KubeEvent[]>
      getPodMetrics: (context: string, namespace: string | null) => Promise<PodMetrics[]>
      getNodeMetrics: (context: string) => Promise<NodeMetrics[]>
      scale: (context: string, namespace: string, name: string, replicas: number) => Promise<string>
      scaleResource: (context: string, namespace: string, kind: string, name: string, replicas: number) => Promise<string>
      rolloutRestart: (context: string, namespace: string, kind: string, name: string) => Promise<string>
      rolloutHistory: (context: string, namespace: string, kind: string, name: string) => Promise<string>
      rolloutUndo: (context: string, namespace: string, kind: string, name: string, revision?: number) => Promise<string>
      getResourceEvents: (context: string, namespace: string, kind: string, name: string) => Promise<KubeEvent[]>
      deleteResource: (context: string, namespace: string | null, kind: string, name: string) => Promise<string>
      getYAML: (context: string, namespace: string | null, kind: string, name: string) => Promise<string>
      getSecretValue: (context: string, namespace: string, name: string, key: string) => Promise<string>
      applyYAML: (context: string, yaml: string) => Promise<string>
      streamLogs: (
        context: string, namespace: string, pod: string, container: string | undefined,
        onChunk: (chunk: string) => void, onEnd: () => void
      ) => Promise<string>
      stopLogs: (streamId: string) => Promise<void>
      portForward: (context: string, namespace: string, type: string, name: string, localPort: number, remotePort: number, id: string) => Promise<string>
      stopPortForward: (id: string) => Promise<void>
      onPortForwardReady: (id: string, cb: (msg: string) => void) => () => void
      onPortForwardError: (id: string, cb: (msg: string) => void) => () => void
      onPortForwardExit: (id: string, cb: () => void) => () => void
    }
    helm: {
      list: (context: string) => Promise<HelmRelease[]>
      status: (context: string, namespace: string, release: string) => Promise<string>
      values: (context: string, namespace: string, release: string) => Promise<string>
      history: (context: string, namespace: string, release: string) => Promise<unknown[]>
      rollback: (context: string, namespace: string, release: string, revision: number) => Promise<string>
      uninstall: (context: string, namespace: string, release: string) => Promise<string>
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
    settings: {
      get: () => Promise<{ kubectlPath: string; shellPath: string; helmPath: string; theme: string }>
      set: (s: { kubectlPath: string; shellPath: string; helmPath: string; theme: string }) => Promise<void>
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
  hotbarContexts: string[]
  toggleHotbarContext: (contextName: string) => void
  namespaces: KubeNamespace[]
  selectedNamespace: string | null
  selectedResource: AnyKubeResource | null

  // Resources
  pods: KubePod[]
  deployments: KubeDeployment[]
  daemonsets: KubeDaemonSet[]
  statefulsets: KubeStatefulSet[]
  replicasets: KubeReplicaSet[]
  jobs: KubeJob[]
  cronjobs: KubeCronJob[]
  hpas: KubeHPA[]
  pdbs: KubePDB[]
  services: KubeService[]
  ingresses: KubeIngress[]
  ingressclasses: KubeIngressClass[]
  networkpolicies: KubeNetworkPolicy[]
  endpoints: KubeEndpoints[]
  configmaps: KubeConfigMap[]
  secrets: KubeSecret[]
  pvcs: KubePVC[]
  pvs: KubePV[]
  storageclasses: KubeStorageClass[]
  serviceaccounts: KubeServiceAccount[]
  roles: KubeRole[]
  clusterroles: KubeClusterRole[]
  rolebindings: KubeRoleBinding[]
  clusterrolebindings: KubeClusterRoleBinding[]
  nodes: KubeNode[]
  events: KubeEvent[]
  crds: KubeCRD[]
  podMetrics: PodMetrics[]
  nodeMetrics: NodeMetrics[]
  plugins: Plugin[]
  portForwards: PortForwardEntry[]
  helmReleases: HelmRelease[]

  // Exec modal
  execTarget: ExecTarget | null
  openExec: (target: ExecTarget) => void
  closeExec: () => void

  navWidth: number
  setNavWidth: (w: number) => void
  detailWidth: number
  setDetailWidth: (w: number) => void

  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void

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
  loadDashboard: () => Promise<void>
  refresh: () => Promise<void>

  // Operations
  scaleDeployment: (name: string, replicas: number, namespace?: string) => Promise<void>
  scaleStatefulSet: (name: string, replicas: number, namespace?: string) => Promise<void>
  rolloutRestart: (kind: string, name: string, namespace?: string) => Promise<void>
  deleteResource: (kind: string, name: string, clusterScoped?: boolean, namespace?: string) => Promise<void>
  getYAML: (kind: string, name: string, clusterScoped?: boolean, namespace?: string) => Promise<string>
  applyYAML: (yaml: string) => Promise<string>

  // Port forwarding
  startPortForward: (entry: PortForwardEntry) => void
  stopPortForward: (id: string) => void
}

// Monotonically-increasing counter to detect stale context-switch responses
let contextSwitchSeq = 0

export const useAppStore = create<AppStore>((set, get) => ({
  // ── Navigation ─────────────────────────────────────────────────────────────

  section: 'dashboard' as ResourceKind,
  setSection: (section) => {
    set({ section, selectedResource: null })
    get().loadSection(section)
  },

  // ── Selection ──────────────────────────────────────────────────────────────

  contexts: [],
  selectedContext: null,
  hotbarContexts: (() => {
    try {
      const raw = localStorage.getItem('podscape:hotbar')
      if (!raw) return []
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    } catch { return [] }
  })(),
  toggleHotbarContext: (contextName) => {
    const { hotbarContexts } = get()
    const next = hotbarContexts.includes(contextName)
      ? hotbarContexts.filter(c => c !== contextName)
      : [...hotbarContexts, contextName].slice(-10)
    set({ hotbarContexts: next })
    localStorage.setItem('podscape:hotbar', JSON.stringify(next))
  },
  namespaces: [],
  selectedNamespace: null,
  selectedResource: null,

  // ── Resources ──────────────────────────────────────────────────────────────

  pods: [],
  deployments: [],
  daemonsets: [],
  statefulsets: [],
  replicasets: [],
  jobs: [],
  cronjobs: [],
  hpas: [],
  pdbs: [],
  services: [],
  ingresses: [],
  ingressclasses: [],
  networkpolicies: [],
  endpoints: [],
  configmaps: [],
  secrets: [],
  pvcs: [],
  pvs: [],
  storageclasses: [],
  serviceaccounts: [],
  roles: [],
  clusterroles: [],
  rolebindings: [],
  clusterrolebindings: [],
  nodes: [],
  events: [],
  crds: [],
  podMetrics: [],
  nodeMetrics: [],
  plugins: [],
  portForwards: [],
  helmReleases: [],

  // ── Exec ───────────────────────────────────────────────────────────────────

  execTarget: null,
  openExec: (target) => set({ execTarget: target }),
  closeExec: () => set({ execTarget: null }),

  navWidth: parseInt(localStorage.getItem('podscape:navWidth') ?? '210'),
  setNavWidth: (navWidth) => {
    set({ navWidth })
    localStorage.setItem('podscape:navWidth', navWidth.toString())
  },
  detailWidth: parseInt(localStorage.getItem('podscape:detailWidth') ?? '560'),
  setDetailWidth: (detailWidth) => {
    set({ detailWidth })
    localStorage.setItem('podscape:detailWidth', detailWidth.toString())
  },

  // ── Loading / Errors ───────────────────────────────────────────────────────

  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'dark',

  setTheme: (theme) => {
    set({ theme })
    localStorage.setItem('theme', theme)
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },

  loadingContexts: false,
  loadingNamespaces: false,
  loadingResources: false,
  error: null,
  clearError: () => set({ error: null }),

  // ── Init ───────────────────────────────────────────────────────────────────

  init: async () => {
    // Sync theme on init
    const currentTheme = get().theme
    if (currentTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

    set({ loadingContexts: true, error: null })
    try {
      const [ctxList, currentCtx] = await Promise.all([
        window.kubectl.getContexts(),
        window.kubectl.getCurrentContext().catch(() => null)
      ])
      const ctxNames = new Set((ctxList as KubeContextEntry[]).map(c => c.name))
      const hotbarPruned = get().hotbarContexts.filter(name => ctxNames.has(name))
      if (hotbarPruned.length !== get().hotbarContexts.length) {
        localStorage.setItem('podscape:hotbar', JSON.stringify(hotbarPruned))
      }
      const active = currentCtx && ctxList.find((c: KubeContextEntry) => c.name === currentCtx)
      const chosen = active ? currentCtx! : ctxList[0]?.name ?? null
      set({ contexts: ctxList, selectedContext: chosen, hotbarContexts: hotbarPruned, loadingContexts: false })

      if (chosen) await get().selectContext(chosen)

      const pluginList = await window.plugins.list().catch(() => [])
      set({ plugins: pluginList })
    } catch (err) {
      set({ error: (err as Error).message, loadingContexts: false })
    }
  },

  // ── Context selection ─────────────────────────────────────────────────────

  selectContext: async (name) => {
    const mySeq = ++contextSwitchSeq
    set({
      selectedContext: name, loadingNamespaces: true,
      namespaces: [], selectedNamespace: null, selectedResource: null, error: null,
      pods: [], deployments: [], daemonsets: [], statefulsets: [], replicasets: [],
      jobs: [], cronjobs: [], hpas: [], pdbs: [],
      services: [], ingresses: [], ingressclasses: [], networkpolicies: [], endpoints: [],
      configmaps: [], secrets: [], pvcs: [], pvs: [], storageclasses: [],
      serviceaccounts: [], roles: [], clusterroles: [], rolebindings: [], clusterrolebindings: [],
      nodes: [], events: [], crds: []
    })
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Cannot reach cluster "${name}" — timed out after 8s`)), 8000)
      )
      const nsList = await Promise.race([window.kubectl.getNamespaces(name), timeout])
      if (mySeq !== contextSwitchSeq) return // another context switch happened — discard
      const chosen = nsList.length > 0 ? '_all' : null
      set({ namespaces: nsList, selectedNamespace: chosen, loadingNamespaces: false })
      if (chosen) {
        set({ selectedNamespace: chosen })
        await get().loadSection(get().section)
      }
    } catch (err) {
      if (mySeq !== contextSwitchSeq) return
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

    // Dashboard has its own dedicated loader
    if (section === 'dashboard') {
      await get().loadDashboard()
      return
    }

    // '_all' sentinel → null triggers --all-namespaces in kubectl handlers
    // null (no ns selected yet) → show empty for namespace-scoped resources
    const nsArg = ns === '_all' ? null : ns

    // These sections don't need resource loading
    if (['terminal', 'grafana', 'extensions', 'metrics', 'network', 'portforwards', 'helm', 'settings'].includes(section)) {
      if (section === 'metrics' && ctx) {
        set({ loadingResources: true })
        try {
          const [pm, nm] = await Promise.all([
            window.kubectl.getPodMetrics(ctx, nsArg),
            window.kubectl.getNodeMetrics(ctx)
          ])
          set({ podMetrics: pm, nodeMetrics: nm, loadingResources: false })
        } catch {
          set({ loadingResources: false })
        }
      }
      if (section === 'network' && ctx) {
        set({ loadingResources: true })
        try {
          const [svcs, ings, pds, nss] = await Promise.all([
            window.kubectl.getServices(ctx, nsArg),
            window.kubectl.getIngresses(ctx, nsArg),
            window.kubectl.getPods(ctx, nsArg),
            window.kubectl.getNamespaces(ctx)
          ])
          set({
            services: svcs as KubeService[],
            ingresses: ings as KubeIngress[],
            pods: pds as KubePod[],
            namespaces: nss,
            loadingResources: false
          })
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
          set({ pods: (ns ? await window.kubectl.getPods(ctx, nsArg) : []) })
          break
        case 'deployments':
          set({ deployments: (ns ? await window.kubectl.getDeployments(ctx, nsArg) : []) })
          break
        case 'statefulsets':
          set({ statefulsets: (ns ? await window.kubectl.getStatefulSets(ctx, nsArg) : []) })
          break
        case 'replicasets':
          set({ replicasets: (ns ? await window.kubectl.getReplicaSets(ctx, nsArg) : []) })
          break
        case 'jobs':
          set({ jobs: (ns ? await window.kubectl.getJobs(ctx, nsArg) : []) })
          break
        case 'cronjobs':
          set({ cronjobs: (ns ? await window.kubectl.getCronJobs(ctx, nsArg) : []) })
          break
        case 'services':
          set({ services: (ns ? await window.kubectl.getServices(ctx, nsArg) : []) })
          break
        case 'ingresses':
          set({ ingresses: (ns ? await window.kubectl.getIngresses(ctx, nsArg) : []) })
          break
        case 'configmaps':
          set({ configmaps: (ns ? await window.kubectl.getConfigMaps(ctx, nsArg) : []) })
          break
        case 'secrets':
          set({ secrets: (ns ? await window.kubectl.getSecrets(ctx, nsArg) : []) })
          break
        case 'nodes':
          set({ nodes: await window.kubectl.getNodes(ctx) })
          break
        case 'namespaces':
          set({ namespaces: await window.kubectl.getNamespaces(ctx) })
          break
        case 'events':
          set({ events: (ns ? await window.kubectl.getEvents(ctx, nsArg) : []) })
          break
        case 'crds':
          set({ crds: await window.kubectl.getCRDs(ctx) })
          break
        // ── New namespace-scoped ──
        case 'daemonsets':
          set({ daemonsets: (ns ? await window.kubectl.getDaemonSets(ctx, nsArg) : []) })
          break
        case 'hpas':
          set({ hpas: (ns ? await window.kubectl.getHPAs(ctx, nsArg) : []) })
          break
        case 'pdbs':
          set({ pdbs: (ns ? await window.kubectl.getPodDisruptionBudgets(ctx, nsArg) : []) })
          break
        case 'networkpolicies':
          set({ networkpolicies: (ns ? await window.kubectl.getNetworkPolicies(ctx, nsArg) : []) })
          break
        case 'endpoints':
          set({ endpoints: (ns ? await window.kubectl.getEndpoints(ctx, nsArg) : []) })
          break
        case 'pvcs':
          set({ pvcs: (ns ? await window.kubectl.getPVCs(ctx, nsArg) : []) })
          break
        case 'serviceaccounts':
          set({ serviceaccounts: (ns ? await window.kubectl.getServiceAccounts(ctx, nsArg) : []) })
          break
        case 'roles':
          set({ roles: (ns ? await window.kubectl.getRoles(ctx, nsArg) : []) })
          break
        case 'rolebindings':
          set({ rolebindings: (ns ? await window.kubectl.getRoleBindings(ctx, nsArg) : []) })
          break
        // ── New cluster-scoped ──
        case 'ingressclasses':
          set({ ingressclasses: await window.kubectl.getIngressClasses(ctx) })
          break
        case 'pvs':
          set({ pvs: await window.kubectl.getPVs(ctx) })
          break
        case 'storageclasses':
          set({ storageclasses: await window.kubectl.getStorageClasses(ctx) })
          break
        case 'clusterroles':
          set({ clusterroles: await window.kubectl.getClusterRoles(ctx) })
          break
        case 'clusterrolebindings':
          set({ clusterrolebindings: await window.kubectl.getClusterRoleBindings(ctx) })
          break
      }
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loadingResources: false })
    }
  },

  // ── Dashboard loader ──────────────────────────────────────────────────────

  loadDashboard: async () => {
    const { selectedContext: ctx } = get()
    if (!ctx) return
    set({ loadingResources: true, error: null })

    const ns = get().selectedNamespace
    let firstError: string | null = null

    const setErr = (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      if (!firstError) firstError = msg
    }

    await Promise.all([
      window.kubectl.getNodes(ctx)
        .then(nodes => set({ nodes }))
        .catch(e => { setErr(e); set({ nodes: [] }) }),
      window.kubectl.getNodeMetrics(ctx)
        .then(nodeMetrics => set({ nodeMetrics }))
        .catch(() => set({ nodeMetrics: [] })),
      window.kubectl.getNamespaces(ctx)
        .then(namespaces => set({ namespaces }))
        .catch(e => { setErr(e); set({ namespaces: [] }) }),

      window.kubectl.getEvents(ctx, null)
        .then(events => set({ events }))
        .catch(() => {
          if (ns) window.kubectl.getEvents(ctx, ns).then(events => set({ events })).catch(() => { })
        }),

      window.kubectl.getPods(ctx, null)
        .then(pods => set({ pods }))
        .catch(() => {
          if (ns) window.kubectl.getPods(ctx, ns).then(pods => set({ pods })).catch(() => { })
        }),

      window.kubectl.getDeployments(ctx, null)
        .then(deployments => set({ deployments }))
        .catch(() => {
          if (ns) window.kubectl.getDeployments(ctx, ns).then(deployments => set({ deployments })).catch(() => { })
        }),
    ])

    if (firstError) set({ error: firstError })
    set({ loadingResources: false })
  },

  refresh: () => get().loadSection(get().section),

  // ── Operations ────────────────────────────────────────────────────────────

  scaleDeployment: async (name, replicas, namespace) => {
    const { selectedContext: ctx, selectedNamespace: ns, selectedResource } = get()
    if (!ctx) return
    const actualNs = namespace ?? (ns === '_all' ? (selectedResource?.metadata.namespace ?? null) : ns)
    if (!actualNs) return
    await window.kubectl.scale(ctx, actualNs, name, replicas)
    await get().loadSection('deployments')
  },

  scaleStatefulSet: async (name, replicas, namespace) => {
    const { selectedContext: ctx, selectedNamespace: ns, selectedResource } = get()
    if (!ctx) return
    const actualNs = namespace ?? (ns === '_all' ? (selectedResource?.metadata.namespace ?? null) : ns)
    if (!actualNs) return
    await window.kubectl.scaleResource(ctx, actualNs, 'statefulset', name, replicas)
    await get().loadSection('statefulsets')
  },

  rolloutRestart: async (kind, name, namespace) => {
    const { selectedContext: ctx, selectedNamespace: ns, selectedResource } = get()
    if (!ctx) return
    const actualNs = namespace ?? (ns === '_all' ? (selectedResource?.metadata.namespace ?? null) : ns)
    if (!actualNs) return
    await window.kubectl.rolloutRestart(ctx, actualNs, kind, name)
  },

  deleteResource: async (kind, name, clusterScoped = false, namespace?: string) => {
    const { selectedContext: ctx, selectedNamespace: ns, selectedResource } = get()
    if (!ctx) return
    const actualNs = clusterScoped
      ? null
      : (namespace ?? (ns === '_all' ? (selectedResource?.metadata.namespace ?? null) : ns))
    await window.kubectl.deleteResource(ctx, actualNs, kind, name)
    set({ selectedResource: null })
    await get().loadSection(get().section)
  },

  getYAML: async (kind, name, clusterScoped = false, namespace?: string) => {
    const { selectedContext: ctx, selectedNamespace: ns, selectedResource } = get()
    if (!ctx) return ''
    const actualNs = clusterScoped
      ? null
      : (namespace ?? (ns === '_all' ? (selectedResource?.metadata.namespace ?? null) : ns))
    return window.kubectl.getYAML(ctx, actualNs, kind, name)
  },

  applyYAML: async (yaml) => {
    const { selectedContext: ctx } = get()
    if (!ctx) return ''
    const result = await window.kubectl.applyYAML(ctx, yaml)
    await get().loadSection(get().section)
    return result
  },

  // ── Port Forwarding ────────────────────────────────────────────────────────

  startPortForward: (entry) => {
    set(s => ({ portForwards: [...s.portForwards, entry] }))
    const ctx = get().selectedContext!
    window.kubectl.portForward(ctx, entry.namespace, entry.type, entry.name, entry.localPort, entry.remotePort, entry.id)
    window.kubectl.onPortForwardReady(entry.id, () =>
      set(s => ({ portForwards: s.portForwards.map(f => f.id === entry.id ? { ...f, status: 'active' } : f) }))
    )
    window.kubectl.onPortForwardError(entry.id, (msg) =>
      set(s => ({ portForwards: s.portForwards.map(f => f.id === entry.id ? { ...f, status: 'error', error: msg } : f) }))
    )
    window.kubectl.onPortForwardExit(entry.id, () =>
      set(s => ({ portForwards: s.portForwards.filter(f => f.id !== entry.id) }))
    )
  },

  stopPortForward: (id) => {
    window.kubectl.stopPortForward(id)
    set(s => ({ portForwards: s.portForwards.filter(f => f.id !== id) }))
  }
}))
