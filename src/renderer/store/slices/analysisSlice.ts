import { StoreSlice } from '../types'
import { AnyKubeResource } from '../../types'
import { scannerEngine } from '../../utils/scanner/engine'
import { ScanResult } from '../../utils/scanner/types'

export interface AnalysisSlice {
    scanResults: Record<string, ScanResult> // key is resource UID
    isScanning: boolean
    scanResource: (resource: AnyKubeResource) => void
    clearScanResults: () => void
}

export const createAnalysisSlice: StoreSlice<AnalysisSlice> = (set) => ({
    scanResults: {},
    isScanning: false,

    scanResource: (resource) => {
        if (!resource?.metadata?.uid) return

        set((state) => ({ ...state, isScanning: true }))
        try {
            const result = scannerEngine.scan(resource)
            set(state => ({
                ...state,
                scanResults: {
                    ...state.scanResults,
                    [resource.metadata.uid]: result
                },
                isScanning: false
            }))
        } catch (err) {
            console.error('[AnalysisSlice] Scan failed:', err)
            set((state) => ({ ...state, isScanning: false }))
        }
    },

    clearScanResults: () => set((state) => ({ ...state, scanResults: {} }))
})
