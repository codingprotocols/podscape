import { StoreSlice } from '../types'
import { ProviderSet } from '../../types'

export interface ProvidersSlice {
    providers: ProviderSet
    providersLoading: boolean
    fetchProviders: () => Promise<void>
}

const defaultProviders: ProviderSet = {
    istio: false,
    traefik: false,
    nginxInc: false,
    nginxCommunity: false,
    keda: false,
    cilium: false,
    hubbleRelay: false,
}

// Monotonic counter incremented on every fetchProviders() call. Used alongside
// the string-context guard to reject results from A→B→A switch sequences where
// the string comparison alone would pass for the original stale fetch.
let fetchSeq = 0

export const createProvidersSlice: StoreSlice<ProvidersSlice> = (set, get) => ({
    providers: defaultProviders,
    providersLoading: false,

    fetchProviders: async () => {
        const ctx = get().selectedContext
        if (!ctx) return
        const mySeq = ++fetchSeq
        set({ providersLoading: true })
        try {
            const ps = await window.kubectl.getProviders()
            if (mySeq !== fetchSeq || get().selectedContext !== ctx) {
                set({ providersLoading: false })
                return
            }
            set({ providers: ps, providersLoading: false })
        } catch (err) {
            console.error('[providers] detection failed:', err)
            if (mySeq !== fetchSeq || get().selectedContext !== ctx) {
                set({ providersLoading: false })
                return
            }
            set({ providers: defaultProviders, providersLoading: false })
        }
    },
})
