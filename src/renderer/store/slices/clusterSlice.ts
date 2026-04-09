import { StoreSlice } from '../types'
import { KubeContextEntry, KubeNamespace, OwnerChainResponse, ResourceKind } from '../../types'
import { sectionClearState } from './resourceSlice'
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
}

let contextSwitchSeq = 0

const safeGetItem = (key: string): string | null => {
    try { return localStorage.getItem(key) } catch { return null }
}

export const createClusterSlice: StoreSlice<ClusterSlice> = (set, get) => ({
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
        // Snapshot the context at call time — discard result if user switched away.
        const probeCtx = get().selectedContext
        try {
            let prometheusUrl: string | undefined
            try {
                const s = await window.settings.get()
                prometheusUrl = s.prometheusUrls?.[probeCtx ?? ''] || undefined
            } catch { /* ignore — fall back to auto-discovery */ }
            const data = await window.kubectl.prometheusStatus(prometheusUrl)
            if (get().selectedContext !== probeCtx) return // switched away, discard
            const d = data as { available?: boolean; error?: string }
            set({
                prometheusAvailable: !!d.available,
                prometheusProbeError: d.error || null,
            })
        } catch {
            if (get().selectedContext !== probeCtx) return
            set({ prometheusAvailable: false, prometheusProbeError: null })
        }
    },
    disconnectPrometheus: () => {
        set({ prometheusAvailable: null, prometheusProbeError: null })
        // Also clear the saved URL for this context so next probe starts fresh.
        const ctx = get().selectedContext
        if (ctx) {
            window.settings.get().then(s => {
                const urls = { ...(s.prometheusUrls ?? {}) }
                delete urls[ctx]
                return window.settings.set({ ...s, prometheusUrls: urls })
            }).catch(err => {
                console.error('[disconnectPrometheus] Failed to clear Prometheus URL from settings:', err)
            })
        }
    },
    ownerChains: {},

    selectContext: async (name) => {
        const mySeq = ++contextSwitchSeq
        const previousContext = get().selectedContext
        const isProd = get().prodContexts.includes(name)
        // If the user is viewing a provider-specific section (Istio/Traefik/Nginx),
        // navigate back to dashboard before the context flips. This prevents
        // ProviderResourcePanel from firing a getCustomResource fetch against a
        // cluster that may not have the same providers installed.
        const currentSection = get().section as string
        const isProviderSection = currentSection.startsWith('istio-') ||
            currentSection.startsWith('traefik-') ||
            currentSection.startsWith('nginx-')
        set({
            selectedContext: name, isProduction: isProd, loadingNamespaces: true, loadingResources: true,
            namespaces: [], selectedNamespace: null, selectedResource: null, error: null,
            // Reset security scan state so stale results from the previous context are not shown.
            securityScanResults: null, kubesecBatchResults: null, trivyAvailable: null,
            // Reset freshness timestamps so next dashboard/preload fetch always runs.
            lastPreloadedAt: 0, lastDashboardLoadedAt: 0,
            // Clear owner chains cached from previous context.
            ownerChains: {},
            helmReleases: [],
            prometheusAvailable: null,
            prometheusProbeError: null,
            costAvailable: null,
            costProvider: '',
            costError: null,
            costAllocations: [],
            metricsError: null,
            // Reset provider detection so stale flags from the old cluster don't
            // briefly show sidebar groups that don't exist in the new cluster.
            providers: { istio: false, traefik: false, nginxInc: false, nginxCommunity: false },
            // Navigate away from provider-specific sections so ProviderResourcePanel
            // doesn't attempt a fetch against a cluster that may lack those CRDs.
            ...(isProviderSection ? { section: 'dashboard' as const } : {}),
            ...sectionClearState,
            deniedSections: new Set<ResourceKind>(),
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
            // Tell the sidecar to switch its clientset + informer cache to the new
            // context BEFORE fetching any data. Without this the sidecar keeps
            // serving the previous context's cache.
            await Promise.race([window.kubectl.switchContext(name), timeout])
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
                    set({ selectedContext: previousContext, isProduction: get().prodContexts.includes(previousContext) })
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
                get().preloadSearchResources() // background, fire-and-forget
                get().fetchProviders()          // background, fire-and-forget
                get().probeCost()               // background, fire-and-forget
                // Prometheus is opt-in — only probe when the user clicks
                // "Detect Now" in Settings. Auto-probing on every context
                // switch causes false positives or spurious error messages.
            }
            set({ loadingNamespaces: false, contextSwitchStatus: null })
        } catch (err) {
            if (mySeq !== contextSwitchSeq) return
            set({ error: (err as Error).message, loadingNamespaces: false })
        }
    },

    selectNamespace: (name) => {
        set({ selectedNamespace: name, selectedResource: null, metricsError: null })
        get().loadSection(get().section)
    },
})
