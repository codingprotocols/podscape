import { StoreSlice, AppStore, ExecTarget, ExecSession, CustomScanOptions } from '../types'
import { extractWorkloadImages } from '../../utils/security/extractImages'
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

// ── Section config ────────────────────────────────────────────────────────────
// Single source of truth mapping each resource section to its state key and
// fetch function. Both loadSection and the clear-on-context-switch derive from
// this map, so they can never fall out of sync.

type SectionConfig = {
    stateKey: string
    fetch: (ctx: string, ns: string | null) => Promise<any[]>
    namespaced: boolean  // false = cluster-scoped; namespace arg is ignored
}

export const SECTION_CONFIG: Partial<Record<ResourceKind, SectionConfig>> = {
    pods:                { stateKey: 'pods',                fetch: (c, ns) => window.kubectl.getPods(c, ns),                  namespaced: true },
    deployments:         { stateKey: 'deployments',         fetch: (c, ns) => window.kubectl.getDeployments(c, ns),            namespaced: true },
    daemonsets:          { stateKey: 'daemonsets',          fetch: (c, ns) => window.kubectl.getDaemonSets(c, ns),             namespaced: true },
    statefulsets:        { stateKey: 'statefulsets',        fetch: (c, ns) => window.kubectl.getStatefulSets(c, ns),           namespaced: true },
    replicasets:         { stateKey: 'replicasets',         fetch: (c, ns) => window.kubectl.getReplicaSets(c, ns),            namespaced: true },
    jobs:                { stateKey: 'jobs',                fetch: (c, ns) => window.kubectl.getJobs(c, ns),                   namespaced: true },
    cronjobs:            { stateKey: 'cronjobs',            fetch: (c, ns) => window.kubectl.getCronJobs(c, ns),               namespaced: true },
    hpas:                { stateKey: 'hpas',                fetch: (c, ns) => window.kubectl.getHPAs(c, ns),                   namespaced: true },
    pdbs:                { stateKey: 'pdbs',                fetch: (c, ns) => window.kubectl.getPodDisruptionBudgets(c, ns),   namespaced: true },
    services:            { stateKey: 'services',            fetch: (c, ns) => window.kubectl.getServices(c, ns),               namespaced: true },
    ingresses:           { stateKey: 'ingresses',           fetch: (c, ns) => window.kubectl.getIngresses(c, ns),              namespaced: true },
    networkpolicies:     { stateKey: 'networkpolicies',     fetch: (c, ns) => window.kubectl.getNetworkPolicies(c, ns),        namespaced: true },
    endpoints:           { stateKey: 'endpoints',           fetch: (c, ns) => window.kubectl.getEndpoints(c, ns),              namespaced: true },
    configmaps:          { stateKey: 'configmaps',          fetch: (c, ns) => window.kubectl.getConfigMaps(c, ns),             namespaced: true },
    secrets:             { stateKey: 'secrets',             fetch: (c, ns) => window.kubectl.getSecrets(c, ns),                namespaced: true },
    pvcs:                { stateKey: 'pvcs',                fetch: (c, ns) => window.kubectl.getPVCs(c, ns),                   namespaced: true },
    serviceaccounts:     { stateKey: 'serviceaccounts',     fetch: (c, ns) => window.kubectl.getServiceAccounts(c, ns),        namespaced: true },
    roles:               { stateKey: 'roles',               fetch: (c, ns) => window.kubectl.getRoles(c, ns),                  namespaced: true },
    rolebindings:        { stateKey: 'rolebindings',        fetch: (c, ns) => window.kubectl.getRoleBindings(c, ns),           namespaced: true },
    events:              { stateKey: 'events',              fetch: (c, ns) => window.kubectl.getEvents(c, ns),                 namespaced: true },
    nodes:               { stateKey: 'nodes',               fetch: (c, _)  => window.kubectl.getNodes(c),                     namespaced: false },
    namespaces:          { stateKey: 'namespaces',          fetch: (c, _)  => window.kubectl.getNamespaces(c),                 namespaced: false },
    crds:                { stateKey: 'crds',                fetch: (c, _)  => window.kubectl.getCRDs(c),                       namespaced: false },
    ingressclasses:      { stateKey: 'ingressclasses',      fetch: (c, _)  => window.kubectl.getIngressClasses(c),             namespaced: false },
    pvs:                 { stateKey: 'pvs',                 fetch: (c, _)  => window.kubectl.getPVs(c),                        namespaced: false },
    storageclasses:      { stateKey: 'storageclasses',      fetch: (c, _)  => window.kubectl.getStorageClasses(c),             namespaced: false },
    clusterroles:        { stateKey: 'clusterroles',        fetch: (c, _)  => window.kubectl.getClusterRoles(c),               namespaced: false },
    clusterrolebindings: { stateKey: 'clusterrolebindings', fetch: (c, _)  => window.kubectl.getClusterRoleBindings(c),        namespaced: false },
}

// Pre-computed reset object for all resource sections (empty arrays).
// Import this in clusterSlice to clear resource lists on context switch.
// Note: deniedSections is reset separately in clusterSlice alongside other cross-cutting state.
export const sectionClearState: Record<string, any> = {
    ...Object.fromEntries(Object.values(SECTION_CONFIG).map(c => [c!.stateKey, []])),
}

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
    execSessions: ExecSession[]
    activeExecId: string | null
    selectResource: (r: AnyKubeResource | null) => void
    setError: (err: string | null) => void
    clearError: () => void
    openExec: (target: ExecTarget) => void
    setActiveExecId: (id: string) => void
    closeExecTab: (id: string) => void
    closeExec: () => void
    deniedSections: Set<ResourceKind>
    loadSection: (section: ResourceKind) => Promise<void>
    loadDashboard: () => Promise<void>
    refresh: () => Promise<void>
    preloadSearchResources: () => Promise<void>
    scanSecurity: (options?: CustomScanOptions) => Promise<void>
    securityScanning: boolean
    securityScanProgressLines: string[]
    kubesecBatchResults: Record<string, any> | null
    trivyAvailable: boolean | null
    lastPreloadedAt: number
    lastDashboardLoadedAt: number
    navigateToResource: (kind: string, name: string, namespace: string) => void
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
    securityScanning: false,
    securityScanProgressLines: [],
    kubesecBatchResults: null,
    trivyAvailable: null,
    lastPreloadedAt: 0,
    lastDashboardLoadedAt: 0,
    selectedResource: null,
    loadingResources: false,
    error: null,
    execSessions: [],
    activeExecId: null,

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
    openExec: (target) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const session: ExecSession = { id, target }
        set(s => ({ execSessions: [...s.execSessions, session], activeExecId: id }))
    },
    closeExecTab: (id) => set(s => {
        const remaining = s.execSessions.filter(sess => sess.id !== id)
        let nextActive = s.activeExecId
        if (s.activeExecId === id) {
            const idx = s.execSessions.findIndex(sess => sess.id === id)
            const next = s.execSessions[idx + 1] ?? s.execSessions[idx - 1]
            nextActive = next?.id ?? null
        }
        return { execSessions: remaining, activeExecId: nextActive }
    }),
    setActiveExecId: (id) => set({ activeExecId: id }),
    closeExec: () => set({ execSessions: [], activeExecId: null }),
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
                    loadingResources: false
                })
            } catch { if (get().selectedContext === snapshotCtx) set({ loadingResources: false, podMetrics: [], nodeMetrics: [] }) }
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
                    loadingResources: false
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
                    loadingResources: false
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
            set({ [config.stateKey]: Array.isArray(data) ? data : [], loadingResources: false } as Partial<AppStore>)
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
            { key: 'nodes',       fetch: () => window.kubectl.getNodes(ctx),             required: true },
            { key: 'nodeMetrics', fetch: () => window.kubectl.getNodeMetrics(ctx),        required: false },
            { key: 'namespaces',  fetch: () => window.kubectl.getNamespaces(ctx),         required: true },
            { key: 'events',      fetch: () => window.kubectl.getEvents(ctx, null),       retry: ns ? () => window.kubectl.getEvents(ctx, ns)      : undefined, required: false },
            { key: 'pods',        fetch: () => window.kubectl.getPods(ctx, null),         retry: ns ? () => window.kubectl.getPods(ctx, ns)        : undefined, required: false },
            { key: 'deployments', fetch: () => window.kubectl.getDeployments(ctx, null),  retry: ns ? () => window.kubectl.getDeployments(ctx, ns) : undefined, required: false },
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
        set({ lastDashboardLoadedAt: 0 })
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

    scanSecurity: async (options?: CustomScanOptions) => {
        set({ securityScanning: true, error: null, securityScanProgressLines: [] })

        // Synthetic milestone helper — prefixed with '› ' so the UI can style them distinctly.
        const milestone = (msg: string) =>
            set(s => ({ securityScanProgressLines: [...s.securityScanProgressLines.slice(-9), `› ${msg}`] }))

        const { pods, deployments, statefulsets, daemonsets, jobs, cronjobs } = get()
        let workloads = [...pods, ...deployments, ...statefulsets, ...daemonsets, ...jobs, ...cronjobs]

        // Apply scope filters when a custom scan is requested.
        if (options) {
            if (options.namespaces.length > 0) {
                const nsSet = new Set(options.namespaces)
                workloads = workloads.filter(w => nsSet.has(w.metadata.namespace || ''))
            }
            if (options.kinds.length > 0) {
                const kindSet = new Set(options.kinds.map(k => k.toLowerCase()))
                workloads = workloads.filter(w => kindSet.has((w.kind || '').toLowerCase()))
            }
        }

        const runTrivy = !options || options.runTrivy
        const runKubesec = !options || options.runKubesec

        milestone(`${workloads.length} workload${workloads.length !== 1 ? 's' : ''} in scope`)
        if (runTrivy && runKubesec) milestone('Launching config analysis + image CVE scan')
        else if (runTrivy) milestone('Launching image CVE scan')
        else milestone('Launching config analysis')

        // Strip the `TIMESTAMP\tLEVEL\t` prefix that trivy emits on every stderr line.
        const TRIVY_PREFIX_RE = /^\S+\t(?:INFO|WARN|ERROR|FATAL)\t/
        // Suppress trivy lines that are internal noise and not useful to the user.
        const TRIVY_NOISE_RE = /Unable to parse (container|image)|unable to parse digest/i

        // Wire up the progress relay before starting the scan so no lines are missed.
        const unsubProgress = window.kubectl.onSecurityProgress((line: string) => {
            const clean = line.replace(TRIVY_PREFIX_RE, '').trim()
            if (!clean) return
            // Suppress trivy internal noise that isn't actionable for the user.
            if (TRIVY_NOISE_RE.test(clean)) return
            // Keep only the last 10 lines to avoid unbounded growth.
            set(s => ({ securityScanProgressLines: [...s.securityScanProgressLines.slice(-9), clean] }))
        })

        try {
            const [trivyResult, kubesecResult] = await Promise.allSettled([
                runTrivy
                    ? (() => {
                        if (options?.selectedImages !== undefined) {
                            const entries = extractWorkloadImages(workloads)
                                .filter(e => (options.selectedImages as string[]).includes(e.image))
                            if (entries.length === 0) return Promise.resolve(null)
                            return window.kubectl.scanTrivyImages(entries)
                        }
                        return window.kubectl.scanSecurity()
                    })()
                    : Promise.resolve(null),
                runKubesec ? window.kubectl.scanKubesecBatch(workloads) : Promise.resolve(null),
            ])

            // --- trivy ---
            let error: string | null = null
            const stateUpdate: Record<string, any> = { securityScanning: false }

            if (runTrivy) {
                if (trivyResult.status === 'fulfilled') {
                    let trivyData = trivyResult.value
                    // Post-filter trivy Resources to match custom scope.
                    if (trivyData && options) {
                        trivyData = filterTrivyByScope(trivyData, options)
                    }
                    stateUpdate.securityScanResults = trivyData
                    stateUpdate.trivyAvailable = true
                } else {
                    const msg: string = trivyResult.reason?.message ?? ''
                    if (msg.includes('trivy_not_found') || msg.includes('trivy binary not found')) {
                        stateUpdate.trivyAvailable = false
                    } else {
                        error = `Image scan failed: ${msg}`
                        stateUpdate.trivyAvailable = null
                    }
                    stateUpdate.securityScanResults = null
                }
            } else {
                // Config-only scan: clear stale trivy results so the UI matches the scan scope.
                stateUpdate.securityScanResults = null
            }

            // --- kubesec batch ---
            // Build a map of "namespace/name/kind" → batch result for O(1) lookup in the UI.
            let kubesecBatchResults: Record<string, any> | null = null
            if (runKubesec && kubesecResult.status === 'fulfilled' && kubesecResult.value !== null) {
                const raw: any[] = kubesecResult.value
                kubesecBatchResults = {}
                workloads.forEach((w: any, i: number) => {
                    const key = `${w.metadata?.namespace ?? ''}/${w.metadata?.name ?? ''}/${w.kind ?? ''}`
                    kubesecBatchResults![key] = raw[i]
                })
            }
            stateUpdate.kubesecBatchResults = kubesecBatchResults
            stateUpdate.error = error

            milestone('Processing results...')
            set(stateUpdate)
        } finally {
            unsubProgress()
        }
    },

    navigateToResource: async (kind, name, namespace) => {
        const section = kindToSection[kind]
        if (!section) return
        // Update nav state directly (setSection also calls loadSection without await)
        set({ section, selectedResource: null })
        // Wait for resources to load before searching
        await get().loadSection(section)
        const stateKey = SECTION_CONFIG[section]?.stateKey
        if (!stateKey) return
        const resources: AnyKubeResource[] = (get() as Record<string, AnyKubeResource[]>)[stateKey] ?? []
        const found = resources.find((r: AnyKubeResource) =>
            r.metadata.name === name && (r.metadata.namespace === namespace || !namespace)
        )
        if (found) get().selectResource(found)
    },
})

/** Post-filters trivy scan output to match the custom scan scope. */
function filterTrivyByScope(data: any, options: CustomScanOptions): any {
    if (!data?.Resources) return data
    let resources = data.Resources
    if (options.namespaces.length > 0) {
        const nsSet = new Set(options.namespaces)
        resources = resources.filter((r: any) => nsSet.has(r.Namespace))
    }
    if (options.kinds.length > 0) {
        const kindSet = new Set(options.kinds)
        resources = resources.filter((r: any) => kindSet.has(r.Kind))
    }
    return { ...data, Resources: resources }
}

const kindToSection: Record<string, ResourceKind> = {
    Pod: 'pods',
    Deployment: 'deployments',
    ReplicaSet: 'replicasets',
    DaemonSet: 'daemonsets',
    StatefulSet: 'statefulsets',
    Job: 'jobs',
    CronJob: 'cronjobs',
    Service: 'services',
    Ingress: 'ingresses',
    ConfigMap: 'configmaps',
    Secret: 'secrets',
    Node: 'nodes',
    Namespace: 'namespaces',
    HorizontalPodAutoscaler: 'hpas',
    PersistentVolumeClaim: 'pvcs',
    PersistentVolume: 'pvs',
    ServiceAccount: 'serviceaccounts',
    Role: 'roles',
    ClusterRole: 'clusterroles',
    RoleBinding: 'rolebindings',
    ClusterRoleBinding: 'clusterrolebindings',
}

export function kindLabel(section: string): string {
    const map: Record<string, string> = {
        pods: 'pod', deployments: 'deployment', daemonsets: 'daemonset',
        statefulsets: 'statefulset', replicasets: 'replicaset', jobs: 'job', cronjobs: 'cronjob',
        hpas: 'horizontalpodautoscaler', pdbs: 'poddisruptionbudget',
        services: 'service', ingresses: 'ingress', ingressclasses: 'ingressclass',
        networkpolicies: 'networkpolicy', endpoints: 'endpoints',
        configmaps: 'configmap', secrets: 'secret',
        pvcs: 'persistentvolumeclaim', pvs: 'persistentvolume', storageclasses: 'storageclass',
        serviceaccounts: 'serviceaccount', roles: 'role', clusterroles: 'clusterrole',
        rolebindings: 'rolebinding', clusterrolebindings: 'clusterrolebinding',
        nodes: 'node', namespaces: 'namespace', crds: 'crd'
    }
    return map[section] ?? section
}
