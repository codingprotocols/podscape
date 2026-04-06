import { StoreSlice } from '../types'

export interface AllocationItem {
    name: string
    totalCost: number
    cpuCost: number
    ramCost: number
}

export interface CostSlice {
    costAvailable: boolean | null
    costProvider: string           // 'kubecost' | 'opencost' | ''
    costError: string | null
    costAllocations: AllocationItem[]
    costLoading: boolean
    probeCost: () => Promise<void>
    loadCostAllocations: (timeWindow: string, aggregate: string, namespace?: string) => Promise<void>
}

export const createCostSlice: StoreSlice<CostSlice> = (set, get) => ({
    costAvailable: null,
    costProvider: '',
    costError: null,
    costAllocations: [],
    costLoading: false,

    probeCost: async () => {
        const ctx = get().selectedContext
        if (!ctx) return
        try {
            let url: string | undefined
            try {
                const s = await window.settings.get()
                url = s.costUrls?.[ctx] || undefined
            } catch { /* ignore — fall back to default port */ }
            const data = await window.kubectl.costStatus(url)
            if (get().selectedContext !== ctx) return  // stale context guard
            set({
                costAvailable: !!data.available,
                costProvider: data.provider ?? '',
                costError: data.error || null,
            })
        } catch {
            if (get().selectedContext !== ctx) return
            set({ costAvailable: false, costProvider: '', costError: null })
        }
    },

    loadCostAllocations: async (timeWindow: string, aggregate: string, namespace?: string) => {
        set({ costLoading: true, costError: null })
        try {
            const ctx = get().selectedContext ?? ''
            const s = await window.settings.get()
            const url = s.costUrls?.[ctx] || undefined
            const provider = get().costProvider || 'kubecost'
            const items = await window.kubectl.costAllocation(url, provider, timeWindow, aggregate, namespace) as AllocationItem[]
            set({ costAllocations: items, costLoading: false })
        } catch (err) {
            set({ costError: (err as Error).message, costLoading: false })
        }
    },
})
