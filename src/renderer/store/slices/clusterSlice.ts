import { StoreSlice } from '../types'
import { KubeContextEntry, KubeNamespace, OwnerChainResponse, ResourceKind } from '../../types'
import { sectionClearState, clearInFlightSections } from './resourceSlice'
import { defaultTimeRange } from '../../utils/prometheusQueries'

export interface ClusterSlice {
    contexts: KubeContextEntry[]
    selectedContext: string | null
    starredContext: string | null
    setStarredContext: (name: string | null) => void
    hotbarContexts: string[]
    toggleHotbarContext: (name: string) => void
    namespaces: KubeNamespace[]
    selectedNamespace: string | null
    loadingContexts: boolean
    loadingNamespaces: boolean
    kubeconfigOk: boolean
    prodContexts: string[]
    setProdContexts: (contexts: string[]) => Promise<void>
    isProduction: boolean
    contextSwitchStatus: string | null
    selectContext: (name: string) => Promise<void>
    selectNamespace: (name: string) => void
    prometheusAvailable: boolean | null
    prometheusProbeError: string | null
    prometheusTimeRange: { start: number; end: number }
    prometheusActivePreset: '1h' | '6h' | '24h' | '7d'
    setPrometheusTimeRange: (range: { start: number; end: number }, preset?: '1h' | '6h' | '24h' | '7d') => void
    probePrometheus: () => Promise<void>
    disconnectPrometheus: () => void
    ownerChains: Record<string, OwnerChainResponse>
    allowedVerbs: Record<string, Record<string, boolean>>
    fetchAllowedVerbs: () => Promise<void>
}


const safeGetItem = (key: string): string | null => {
    try { return localStorage.getItem(key) } catch { return null }
}

/**
 * canVerb checks whether the given RBAC verb is allowed for a resource.
 * resource: Kubernetes plural name (e.g. "deployments", "pods").
 * verb: one of "list", "watch", "delete", "update", "patch", "create".
 *
 * Returns true (permissive) when allowedVerbs is empty (probe not yet run)
 * or the resource is absent from the map.
 */
export function canVerb(
    allowedVerbs: Record<string, Record<string, boolean>>,
    resource: string,
    verb: string
): boolean {
    if (!allowedVerbs || Object.keys(allowedVerbs).length === 0) return true
    const resourceVerbs = allowedVerbs[resource]
    if (!resourceVerbs) return true
    return resourceVerbs[verb] === true
}

export const createClusterSlice: StoreSlice<ClusterSlice> = (set, get) => {
    let contextSwitchSeq = 0
    let prometheusProbeSeq = 0
    // inflightSwitchTarget / inflightSwitchPromise deduplicate concurrent calls
    // to selectContext for the same target. Kept in closure (not module) scope so
    // multiple store instances (e.g. in tests) are fully isolated.
    let inflightSwitchTarget: string | null = null
    let inflightSwitchPromise: Promise<void> | null = null
    let allowedVerbsSeq = 0
    return ({
    contexts: [],
    selectedContext: null,
    starredContext: safeGetItem('podscape:starred'),
    setStarredContext: (name) => {
        set({ starredContext: name })
        if (name) localStorage.setItem('podscape:starred', name)
        else localStorage.removeItem('podscape:starred')
    },
    hotbarContexts: (() => {
        try {
            const saved = safeGetItem('podscape:hotbar')
            return saved ? JSON.parse(saved) : []
        } catch { return [] }
    })(),
    toggleHotbarContext: (name) => {
        const { hotbarContexts } = get()
        const next = hotbarContexts.includes(name)
            ? hotbarContexts.filter(c => c !== name)
            : [...hotbarContexts, name]
        set({ hotbarContexts: next })
        localStorage.setItem('podscape:hotbar', JSON.stringify(next))
    },
    namespaces: [],
    selectedNamespace: null,
    loadingContexts: true,  // true until init() finishes — prevents blank flash on first render
    loadingNamespaces: false,
    kubeconfigOk: true,
    prodContexts: [],
    setProdContexts: async (contexts) => {
        set({ prodContexts: contexts })
        const { selectedContext, prodContexts } = get()
        set({ isProduction: !!selectedContext && prodContexts.includes(selectedContext) })
        const s = await window.settings.get()
        await window.settings.set({ ...s, prodContexts: contexts })
    },
    isProduction: false,
    contextSwitchStatus: null,
    prometheusAvailable: null,
    prometheusProbeError: null,
    prometheusTimeRange: defaultTimeRange(),
    prometheusActivePreset: '1h',
    setPrometheusTimeRange: (range, preset) => set({ prometheusTimeRange: range, ...(preset ? { prometheusActivePreset: preset } : {}) }),
    probePrometheus: async () => {
        if (!window.kubectl.prometheusStatus) return
        // Sequence counter deduplicates concurrent probe calls — if two probes race,
        // only the last-started one commits its result (same pattern as contextSwitchSeq).
        const mySeq = ++prometheusProbeSeq
        // Snapshot the context at call time — discard result if user switched away.
        const probeCtx = get().selectedContext
        try {
            let prometheusUrl: string | undefined
            try {
                const s = await window.settings.get()
                prometheusUrl = s.prometheusUrls?.[probeCtx ?? ''] || undefined
            } catch { /* ignore — fall back to auto-discovery */ }
            const data = await window.kubectl.prometheusStatus(prometheusUrl)
            if (mySeq !== prometheusProbeSeq || get().selectedContext !== probeCtx) return
            const d = data as { available?: boolean; error?: string }
            set({
                prometheusAvailable: !!d.available,
                prometheusProbeError: d.error || null,
            })
        } catch {
            if (mySeq !== prometheusProbeSeq || get().selectedContext !== probeCtx) return
            set({ prometheusAvailable: false, prometheusProbeError: null })
        }
    },
    disconnectPrometheus: () => {
        set({ prometheusAvailable: null, prometheusProbeError: null })
        // Also clear the saved URL for this context so next probe starts fresh.
        // ctx is captured synchronously so we always clear the correct context's URL
        // even if the user switches away before the async settings write completes.
        // The read-then-write is an inherent race with other concurrent settings
        // updates; the window is minimised by reading fresh settings immediately
        // before the write in the same microtask continuation.
        const ctx = get().selectedContext
        if (!ctx) return
        void (async () => {
            try {
                const s = await window.settings.get()
                const urls = { ...(s.prometheusUrls ?? {}) }
                delete urls[ctx]
                await window.settings.set({ ...s, prometheusUrls: urls })
            } catch (err) {
                console.error('[disconnectPrometheus] Failed to clear Prometheus URL from settings:', err)
            }
        })()
    },
    ownerChains: {},
    allowedVerbs: {},

    selectContext: async (name) => {
        // Dedup before any state mutation: if this exact context is already being
        // switched to, wait for the in-flight HTTP call and return — the first
        // caller owns the state transition and namespace load entirely.
        // inflightSwitchTarget is set synchronously below (before the first await),
        // so any concurrent call that starts on the next microtask sees it here.
        if (inflightSwitchTarget === name) {
            if (inflightSwitchPromise !== null) {
                try { await inflightSwitchPromise } catch { /* first caller handles rollback */ }
            }
            return
        }
        // Claim this switch slot synchronously so concurrent calls for the same
        // target see the guard above and don't reset state unnecessarily.
        inflightSwitchTarget = name

        const mySeq = ++contextSwitchSeq
        const previousContext = get().selectedContext
        // Snapshot namespace state so we can restore it if the connection attempt fails.
        const previousNamespaces = get().namespaces
        const previousSelectedNamespace = get().selectedNamespace
        // Snapshot provider state so it can be restored if the connection attempt fails.
        const previousProviders = get().providers
        const isProd = get().prodContexts.includes(name)
        // Unblock any section fetches that were in-flight for the previous context.
        // Without this, loadSection for the new context can see a stale in-flight key
        // (same section + same namespace name) and bail out, leaving the section empty.
        clearInFlightSections()
        // Evict the Go sidecar's Prometheus cache. The cache key does not include the
        // cluster context or Prometheus URL, so entries from the old cluster would
        // otherwise be served to the new cluster's charts for up to 60 s.
        window.kubectl.prometheusFlushCache?.().catch(() => {})
        // If the user is viewing a provider-specific section (Istio/Traefik/Nginx),
        // navigate back to dashboard before the context flips. This prevents
        // ProviderResourcePanel from firing a getCustomResource fetch against a
        // cluster that may not have the same providers installed.
        const currentSection = get().section as string
        const isProviderSection = currentSection.startsWith('istio-') ||
            currentSection.startsWith('traefik-') ||
            currentSection.startsWith('nginx-') ||
            currentSection.startsWith('keda-') ||
            currentSection.startsWith('ambassador-')
        set({
            selectedContext: name, isProduction: isProd, loadingNamespaces: true, loadingResources: true,
            namespaces: [], selectedNamespace: null, selectedResource: null, error: null,
            // Reset security scan state so stale results from the previous context are not shown.
            securityScanResults: null, kubesecBatchResults: null, trivyAvailable: null, securityScanProgressLines: [],
            // Reset scanning flags so the new context's scan button is not stuck disabled
            // if a background scan was in-flight when the context switched.
            securityScanning: false, scanInBackground: false, isScanning: false,
            // Reset provider loading flag so it doesn't get stuck if the previous fetch
            // was in-flight and the stale-guard fires without resetting it.
            providersLoading: false,
            // Reset freshness timestamps so next dashboard/preload fetch always runs.
            lastPreloadedAt: 0, lastDashboardLoadedAt: 0,
            // Clear owner chains cached from previous context.
            ownerChains: {},
            helmReleases: [],
            podMetrics: [],
            nodeMetrics: [],
            debugPods: [],
            prometheusAvailable: null,
            prometheusProbeError: null,
            metricsError: null,
            // Reset provider detection so stale flags from the old cluster don't
            // briefly show sidebar groups that don't exist in the new cluster.
            providers: { istio: false, traefik: false, nginxInc: false, nginxCommunity: false, keda: false, cilium: false, hubbleRelay: false, ambassador: false },
            // Navigate away from provider-specific sections so ProviderResourcePanel
            // doesn't attempt a fetch against a cluster that may lack those CRDs.
            ...(isProviderSection ? { section: 'dashboard' as const } : {}),
            ...sectionClearState,
            deniedSections: new Set<ResourceKind>(),
            unifiedLogsSelectedPods: [],
            allowedVerbs: {},
        })
        try {
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Cannot reach cluster "${name}" — timed out after 15s`)), 15000)
            )
            set({ contextSwitchStatus: 'Connecting…' })
            // Cancel any in-flight log/exec streams from the previous context before
            // switching, so stale data doesn't arrive after the switch completes.
            try { await window.kubectl.cancelAllStreams() } catch {}
            // Stop all active port forwards — they belong to the previous context.
            get().stopAllPortForwards()
            // Close any open exec sessions — their PTY connections belong to the previous context.
            get().closeExec()
            // Tell the sidecar to switch its clientset + informer cache to the new
            // context BEFORE fetching any data. Without this the sidecar keeps
            // serving the previous context's cache.
            // inflightSwitchTarget is already set to name (before state reset).
            // Publish the promise so concurrent latecomers can await it.
            const switchP = Promise.race([window.kubectl.switchContext(name), timeout]).then(() => undefined)
            inflightSwitchPromise = switchP
            try {
                await switchP
            } finally {
                if (inflightSwitchTarget === name) inflightSwitchTarget = null
                inflightSwitchPromise = null
            }
            if (mySeq !== contextSwitchSeq) return

            set({ contextSwitchStatus: 'Loading namespaces…' })
            // Connectivity check — getNamespaces is the first real API call.
            // If the cluster is unreachable (VPN down, expired creds, wrong endpoint)
            // this throws immediately instead of letting all resource fetches fail.
            let nsList: any[]
            try {
                nsList = await Promise.race([window.kubectl.getNamespaces(name), timeout])
            } catch (connectErr) {
                if (mySeq !== contextSwitchSeq) return
                // Rollback: restore previous context in the sidecar and in the store.
                if (previousContext) {
                    try { await window.kubectl.switchContext(previousContext) } catch {}
                    set({
                        selectedContext: previousContext,
                        isProduction: get().prodContexts.includes(previousContext),
                        // Restore namespace list so the user is not left with an empty sidebar.
                        namespaces: previousNamespaces,
                        selectedNamespace: previousSelectedNamespace,
                        // Restore provider state so sidebar groups are not wiped on a failed switch.
                        providers: previousProviders,
                        providersLoading: false,
                    })
                }
                const msg = (connectErr as Error).message
                const friendly = msg.includes('timed out')
                    ? `Cannot reach "${name}" — cluster did not respond in time. Check VPN and credentials.`
                    : `Cannot reach "${name}" — ${msg}`
                set({ error: friendly, loadingNamespaces: false, loadingResources: false, contextSwitchStatus: null })
                return
            }
            if (mySeq !== contextSwitchSeq) return
            const chosen = nsList.length > 0 ? '_all' : null
            set({ namespaces: nsList, selectedNamespace: chosen, contextSwitchStatus: 'Loading resources…' })
            if (chosen) {
                await get().loadSection(get().section)
                if (mySeq !== contextSwitchSeq) return
                get().preloadSearchResources() // background, fire-and-forget
                get().fetchProviders()          // background, fire-and-forget
                get().fetchAllowedVerbs()       // background, fire-and-forget
                // Prometheus is opt-in — only probe when the user clicks
                // "Detect Now" in Settings. Auto-probing on every context
                // switch causes false positives or spurious error messages.
            }
            set({ loadingNamespaces: false, loadingResources: false, contextSwitchStatus: null })
        } catch (err) {
            if (mySeq !== contextSwitchSeq) return
            set({ error: (err as Error).message, loadingNamespaces: false, loadingResources: false, contextSwitchStatus: null })
        }
    },

    selectNamespace: (name) => {
        // Reset lastPreloadedAt so the next search-palette open fetches results
        // scoped to the new namespace rather than serving 60s-stale data.
        set({ selectedNamespace: name, selectedResource: null, metricsError: null, lastPreloadedAt: 0 })
        get().loadSection(get().section)
    },

    fetchAllowedVerbs: async () => {
        const ctx = get().selectedContext
        if (!ctx) return
        const mySeq = ++allowedVerbsSeq
        try {
            const verbs = await window.kubectl.getAllowedVerbs(ctx)
            if (mySeq !== allowedVerbsSeq || get().selectedContext !== ctx) return
            set({ allowedVerbs: verbs ?? {} })
        } catch {
            if (mySeq !== allowedVerbsSeq || get().selectedContext !== ctx) return
            // probe failed — stay permissive (empty map = all buttons visible)
        }
    },
    })
}
