import { create } from 'zustand'
import { AppStore } from './types'
import { createNavigationSlice } from './slices/navigationSlice'
import { createClusterSlice } from './slices/clusterSlice'
import { createResourceSlice } from './slices/resourceSlice'
import { createOperationSlice } from './slices/operationSlice'
import { createAnalysisSlice } from './slices/analysisSlice'
import { KubeContextEntry } from '../types'

export const useAppStore = create<AppStore>()((...a) => ({
    ...createNavigationSlice(...a),
    ...createClusterSlice(...a),
    ...createResourceSlice(...a),
    ...createOperationSlice(...a),
    ...createAnalysisSlice(...a),

    // ── Combined actions (init) ────────────────────────────────────────────────
    init: async () => {
        const [set, get] = a
        // Sync theme on init
        const currentTheme = get().theme
        if (currentTheme === 'dark') {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }

        set({ loadingContexts: true, error: null })
        try {
            // 1. Check tools & Load settings
            const [toolsState, settings] = await Promise.all([
                window.settings.checkTools(),
                window.settings.get()
            ])
            set({ ...toolsState, prodContexts: settings.prodContexts || [] })

            // 2. Load contexts if config exists
            let ctxList: KubeContextEntry[] = []
            let currentCtx: string | null = null

            if (toolsState.kubeconfigOk) {
                try {
                    const [list, current] = await Promise.all([
                        window.kubectl.getContexts(),
                        window.kubectl.getCurrentContext().catch(() => null)
                    ])
                    ctxList = list as KubeContextEntry[]
                    currentCtx = current
                } catch (e) {
                    console.error('[init] Failed to load contexts:', e)
                    // We don't fail here, we just have an empty list
                }
            }

            const ctxNames = new Set(ctxList.map(c => c.name))
            const active = (get().starredContext && ctxNames.has(get().starredContext!))
                ? get().starredContext!
                : (currentCtx && ctxNames.has(currentCtx))
                    ? currentCtx
                    : ctxList[0]?.name ?? null


            set({
                contexts: ctxList,
                selectedContext: active,
                loadingContexts: false
            })

            if (active) {
                await get().selectContext(active)
            }

        } catch (err) {
            set({ error: (err as Error).message, loadingContexts: false })
        }
    },
}))
