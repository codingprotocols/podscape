import { StoreSlice } from '../types'
import krewPluginsJson from '../../config/krewPlugins.json'

export interface KrewPluginDef {
    name: string
    short: string
    description: string
    category: string
    homepage: string
    docs: string
    tags: string[]
}

export interface KrewPlugin extends KrewPluginDef {
    installed: boolean
}

export interface KrewSlice {
    krewAvailable: boolean | null
    krewUnsupported: boolean
    krewInstalling: boolean
    pluginIndex: KrewPlugin[]
    installedPlugins: string[]
    indexLastUpdated: number | null
    indexRefreshing: boolean
    selectedPlugin: string | null
    probeKrew: () => Promise<void>
    loadPluginIndex: () => Promise<void>
    refreshIndexIfStale: () => Promise<void>
    setSelectedPlugin: (name: string | null) => void
    upgradeAll: () => Promise<{ ok: boolean }>
}

const CURATED_PLUGINS: KrewPluginDef[] = krewPluginsJson
const INDEX_TTL_MS = 24 * 60 * 60 * 1000

export const createKrewSlice: StoreSlice<KrewSlice> = (set, get) => {
    async function loadPluginIndex() {
        set({ indexRefreshing: true })
        try {
            const installed = await window.krew.installed()
            const installedSet = new Set(installed)

            const curatedIndex: KrewPlugin[] = CURATED_PLUGINS.map(p => ({
                ...p,
                installed: installedSet.has(p.name),
            }))

            set({
                pluginIndex: curatedIndex,
                installedPlugins: installed,
                indexLastUpdated: Date.now(),
                indexRefreshing: false,
            })
        } catch (err) {
            console.error('[krew] loadPluginIndex failed:', err)
            set({ indexRefreshing: false })
        }
    }

    return {
        krewAvailable: null,
        krewUnsupported: false,
        krewInstalling: false,
        pluginIndex: [],
        installedPlugins: [],
        indexLastUpdated: null,
        indexRefreshing: false,
        selectedPlugin: null,

        probeKrew: async () => {
            try {
                const result = await window.krew.detect()
                set({ krewAvailable: result.available, krewUnsupported: !!result.unsupported })
            } catch {
                set({ krewAvailable: false, krewUnsupported: false })
            }
        },

        loadPluginIndex,

        refreshIndexIfStale: async () => {
            const { indexLastUpdated, indexRefreshing } = get()
            if (indexRefreshing) return
            if (indexLastUpdated !== null && Date.now() - indexLastUpdated < INDEX_TTL_MS) return
            await loadPluginIndex()
        },

        setSelectedPlugin: (name) => set({ selectedPlugin: name }),

        upgradeAll: async () => {
            return window.krew.upgradeAll()
        },
    }
}
