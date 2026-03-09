import { StoreSlice } from '../types'
import { KubeContextEntry, KubeNamespace } from '../../types'

export interface ClusterSlice {
    contexts: KubeContextEntry[]
    selectedContext: string | null
    starredContext: string | null
    setStarredContext: (name: string | null) => void
    hotbarContexts: string[]
    toggleHotbarContext: (contextName: string) => void
    namespaces: KubeNamespace[]
    selectedNamespace: string | null
    loadingContexts: boolean
    loadingNamespaces: boolean
    kubectlOk: boolean
    helmOk: boolean
    kubeconfigOk: boolean
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
    loadingContexts: false,
    loadingNamespaces: false,
    kubectlOk: true, // Default to true so we don't flash onboarding
    helmOk: true,
    kubeconfigOk: true,

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
                setTimeout(() => reject(new Error(`Cannot reach cluster "${name}" — timed out after 30s`)), 30000)
            )
            const nsList = await Promise.race([window.kubectl.getNamespaces(name), timeout])
            if (mySeq !== contextSwitchSeq) return
            const chosen = nsList.length > 0 ? '_all' : null
            set({ namespaces: nsList, selectedNamespace: chosen, loadingNamespaces: false })
            if (chosen) {
                get().loadSection(get().section) // intentionally not awaited — context switch returns immediately
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
