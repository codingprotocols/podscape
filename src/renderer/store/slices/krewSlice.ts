import { StoreSlice } from '../types'
import { CURATED_PLUGINS } from '../../config/krewPlugins'

export interface KrewPlugin {
    name: string
    version: string
    short: string
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

const INDEX_TTL_MS = 24 * 60 * 60 * 1000

export const createKrewSlice: StoreSlice<KrewSlice> = (set, get) => {
    async function loadPluginIndex() {
        set({ indexRefreshing: true })
        try {
            const installed = await window.krew.installed()
            const installedSet = new Set(installed)

            // Curated entries with live installed status
            const curatedIndex: KrewPlugin[] = CURATED_PLUGINS.map(p => ({
                ...p,
                installed: installedSet.has(p.name),
            }))

            // Stub entries for installed plugins not in the curated list
            const curatedNames = new Set(CURATED_PLUGINS.map(p => p.name))
            const extraInstalled: KrewPlugin[] = installed
                .filter(name => !curatedNames.has(name))
                .map(name => ({ name, version: '', short: '', installed: true }))

            set({
                pluginIndex: [...curatedIndex, ...extraInstalled],
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
            if (indexRefreshing) return  // already in progress
            if (indexLastUpdated !== null && Date.now() - indexLastUpdated < INDEX_TTL_MS) return
            await loadPluginIndex()
        },

        setSelectedPlugin: (name) => set({ selectedPlugin: name }),

        upgradeAll: async () => {
            return window.krew.upgradeAll()
        },
    }
}
