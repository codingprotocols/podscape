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
    ambassador: false,
}

export const createProvidersSlice: StoreSlice<ProvidersSlice> = (set, get) => {
    // Per-store-instance counter so test stores each start from 0, preventing
    // test-order-dependent flakiness from a shared module-level counter.
    let fetchSeq = 0

    return {
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
    }
}
