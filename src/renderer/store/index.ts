import { create } from 'zustand'
import { AppStore } from './types'
import { createNavigationSlice } from './slices/navigationSlice'
import { createClusterSlice } from './slices/clusterSlice'
import { createResourceSlice } from './slices/resourceSlice'
import { createOperationSlice } from './slices/operationSlice'
import { KubeContextEntry } from '../types'

export const useAppStore = create<AppStore>()((...a) => ({
    ...createNavigationSlice(...a),
    ...createClusterSlice(...a),
    ...createResourceSlice(...a),
    ...createOperationSlice(...a),

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
            // 1. Check tools
            const toolsState = await window.settings.checkTools()
            set({ ...toolsState })

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
            const active = (currentCtx && ctxNames.has(currentCtx))
                ? currentCtx
                : (get().starredContext && ctxNames.has(get().starredContext!))
                    ? get().starredContext!
                    : ctxList[0]?.name ?? null

            // If new user (no hotbar), load all available contexts into it.
            let hotbarPruned = get().hotbarContexts
            if (!localStorage.getItem('podscape:hotbar') && ctxList.length > 0) {
                hotbarPruned = ctxList.map(c => c.name)
                localStorage.setItem('podscape:hotbar', JSON.stringify(hotbarPruned))
            } else if (ctxList.length > 0) {
                // Prune non-existent contexts from hotbar
                hotbarPruned = hotbarPruned.filter(name => ctxNames.has(name))
                if (hotbarPruned.length !== get().hotbarContexts.length) {
                    localStorage.setItem('podscape:hotbar', JSON.stringify(hotbarPruned))
                }
            }

            set({
                contexts: ctxList,
                selectedContext: active,
                hotbarContexts: hotbarPruned,
                loadingContexts: false
            })

            if (active) {
                await get().selectContext(active)
            }

            const pluginList = await window.plugins.list().catch(() => [])
            set({ plugins: pluginList })
        } catch (err) {
            set({ error: (err as Error).message, loadingContexts: false })
        }
    },
}))
