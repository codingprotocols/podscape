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
}

export const createProvidersSlice: StoreSlice<ProvidersSlice> = (set, get) => ({
    providers: defaultProviders,
    providersLoading: false,

    fetchProviders: async () => {
        const ctx = get().selectedContext
        if (!ctx) return
        set({ providersLoading: true })
        try {
            const ps = await window.kubectl.getProviders()
            // Discard result if context switched while the request was in-flight
            // (same guard as probePrometheus to prevent stale-context overwrites).
            if (get().selectedContext !== ctx) return
            set({ providers: ps, providersLoading: false })
        } catch (err) {
            console.error('[providers] detection failed:', err)
            if (get().selectedContext !== ctx) return
            set({ providers: defaultProviders, providersLoading: false })
        }
    },
})
