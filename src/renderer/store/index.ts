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
            const [ctxList, currentCtx] = await Promise.all([
                window.kubectl.getContexts(),
                window.kubectl.getCurrentContext().catch(() => null)
            ])
            const ctxNames = new Set((ctxList as KubeContextEntry[]).map(c => c.name))
            const hotbarPruned = get().hotbarContexts.filter(name => ctxNames.has(name))
            if (hotbarPruned.length !== get().hotbarContexts.length) {
                localStorage.setItem('podscape:hotbar', JSON.stringify(hotbarPruned))
            }
            const active = currentCtx && ctxList.find((c: KubeContextEntry) => c.name === currentCtx)
            const chose = active ? currentCtx! : ctxList[0]?.name ?? null
            set({ contexts: ctxList, selectedContext: chose, hotbarContexts: hotbarPruned, loadingContexts: false })

            if (!chose) {
                set({ error: 'No Kubernetes contexts found. Please check your kubeconfig.' })
            } else {
                await get().selectContext(chose)
            }

            const pluginList = await window.plugins.list().catch(() => [])
            set({ plugins: pluginList })
        } catch (err) {
            set({ error: (err as Error).message, loadingContexts: false })
        }
    },
}))
