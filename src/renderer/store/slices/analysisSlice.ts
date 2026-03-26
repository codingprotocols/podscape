import { StoreSlice, CustomScanOptions } from '../types'
import { AnyKubeResource } from '../../types'
import { scannerEngine } from '../../utils/scanner/engine'
import { ScanResult } from '../../utils/scanner/types'
import { extractWorkloadImages } from '../../utils/security/extractImages'
import { filterTrivyByScope } from '../resourceConfig'

export interface AnalysisSlice {
    scanResults: Record<string, ScanResult> // key is resource UID
    isScanning: boolean
    scanResource: (resource: AnyKubeResource) => void
    clearScanResults: () => void
    securityScanning: boolean
    securityScanProgressLines: string[]
    kubesecBatchResults: Record<string, any> | null
    trivyAvailable: boolean | null
    scanSecurity: (options?: CustomScanOptions) => Promise<void>
}

export const createAnalysisSlice: StoreSlice<AnalysisSlice> = (set, get) => ({
    scanResults: {},
    isScanning: false,
    securityScanning: false,
    securityScanProgressLines: [],
    kubesecBatchResults: null,
    trivyAvailable: null,

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

    clearScanResults: () => set((state) => ({ ...state, scanResults: {} })),

    scanSecurity: async (options?: CustomScanOptions) => {
        set({ securityScanning: true, error: null, securityScanProgressLines: [] })

        // Synthetic milestone helper — prefixed with '› ' so the UI can style them distinctly.
        const milestone = (msg: string) =>
            set(s => ({ securityScanProgressLines: [...s.securityScanProgressLines.slice(-9), `› ${msg}`] }))

        const { pods, deployments, statefulsets, daemonsets, jobs, cronjobs } = get()
        let workloads = [...pods, ...deployments, ...statefulsets, ...daemonsets, ...jobs, ...cronjobs]

        // Apply scope filters when a custom scan is requested.
        if (options) {
            if (options.namespaces.length > 0) {
                const nsSet = new Set(options.namespaces)
                workloads = workloads.filter(w => nsSet.has(w.metadata.namespace || ''))
            }
            if (options.kinds.length > 0) {
                const kindSet = new Set(options.kinds.map(k => k.toLowerCase()))
                workloads = workloads.filter(w => kindSet.has((w.kind || '').toLowerCase()))
            }
        }

        const runTrivy = !options || options.runTrivy
        const runKubesec = !options || options.runKubesec

        milestone(`${workloads.length} workload${workloads.length !== 1 ? 's' : ''} in scope`)
        if (runTrivy && runKubesec) milestone('Launching config analysis + image CVE scan')
        else if (runTrivy) milestone('Launching image CVE scan')
        else milestone('Launching config analysis')

        // Strip the `TIMESTAMP\tLEVEL\t` prefix that trivy emits on every stderr line.
        const TRIVY_PREFIX_RE = /^\S+\t(?:INFO|WARN|ERROR|FATAL)\t/
        // Suppress trivy lines that are internal noise and not useful to the user.
        const TRIVY_NOISE_RE = /Unable to parse (container|image)|unable to parse digest/i

        // Wire up the progress relay before starting the scan so no lines are missed.
        const unsubProgress = window.kubectl.onSecurityProgress((line: string) => {
            const clean = line.replace(TRIVY_PREFIX_RE, '').trim()
            if (!clean) return
            // Suppress trivy internal noise that isn't actionable for the user.
            if (TRIVY_NOISE_RE.test(clean)) return
            // Keep only the last 10 lines to avoid unbounded growth.
            set(s => ({ securityScanProgressLines: [...s.securityScanProgressLines.slice(-9), clean] }))
        })

        try {
            const [trivyResult, kubesecResult] = await Promise.allSettled([
                runTrivy
                    ? (() => {
                        if (options?.selectedImages !== undefined) {
                            const entries = extractWorkloadImages(workloads)
                                .filter(e => (options.selectedImages as string[]).includes(e.image))
                            if (entries.length === 0) return Promise.resolve(null)
                            return window.kubectl.scanTrivyImages(entries)
                        }
                        return window.kubectl.scanSecurity()
                    })()
                    : Promise.resolve(null),
                runKubesec ? window.kubectl.scanKubesecBatch(workloads) : Promise.resolve(null),
            ])

            // --- trivy ---
            let error: string | null = null
            const stateUpdate: Record<string, any> = { securityScanning: false }

            if (runTrivy) {
                if (trivyResult.status === 'fulfilled') {
                    let trivyData = trivyResult.value
                    // Post-filter trivy Resources to match custom scope.
                    if (trivyData && options) {
                        trivyData = filterTrivyByScope(trivyData, options)
                    }
                    stateUpdate.securityScanResults = trivyData
                    stateUpdate.trivyAvailable = true
                } else {
                    const msg: string = trivyResult.reason?.message ?? ''
                    if (msg.includes('trivy_not_found') || msg.includes('trivy binary not found')) {
                        stateUpdate.trivyAvailable = false
                    } else {
                        error = `Image scan failed: ${msg}`
                        stateUpdate.trivyAvailable = null
                    }
                    stateUpdate.securityScanResults = null
                }
            } else {
                // Config-only scan: clear stale trivy results so the UI matches the scan scope.
                stateUpdate.securityScanResults = null
            }

            // --- kubesec batch ---
            // Build a map of "namespace/name/kind" → batch result for O(1) lookup in the UI.
            let kubesecBatchResults: Record<string, any> | null = null
            if (runKubesec && kubesecResult.status === 'fulfilled' && kubesecResult.value !== null) {
                const raw: any[] = kubesecResult.value
                kubesecBatchResults = {}
                workloads.forEach((w: any, i: number) => {
                    const key = `${w.metadata?.namespace ?? ''}/${w.metadata?.name ?? ''}/${w.kind ?? ''}`
                    kubesecBatchResults![key] = raw[i]
                })
            }
            stateUpdate.kubesecBatchResults = kubesecBatchResults
            stateUpdate.error = error

            milestone('Processing results...')
            set(stateUpdate)
        } finally {
            unsubProgress()
        }
    },
})
