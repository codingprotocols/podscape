import { StoreSlice } from '../types'
import { KubeContextEntry, KubeNamespace } from '../../types'
import { sectionClearState } from './resourceSlice'

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
    selectContext: (name: string) => Promise<void>
    selectNamespace: (name: string) => void
}

let contextSwitchSeq = 0

export const createClusterSlice: StoreSlice<ClusterSlice> = (set, get) => ({
    contexts: [],
    selectedContext: null,
    starredContext: localStorage.getItem('podscape:starred'),
    setStarredContext: (name) => {
        set({ starredContext: name })
        if (name) localStorage.setItem('podscape:starred', name)
        else localStorage.removeItem('podscape:starred')
    },
    hotbarContexts: (() => {
        try {
            const saved = localStorage.getItem('podscape:hotbar')
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

    selectContext: async (name) => {
        const mySeq = ++contextSwitchSeq
        const isProd = get().prodContexts.includes(name)
        set({
            selectedContext: name, isProduction: isProd, loadingNamespaces: true, loadingResources: true,
            namespaces: [], selectedNamespace: null, selectedResource: null, error: null,
            ...sectionClearState,
        })
        try {
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Cannot reach cluster "${name}" — timed out after 30s`)), 30000)
            )
            // Tell the sidecar to switch its clientset + informer cache to the new
            // context BEFORE fetching any data. Without this the sidecar keeps
            // serving the previous context's cache.
            await Promise.race([window.kubectl.switchContext(name), timeout])
            if (mySeq !== contextSwitchSeq) return

            // Sidecar handlers fall back to direct k8s API calls while informers
            // warm up in the background, so data is available immediately — no
            // need to poll /health before fetching.
            const nsList = await Promise.race([window.kubectl.getNamespaces(name), timeout])
            if (mySeq !== contextSwitchSeq) return
            const chosen = nsList.length > 0 ? '_all' : null
            set({ namespaces: nsList, selectedNamespace: chosen })
            if (chosen) {
                await get().loadSection(get().section)
                get().preloadSearchResources() // background, fire-and-forget
            }
            set({ loadingNamespaces: false })
        } catch (err) {
            if (mySeq !== contextSwitchSeq) return
            set({ error: (err as Error).message, loadingNamespaces: false })
        }
    },

    selectNamespace: (name) => {
        set({ selectedNamespace: name, selectedResource: null })
        get().loadSection(get().section)
    },
})
