import { StoreSlice, AppStore } from '../types'
import {
    KubePod, KubeDeployment, KubeDaemonSet, KubeStatefulSet,
    KubeReplicaSet, KubeJob, KubeCronJob, KubeHPA, KubePDB, KubeResourceQuota, KubeLimitRange,
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
    resourcequotas: KubeResourceQuota[]
    limitranges: KubeLimitRange[]
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
    lastRefreshedAt: number
    sectionLoadedAt: Partial<Record<string, number>>
    navigateToResource: (kind: string, name: string, namespace: string) => Promise<void>
}

// In-flight guard for loadSection. Prevents duplicate parallel fetches when
// a user switches sections rapidly (e.g. Pods → Deployments → Pods in < 100 ms
// before the first Pods fetch resolves).
//
// Intentionally module-level (not Zustand state): JS is single-threaded, so
// the has() check and add() that follow are atomic within a single call frame.
// Putting it in Zustand state would split the check and the write across two
// separate get()/set() calls, introducing a window where two callers could both
// pass the check before either writes. clusterSlice calls clearInFlightSections()
// on every context switch to prevent stale keys from blocking the new context.
const inFlightSections = new Set<string>()
let dashboardFetchSeq = 0
let preloadSeq = 0
let preloadInFlight = false
export const clearInFlightSections = () => {
    inFlightSections.clear()
    preloadInFlight = false
    preloadSeq++
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
    resourcequotas: [],
    limitranges: [],
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
    lastRefreshedAt: 0,
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
        if (inFlightSections.has(cacheKey)) return

        inFlightSections.add(cacheKey)
        try {

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
                if (get().selectedContext !== snapshotCtx) { set({ loadingResources: false }); return }
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
                if (get().selectedContext !== snapshotCtx) { set({ loadingResources: false }); return }
                set({
                    loadingResources: false,
                    podMetrics: [],
                    nodeMetrics: [],
                    metricsError: err instanceof Error ? err.message : 'Failed to load metrics',
                })
            }
            return
        }

        if (section === 'nodes') {
            const existingNodes = get().nodes
            const isFirstLoad = !existingNodes?.length
            if (isFirstLoad) set({ loadingResources: true, error: null, selectedResource: null })
            else set({ error: null })
            try {
                // Fetch nodes first — show the list immediately without waiting for metrics.
                // nodeMetrics calls the Kubernetes Metrics API which can hang for several
                // seconds when metrics-server is not installed (aggregation layer timeout).
                const nds = await window.kubectl.getNodes(ctx)
                if (get().selectedContext !== snapshotCtx) { set({ loadingResources: false }); return }
                const freshNodes = Array.isArray(nds) ? nds as KubeNode[] : []
                const currentSelected = get().selectedResource
                const update: Partial<AppStore> = {
                    nodes: freshNodes,
                    loadingResources: false,
                    sectionLoadedAt: { ...get().sectionLoadedAt, [cacheKey]: Date.now() },
                }
                if (currentSelected) {
                    update.selectedResource = freshNodes.find(r => r.metadata.uid === currentSelected.metadata.uid) ?? null
                }
                set(update as Partial<AppStore>)
            } catch (err) {
                if (get().selectedContext !== snapshotCtx) { set({ loadingResources: false }); return }
                set({ loadingResources: false, error: (err as Error).message })
            }
            // Fetch nodeMetrics in background — metrics bars update shortly after the
            // list appears rather than blocking it.
            window.kubectl.getNodeMetrics(ctx).then(nm => {
                if (get().selectedContext !== snapshotCtx) return
                set({ nodeMetrics: Array.isArray(nm) ? nm as NodeMetrics[] : [] })
            }).catch(() => {})
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
                if (get().selectedContext !== snapshotCtx) { set({ loadingResources: false }); return }
                set({
                    services: svcs as KubeService[],
                    ingresses: ings as KubeIngress[],
                    pods: pds as KubePod[],
                    namespaces: nss,
                    networkpolicies: nps as KubeNetworkPolicy[],
                    loadingResources: false,
                    sectionLoadedAt: { ...get().sectionLoadedAt, [cacheKey]: Date.now() },
                })
            } catch (err) {
                if (get().selectedContext === snapshotCtx)
                    set({ loadingResources: false, error: (err as Error).message })
            }
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
                if (get().selectedContext !== snapshotCtx) { set({ loadingResources: false }); return }
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
            } catch (err) {
                if (get().selectedContext === snapshotCtx)
                    set({ loadingResources: false, error: (err as Error).message })
            }
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

        // Clear any prior RBAC denial so a retry can succeed (e.g. after an admin
        // grants access mid-session without a context switch).
        set(s => {
            if (!s.deniedSections.has(section)) return s
            const next = new Set(s.deniedSections)
            next.delete(section)
            return { deniedSections: next } as Partial<AppStore>
        })

        // Show the loading spinner only on first load (no data yet).
        // On background auto-refresh there is already data visible — skip the
        // spinner and the selectedResource reset so the list stays stable.
        // stateKey is a plain string (SECTION_CONFIG), so this is a dynamic lookup
        // into the store. AppStore has no index signature — go through unknown.
        const existingData = (get() as unknown as Record<string, unknown>)[config.stateKey]
        const isFirstLoad = !Array.isArray(existingData) || (existingData as AnyKubeResource[]).length === 0
        if (isFirstLoad) {
            set({ loadingResources: true, error: null, selectedResource: null })
        } else {
            set({ error: null })
        }
        try {
            const data = await config.fetch(ctx, fetchNs)
            // Discard results if the context switched while we were fetching.
            if (get().selectedContext !== snapshotCtx) { set({ loadingResources: false }); return }
            const freshData: AnyKubeResource[] = Array.isArray(data) ? data as AnyKubeResource[] : []
            // If a resource is selected, find its fresh version in the new data
            // (reflects live status changes). Set to null if it was deleted.
            const currentSelected = get().selectedResource
            const update: Partial<AppStore> = {
                [config.stateKey]: freshData,
                loadingResources: false,
                // Only stamp the TTL when we actually received data — an empty
                // result may mean the informer hasn't synced yet, and caching it
                // would block the next real fetch for 30 seconds.
                ...(freshData.length > 0
                    ? { sectionLoadedAt: { ...get().sectionLoadedAt, [cacheKey]: Date.now() } }
                    : {}),
            }
            if (currentSelected) {
                update.selectedResource = freshData.find(r => r.metadata.uid === currentSelected.metadata.uid) ?? null
            }
            set(update as Partial<AppStore>)
        } catch (err) {
            if (get().selectedContext !== snapshotCtx) { set({ loadingResources: false }); return }
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

        } finally {
            inFlightSections.delete(cacheKey)
        }
    },

    loadDashboard: async () => {
        const { selectedContext: ctx, lastDashboardLoadedAt } = get()
        if (!ctx) return
        // Skip re-fetch if dashboard data is < 30s old (navigation back to dashboard).
        // refresh() resets lastDashboardLoadedAt to 0 before calling loadSection, bypassing this guard.
        if (Date.now() - lastDashboardLoadedAt < 30_000) return
        // Monotonic counter guards against A→B→A context switch bypass where the
        // context string comparison alone would pass (both A sessions share the same string).
        const mySeq = ++dashboardFetchSeq
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
        // nodeMetrics calls the Kubernetes Metrics API which can hang for several
        // seconds when metrics-server is not installed (aggregation layer timeout).
        // Fire it as a background fetch so it doesn't hold up the dashboard render.
        window.kubectl.getNodeMetrics(ctx).then(nm => {
            if (get().selectedContext !== snapshotCtx) return
            set({ nodeMetrics: Array.isArray(nm) ? nm as NodeMetrics[] : [] })
        }).catch(() => {})

        const fetches: DashboardFetch[] = [
            { key: 'nodes',            fetch: () => window.kubectl.getNodes(ctx),                  required: true },
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

        try {
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
            // Both checks required: string comparison catches most switches; monotonic
            // counter catches A→B→A where the string matches the original context again.
            if (mySeq !== dashboardFetchSeq || get().selectedContext !== snapshotCtx) {
                set({ loadingResources: false })
                return
            }

            set({ ...updates, ...(firstError ? { error: firstError } : {}) })

            // Group resources into Apps
            const allResources: AnyKubeResource[] = [
                ...(get().deployments ?? []),
                ...(get().statefulsets ?? []),
                ...(get().daemonsets ?? []),
                ...(get().services ?? []),
                ...(get().configmaps ?? []),
                ...(get().hpas ?? [])
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
        } catch (err) {
            if (mySeq !== dashboardFetchSeq || get().selectedContext !== snapshotCtx) return
            set({ loadingResources: false, error: (err as Error).message })
        }
    },

    refresh: () => {
        // Prevent accidental double-tap from firing 14+ concurrent fetches.
        const now = Date.now()
        if (now - get().lastRefreshedAt < 2_000) return Promise.resolve()
        // Clear all caches so the next load always fetches fresh data.
        clearInFlightSections()
        // Fire-and-forget: evict the Go sidecar's Prometheus cache so charts
        // fetch fresh data after a manual refresh. Safe to ignore errors.
        window.kubectl.prometheusFlushCache?.().catch(() => {})
        set({ lastDashboardLoadedAt: 0, sectionLoadedAt: {}, lastRefreshedAt: now })
        return get().loadSection(get().section)
    },

    preloadSearchResources: async () => {
        const { selectedContext: ctx, lastPreloadedAt, selectedNamespace } = get()
        if (!ctx) return
        // Skip if data is fresh (< 60s old) to avoid redundant fetches on repeated search opens.
        if (Date.now() - lastPreloadedAt < 60_000) return
        // In-flight guard: without this, two callers that both pass the TTL check
        // before either stamps lastPreloadedAt would each launch 5 parallel fetches.
        if (preloadInFlight) return
        preloadInFlight = true
        // Monotonic counter guards against A→B→A context-switch bypass where
        // the context string comparison alone would pass (same string, stale data).
        const mySeq = ++preloadSeq

        // Scope to the selected namespace when one is active. Fetching all-namespaces
        // on a scoped cluster wastes bandwidth proportional to namespace count.
        const ns = selectedNamespace === '_all' ? null : selectedNamespace

        // Fetch essential resources for search in the current scope.
        // Promise.allSettled so a permission-denied on one type (e.g. secrets in
        // restricted clusters) doesn't block the others from being cached.
        const keys = ['pods', 'deployments', 'services', 'configmaps', 'secrets'] as const
        try {
            const results = await Promise.allSettled([
                window.kubectl.getPods(ctx, ns),
                window.kubectl.getDeployments(ctx, ns),
                window.kubectl.getServices(ctx, ns),
                window.kubectl.getConfigMaps(ctx, ns),
                window.kubectl.getSecrets(ctx, ns),
            ])
            // Discard results if the context switched while fetches were in-flight.
            // Both checks required: string catches most switches; counter catches A→B→A.
            if (mySeq !== preloadSeq || get().selectedContext !== ctx) return
            const updates: Record<string, any[]> = {}
            results.forEach((r, i) => {
                if (r.status === 'fulfilled') {
                    updates[keys[i]] = r.value as AnyKubeResource[]
                } else {
                    console.warn(`[preload] ${keys[i]} failed:`, r.reason)
                }
            })
            // Stamp freshness only when at least one resource type was successfully written.
            if (Object.keys(updates).length > 0) set({ ...updates, lastPreloadedAt: Date.now() } as Partial<AppStore>)
        } finally {
            preloadInFlight = false
        }
    },

    navigateToResource: async (kind, name, namespace) => {
        const section = kindToSection[kind]
        if (!section) return
        const snapshotCtx = get().selectedContext
        // Update nav state directly (setSection also calls loadSection without await).
        // Clear only this section's TTL so loadSection fetches fresh data without
        // invalidating every other section's cache (which would cause spurious
        // re-fetches when the user navigates back to other sections).
        const ns = get().selectedNamespace
        const nsArg = ns === '_all' ? null : ns
        const cacheKey = `${section}:${nsArg ?? '_all'}`
        set({ section, selectedResource: null, sectionLoadedAt: { ...get().sectionLoadedAt, [cacheKey]: 0 } })
        // Wait for resources to load before searching
        await get().loadSection(section)
        // Discard if the context switched while we were loading.
        if (get().selectedContext !== snapshotCtx) return
        const stateKey = SECTION_CONFIG[section]?.stateKey
        if (!stateKey) return
        // Dynamic lookup by stateKey — see the note in loadSection above.
        const resources: AnyKubeResource[] = (get() as unknown as Record<string, AnyKubeResource[]>)[stateKey] ?? []
        const found = resources.find((r: AnyKubeResource) =>
            r.metadata.name === name && (r.metadata.namespace === namespace || !namespace)
        )
        if (found) get().selectResource(found)
    },
})

export { kindLabel }
