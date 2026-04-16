import { StoreSlice } from '../types'

export interface KrewPlugin {
    name: string
    version: string
    short: string
    installed: boolean
}

export interface KrewSlice {
    krewAvailable: boolean | null
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
            const [allPlugins, installed] = await Promise.all([
                window.krew.search(),
                window.krew.installed(),
            ])
            const installedSet = new Set(installed)
            // Krew's JSON output uses lowercase field names on macOS/Linux but may
            // use PascalCase in some versions — normalize both for robustness.
            const index: KrewPlugin[] = allPlugins.map((p: any) => ({
                name: p.name ?? p.Name ?? '',
                version: p.version ?? p.Version ?? '',
                short: p.short ?? p.Short ?? p.description ?? '',
                installed: installedSet.has(p.name ?? p.Name ?? ''),
            }))
            set({
                pluginIndex: index,
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
        krewInstalling: false,
        pluginIndex: [],
        installedPlugins: [],
        indexLastUpdated: null,
        indexRefreshing: false,
        selectedPlugin: null,

        probeKrew: async () => {
            try {
                const result = await window.krew.detect()
                set({ krewAvailable: result.available })
            } catch {
                set({ krewAvailable: false })
            }
        },

        loadPluginIndex,

        refreshIndexIfStale: async () => {
            const { indexLastUpdated } = get()
            if (indexLastUpdated !== null && Date.now() - indexLastUpdated < INDEX_TTL_MS) return
            try {
                await window.krew.update()
            } catch (err) {
                console.error('[krew] krew update failed:', err)
            }
            await loadPluginIndex()
        },

        setSelectedPlugin: (name) => set({ selectedPlugin: name }),

        upgradeAll: async () => {
            return window.krew.upgradeAll()
        },
    }
}
