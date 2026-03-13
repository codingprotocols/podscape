import { StoreSlice } from '../types'
import { KubeContextEntry, KubeNamespace } from '../../types'

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
    loadingContexts: false,
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
            selectedContext: name, isProduction: isProd, loadingNamespaces: true,
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
                setTimeout(() => reject(new Error(`Cannot reach cluster "${name}" — timed out after 30s`)), 30000)
            )
            const nsList = await Promise.race([window.kubectl.getNamespaces(name), timeout])
            if (mySeq !== contextSwitchSeq) return
            const chosen = nsList.length > 0 ? '_all' : null
            set({ namespaces: nsList, selectedNamespace: chosen, loadingNamespaces: false })
            if (chosen) {
                get().loadSection(get().section) 
                get().preloadSearchResources() // Start background preloading for search
            }
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
