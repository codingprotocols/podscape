import { StoreSlice, AppStore } from '../types'
import {
    KubePod, KubeDeployment, KubeDaemonSet, KubeStatefulSet,
    KubeReplicaSet, KubeJob, KubeCronJob, KubeHPA, KubePDB,
    KubeService, KubeIngress, KubeIngressClass, KubeNetworkPolicy, KubeEndpoints,
    KubeConfigMap, KubeSecret, KubePVC, KubePV, KubeStorageClass,
    KubeServiceAccount, KubeRole, KubeClusterRole, KubeRoleBinding, KubeClusterRoleBinding,
    KubeNode, KubeEvent, KubeCRD,
    NodeMetrics, PodMetrics, ResourceKind, AnyKubeResource, PortForwardEntry,
    HelmRelease, DebugPodEntry, AppGroup
} from '../../types'
import { SECTION_CONFIG, sectionClearState, kindToSection, kindLabel } from '../resourceConfig'

export { SECTION_CONFIG, sectionClearState }

export interface ResourceSlice {
    pods: KubePod[]
    apps: AppGroup[]
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
    portForwards: PortForwardEntry[]
    helmReleases: HelmRelease[]
    debugPods: DebugPodEntry[]
    securityScanResults: any | null
    addDebugPod: (pod: DebugPodEntry) => void
    removeDebugPod: (name: string) => void
    updateDebugPod: (name: string, updates: Partial<DebugPodEntry>) => void
    selectedResource: AnyKubeResource | null
    loadingResources: boolean
    error: string | null
    metricsError: string | null
    selectResource: (r: AnyKubeResource | null) => void
    setError: (err: string | null) => void
    clearError: () => void
    deniedSections: Set<ResourceKind>
    loadSection: (section: ResourceKind) => Promise<void>
    loadDashboard: () => Promise<void>
    refresh: () => Promise<void>
    preloadSearchResources: () => Promise<void>
    lastPreloadedAt: number
    lastDashboardLoadedAt: number
    sectionLoadedAt: Partial<Record<string, number>>
    navigateToResource: (kind: string, name: string, namespace: string) => Promise<void>
}

export const createResourceSlice: StoreSlice<ResourceSlice> = (set, get) => ({
    pods: [],
    apps: [],
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
    portForwards: [],
    helmReleases: [],
    debugPods: [],
    deniedSections: new Set<ResourceKind>(),
    securityScanResults: null,
    lastPreloadedAt: 0,
    lastDashboardLoadedAt: 0,
    sectionLoadedAt: {},
    selectedResource: null,
    loadingResources: false,
    error: null,
    metricsError: null,

    selectResource: (r) => {
        if (r && !r.kind) {
            const section = get().section
            r.kind = kindLabel(section)
        }
        set({ selectedResource: r })
        if (r) {
            const { resourceHistory } = get()
            const exists = resourceHistory.find(h => h.metadata.uid === r.metadata.uid)
            if (exists) {
                // Move to front
                set({ resourceHistory: [r, ...resourceHistory.filter(h => h.metadata.uid !== r.metadata.uid)] })
            } else {
                set({ resourceHistory: [r, ...resourceHistory].slice(0, 5) })
            }
        }
    },
    setError: (err) => set({ error: err }),
    clearError: () => set({ error: null }),
    addDebugPod: (pod) => set(s => ({ debugPods: [pod, ...s.debugPods] })),
    removeDebugPod: (name) => set(s => ({ debugPods: s.debugPods.filter(p => p.name !== name) })),
    updateDebugPod: (name, updates) => set(s => ({ debugPods: s.debugPods.map(p => p.name === name ? { ...p, ...updates } : p) })),

    loadSection: async (section) => {
        const { selectedContext: ctx, selectedNamespace: ns } = get()
        if (!ctx) return
        // Snapshot the context so we can discard results if a switch happens mid-fetch.
        const snapshotCtx = ctx

        if (section === 'dashboard') {
            await get().loadDashboard()
            return
        }

        const nsArg = ns === '_all' ? null : ns

        // Section-level TTL cache — 30 s, keyed by section + namespace so that
        // switching namespace always bypasses the cache and fetches fresh data.
        // The cache is cleared on context switch (via sectionClearState) and on
        // explicit refresh() calls.
        const SECTION_TTL = 30_000
        const cacheKey = `${section}:${nsArg ?? '_all'}`
        if (Date.now() - (get().sectionLoadedAt[cacheKey] ?? 0) < SECTION_TTL) return

        // Panel sections with multi-resource custom loading
        if (section === 'metrics') {
            set({ loadingResources: true })
            try {
                const [pm, nm, pds, nds, hpas] = await Promise.all([
                    window.kubectl.getPodMetrics(ctx, nsArg),
                    window.kubectl.getNodeMetrics(ctx),
                    window.kubectl.getPods(ctx, nsArg),
                    window.kubectl.getNodes(ctx),
                    window.kubectl.getHPAs(ctx, nsArg)
                ])
                if (get().selectedContext !== snapshotCtx) return
                set({
                    podMetrics: Array.isArray(pm) ? pm : [],
                    nodeMetrics: Array.isArray(nm) ? nm : [],
                    pods: (Array.isArray(pds) ? pds : []) as KubePod[],
                    nodes: (Array.isArray(nds) ? nds : []) as KubeNode[],
                    hpas: (Array.isArray(hpas) ? hpas : []) as KubeHPA[],
                    loadingResources: false,
                    metricsError: null,
                    sectionLoadedAt: { ...get().sectionLoadedAt, [cacheKey]: Date.now() },
                })
            } catch (err) {
                if (get().selectedContext === snapshotCtx) set({
                    loadingResources: false,
                    podMetrics: [],
                    nodeMetrics: [],
                    metricsError: err instanceof Error ? err.message : 'Failed to load metrics',
                })
            }
            return
        }

        if (section === 'network') {
            set({ loadingResources: true })
            try {
                const [svcs, ings, pds, nss, nps] = await Promise.all([
                    window.kubectl.getServices(ctx, nsArg),
                    window.kubectl.getIngresses(ctx, nsArg),
                    window.kubectl.getPods(ctx, nsArg),
                    window.kubectl.getNamespaces(ctx),
                    window.kubectl.getNetworkPolicies(ctx, nsArg)
                ])
                if (get().selectedContext !== snapshotCtx) return
                set({
                    services: svcs as KubeService[],
                    ingresses: ings as KubeIngress[],
                    pods: pds as KubePod[],
                    namespaces: nss,
                    networkpolicies: nps as KubeNetworkPolicy[],
                    loadingResources: false,
                    sectionLoadedAt: { ...get().sectionLoadedAt, [cacheKey]: Date.now() },
                })
            } catch { if (get().selectedContext === snapshotCtx) set({ loadingResources: false }) }
            return
        }

        if (section === 'security') {
            set({ loadingResources: true })
            try {
                const [pds, depls, dss, stss, js, cjs] = await Promise.all([
                    window.kubectl.getPods(ctx, nsArg),
                    window.kubectl.getDeployments(ctx, nsArg),
                    window.kubectl.getDaemonSets(ctx, nsArg),
                    window.kubectl.getStatefulSets(ctx, nsArg),
                    window.kubectl.getJobs(ctx, nsArg),
                    window.kubectl.getCronJobs(ctx, nsArg)
                ])
                if (get().selectedContext !== snapshotCtx) return
                set({
                    pods: pds as KubePod[],
                    deployments: depls as KubeDeployment[],
                    daemonsets: dss as KubeDaemonSet[],
                    statefulsets: stss as KubeStatefulSet[],
                    jobs: js as KubeJob[],
                    cronjobs: cjs as KubeCronJob[],
                    loadingResources: false,
                    sectionLoadedAt: { ...get().sectionLoadedAt, [cacheKey]: Date.now() },
                })
            } catch { if (get().selectedContext === snapshotCtx) set({ loadingResources: false }) }
            return
        }

        // View-only panels with no data loading
        if (!SECTION_CONFIG[section]) return

        const config = SECTION_CONFIG[section]!
        const fetchNs = config.namespaced ? nsArg : null

        // Namespace-scoped sections need a selected namespace
        if (config.namespaced && !ns) {
            set({ [config.stateKey]: [] } as Partial<AppStore>)
            return
        }

        set({ loadingResources: true, error: null, selectedResource: null })
        try {
            const data = await config.fetch(ctx, fetchNs)
            // Discard results if the context switched while we were fetching.
            if (get().selectedContext !== snapshotCtx) return
            set({
                [config.stateKey]: Array.isArray(data) ? data : [],
                loadingResources: false,
                sectionLoadedAt: { ...get().sectionLoadedAt, [cacheKey]: Date.now() },
            } as Partial<AppStore>)
        } catch (err) {
            if (get().selectedContext !== snapshotCtx) return
            // Sidecar signals RBAC denial via RBACDeniedError (thrown by the main process IPC handler).
            // Mark the section as denied so the UI can show "Access denied" instead of an error.
            if (err instanceof Error && err.message.startsWith('RBAC_DENIED:')) {
                set(s => ({
                    [config.stateKey]: [],
                    deniedSections: new Set([...s.deniedSections, section]),
                    loadingResources: false,
                } as Partial<AppStore>))
            } else {
                set({ error: (err as Error).message, loadingResources: false })
            }
        }
    },

    loadDashboard: async () => {
        const { selectedContext: ctx, lastDashboardLoadedAt } = get()
        if (!ctx) return
        // Skip re-fetch if dashboard data is < 30s old (navigation back to dashboard).
        // refresh() resets lastDashboardLoadedAt to 0 before calling loadSection, bypassing this guard.
        if (Date.now() - lastDashboardLoadedAt < 30_000) return
        // Snapshot context to detect mid-fetch context switches and discard stale results.
        const snapshotCtx = ctx
        set({ loadingResources: true, error: null })
        const ns = get().selectedNamespace === '_all' ? null : get().selectedNamespace

        type DashboardFetch = {
            key: string
            fetch: () => Promise<any>
            retry?: () => Promise<any>  // ns-scoped fallback when all-namespace fetch fails
            required: boolean
        }
        const fetches: DashboardFetch[] = [
            { key: 'nodes',            fetch: () => window.kubectl.getNodes(ctx),                  required: true },
            { key: 'nodeMetrics',      fetch: () => window.kubectl.getNodeMetrics(ctx),             required: false },
            { key: 'namespaces',       fetch: () => window.kubectl.getNamespaces(ctx),              required: true },
            { key: 'events',           fetch: () => window.kubectl.getEvents(ctx, null),            retry: ns ? () => window.kubectl.getEvents(ctx, ns)           : undefined, required: false },
            { key: 'pods',             fetch: () => window.kubectl.getPods(ctx, null),              retry: ns ? () => window.kubectl.getPods(ctx, ns)             : undefined, required: false },
            { key: 'deployments',      fetch: () => window.kubectl.getDeployments(ctx, null),       retry: ns ? () => window.kubectl.getDeployments(ctx, ns)      : undefined, required: false },
            { key: 'statefulsets',     fetch: () => window.kubectl.getStatefulSets(ctx, null),      retry: ns ? () => window.kubectl.getStatefulSets(ctx, ns)     : undefined, required: false },
            { key: 'daemonsets',       fetch: () => window.kubectl.getDaemonSets(ctx, null),        retry: ns ? () => window.kubectl.getDaemonSets(ctx, ns)       : undefined, required: false },
            { key: 'services',         fetch: () => window.kubectl.getServices(ctx, null),          retry: ns ? () => window.kubectl.getServices(ctx, ns)         : undefined, required: false },
            { key: 'configmaps',       fetch: () => window.kubectl.getConfigMaps(ctx, null),        retry: ns ? () => window.kubectl.getConfigMaps(ctx, ns)       : undefined, required: false },
            { key: 'hpas',             fetch: () => window.kubectl.getHPAs(ctx, null),              retry: ns ? () => window.kubectl.getHPAs(ctx, ns)             : undefined, required: false },
        ]

        const results = await Promise.allSettled(fetches.map(f => f.fetch()))

        // For failed all-namespace fetches, retry with ns-scoped call; resolve to [] on second failure.
        const finalValues = await Promise.all(
            fetches.map((f, i) => {
                const r = results[i]
                if (r.status === 'fulfilled') return Promise.resolve(r.value)
                if (f.retry) return f.retry().catch(() => [])
                return Promise.resolve([])
            })
        )

        const updates: Record<string, any> = {}
        let firstError: string | null = null
        fetches.forEach((f, i) => {
            updates[f.key] = finalValues[i]
            if (results[i].status === 'rejected' && f.required) {
                const r = results[i] as PromiseRejectedResult
                const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
                if (!firstError) firstError = msg
            }
        })
        // Discard results if the context switched while fetches were in-flight.
        if (get().selectedContext !== snapshotCtx) return

        set({ ...updates, ...(firstError ? { error: firstError } : {}) })

        // Group resources into Apps
        const allResources: AnyKubeResource[] = [
            ...(get().deployments),
            ...(get().statefulsets),
            ...(get().daemonsets),
            ...(get().services),
            ...(get().configmaps),
            ...(get().hpas)
        ]

        const groups: Record<string, AppGroup> = {}
        const APP_LABELS = ['app.kubernetes.io/name', 'app', 'run']

        allResources.forEach(r => {
            const labels = r.metadata.labels || {}
            let appName = ''
            for (const key of APP_LABELS) {
                if (labels[key]) {
                    appName = labels[key]
                    break
                }
            }

            if (appName) {
                const ns = r.metadata.namespace || 'default'
                const key = `${ns}:${appName}`
                if (!groups[key]) {
                    groups[key] = { name: appName, namespace: ns, resources: [] }
                }
                groups[key].resources.push(r)
            }
        })

        set({ apps: Object.values(groups).sort((a, b) => a.name.localeCompare(b.name)), loadingResources: false, lastDashboardLoadedAt: Date.now() })
    },

    refresh: () => {
        // Clear the TTL cache for the current section and the dashboard so the
        // next loadSection call always fetches fresh data from the sidecar.
        set({ lastDashboardLoadedAt: 0, sectionLoadedAt: {} })
        return get().loadSection(get().section)
    },

    preloadSearchResources: async () => {
        const { selectedContext: ctx, lastPreloadedAt } = get()
        if (!ctx) return
        // Skip if data is fresh (< 60s old) to avoid redundant fetches on repeated search opens.
        if (Date.now() - lastPreloadedAt < 60_000) return
        set({ lastPreloadedAt: Date.now() })

        // Fetch essential resources for search across all namespaces.
        // Promise.allSettled so a permission-denied on one type (e.g. secrets in
        // restricted clusters) doesn't block the others from being cached.
        const keys = ['pods', 'deployments', 'services', 'configmaps', 'secrets'] as const
        const results = await Promise.allSettled([
            window.kubectl.getPods(ctx, null),
            window.kubectl.getDeployments(ctx, null),
            window.kubectl.getServices(ctx, null),
            window.kubectl.getConfigMaps(ctx, null),
            window.kubectl.getSecrets(ctx, null),
        ])
        // Discard results if the context switched while fetches were in-flight.
        if (get().selectedContext !== ctx) return
        const updates: Record<string, any[]> = {}
        results.forEach((r, i) => {
            if (r.status === 'fulfilled') {
                updates[keys[i]] = r.value as AnyKubeResource[]
            } else {
                console.warn(`[preload] ${keys[i]} failed:`, r.reason)
            }
        })
        if (Object.keys(updates).length > 0) set(updates as Partial<AppStore>)
    },

    navigateToResource: async (kind, name, namespace) => {
        const section = kindToSection[kind]
        if (!section) return
        const snapshotCtx = get().selectedContext
        // Update nav state directly (setSection also calls loadSection without await)
        set({ section, selectedResource: null })
        // Wait for resources to load before searching
        await get().loadSection(section)
        // Discard if the context switched while we were loading.
        if (get().selectedContext !== snapshotCtx) return
        const stateKey = SECTION_CONFIG[section]?.stateKey
        if (!stateKey) return
        const resources: AnyKubeResource[] = (get() as Record<string, AnyKubeResource[]>)[stateKey] ?? []
        const found = resources.find((r: AnyKubeResource) =>
            r.metadata.name === name && (r.metadata.namespace === namespace || !namespace)
        )
        if (found) get().selectResource(found)
    },
})

export { kindLabel }
