import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupMocks } from './test-utils'

const { windowMock } = setupMocks()

import { createAnalysisSlice } from './analysisSlice'

// Minimal state that analysisSlice reads from get()
function makeState(overrides: Record<string, any> = {}) {
    return {
        pods: [],
        deployments: [],
        statefulsets: [],
        daemonsets: [],
        jobs: [],
        cronjobs: [],
        error: null,
        securityScanResults: null,
        ...overrides,
    }
}

function makeSlice(stateOverrides: Record<string, any> = {}) {
    const state: Record<string, any> = makeState(stateOverrides)
    const set = vi.fn((update: any) => {
        if (typeof update === 'function') {
            Object.assign(state, update(state))
        } else {
            Object.assign(state, update)
        }
    })
    const get = vi.fn(() => state)
    const slice = createAnalysisSlice(set as any, get as any, {} as any)
    Object.assign(state, slice)
    return { state, set, get, slice }
}

beforeEach(() => {
    vi.clearAllMocks()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('analysisSlice — scanResource', () => {
    it('sets isScanning to false after successful scan', () => {
        const { state } = makeSlice()
        const resource = { metadata: { uid: 'uid-1', name: 'web' }, kind: 'Deployment', spec: {} } as any
        state.scanResource(resource)
        expect(state.isScanning).toBe(false)
    })

    it('stores scan result keyed by uid', () => {
        const { state } = makeSlice()
        const resource = { metadata: { uid: 'uid-2', name: 'web' }, kind: 'Deployment', spec: {} } as any
        state.scanResource(resource)
        expect(state.scanResults['uid-2']).toBeDefined()
    })

    it('is a no-op when resource has no uid', () => {
        const { state } = makeSlice()
        state.scanResource({ metadata: {} } as any)
        expect(state.isScanning).toBe(false)
        expect(Object.keys(state.scanResults)).toHaveLength(0)
    })

    it('sets isScanning to false even when scanner throws', () => {
        const { state } = makeSlice()
        // Pass a resource that causes scannerEngine.scan to throw
        const badResource = { metadata: { uid: 'uid-bad' }, kind: null } as any
        // scan might throw or not — either way isScanning must be false after
        try { state.scanResource(badResource) } catch {}
        expect(state.isScanning).toBe(false)
    })
})

describe('analysisSlice — clearScanResults', () => {
    it('empties scanResults', () => {
        const { state } = makeSlice()
        const resource = { metadata: { uid: 'uid-3', name: 'svc' }, kind: 'Deployment', spec: {} } as any
        state.scanResource(resource)
        expect(Object.keys(state.scanResults)).toHaveLength(1)
        state.clearScanResults()
        expect(state.scanResults).toEqual({})
    })
})

describe('analysisSlice — scanSecurity', () => {
    it('sets securityScanning to false after completion', async () => {
        windowMock.kubectl.scanSecurity = vi.fn().mockResolvedValue(null)
        windowMock.kubectl.scanKubesecBatch = vi.fn().mockResolvedValue([])
        const { state } = makeSlice()
        await state.scanSecurity()
        expect(state.securityScanning).toBe(false)
    })

    it('sets trivyAvailable=true when trivy scan returns data', async () => {
        windowMock.kubectl.scanSecurity = vi.fn().mockResolvedValue({ Results: [] })
        windowMock.kubectl.scanKubesecBatch = vi.fn().mockResolvedValue([])
        const { state } = makeSlice()
        await state.scanSecurity()
        expect(state.trivyAvailable).toBe(true)
    })

    it('sets trivyAvailable=false when error contains trivy_not_found', async () => {
        windowMock.kubectl.scanSecurity = vi.fn().mockRejectedValue(new Error('trivy_not_found'))
        windowMock.kubectl.scanKubesecBatch = vi.fn().mockResolvedValue([])
        const { state } = makeSlice()
        await state.scanSecurity()
        expect(state.trivyAvailable).toBe(false)
        expect(state.securityScanning).toBe(false)
    })

    it('sets trivyAvailable=false when error contains "trivy binary not found"', async () => {
        windowMock.kubectl.scanSecurity = vi.fn().mockRejectedValue(new Error('trivy binary not found'))
        windowMock.kubectl.scanKubesecBatch = vi.fn().mockResolvedValue([])
        const { state } = makeSlice()
        await state.scanSecurity()
        expect(state.trivyAvailable).toBe(false)
    })

    it('sets error and trivyAvailable=null on non-trivy scan failure', async () => {
        windowMock.kubectl.scanSecurity = vi.fn().mockRejectedValue(new Error('permission denied'))
        windowMock.kubectl.scanKubesecBatch = vi.fn().mockResolvedValue([])
        const { state } = makeSlice()
        await state.scanSecurity()
        expect(state.error).toMatch(/Image scan failed/)
        expect(state.trivyAvailable).toBeNull()
    })

    it('builds kubesecBatchResults map keyed by namespace/name/kind', async () => {
        // Use a Deployment — Pods are excluded from default scans to avoid duplicates.
        const dep = { metadata: { uid: 'u1', name: 'web', namespace: 'default' }, kind: 'Deployment' } as any
        windowMock.kubectl.scanSecurity = vi.fn().mockResolvedValue(null)
        windowMock.kubectl.scanKubesecBatch = vi.fn().mockResolvedValue([{ score: 4 }])
        const { state } = makeSlice({ deployments: [dep] })
        await state.scanSecurity()
        expect(state.kubesecBatchResults).not.toBeNull()
        expect(state.kubesecBatchResults['default/web/Deployment']).toEqual({ score: 4 })
    })

    it('filters workloads by namespace when options.namespaces is provided', async () => {
        const scanKubesecBatch = vi.fn().mockResolvedValue([])
        const dep1 = { metadata: { uid: 'u1', name: 'a', namespace: 'default' }, kind: 'Deployment' } as any
        const dep2 = { metadata: { uid: 'u2', name: 'b', namespace: 'kube-system' }, kind: 'Deployment' } as any
        windowMock.kubectl.scanSecurity = vi.fn().mockResolvedValue(null)
        windowMock.kubectl.scanKubesecBatch = scanKubesecBatch
        const { state } = makeSlice({ deployments: [dep1, dep2] })
        await state.scanSecurity({ namespaces: ['default'], kinds: [], runTrivy: false, runKubesec: true })
        expect(scanKubesecBatch).toHaveBeenCalledWith([dep1])
    })

    it('filters workloads by kind when options.kinds is provided', async () => {
        const scanKubesecBatch = vi.fn().mockResolvedValue([])
        const pod = { metadata: { uid: 'u1', name: 'a', namespace: 'default' }, kind: 'Pod' } as any
        const dep = { metadata: { uid: 'u2', name: 'b', namespace: 'default' }, kind: 'Deployment' } as any
        windowMock.kubectl.scanSecurity = vi.fn().mockResolvedValue(null)
        windowMock.kubectl.scanKubesecBatch = scanKubesecBatch
        const { state } = makeSlice({ pods: [pod], deployments: [dep] })
        await state.scanSecurity({ namespaces: [], kinds: ['Deployment'], runTrivy: false, runKubesec: true })
        expect(scanKubesecBatch).toHaveBeenCalledWith([dep])
    })

    it('calls onSecurityProgress and unsubscribes after scan', async () => {
        const unsub = vi.fn()
        windowMock.kubectl.onSecurityProgress = vi.fn().mockReturnValue(unsub)
        windowMock.kubectl.scanSecurity = vi.fn().mockResolvedValue(null)
        windowMock.kubectl.scanKubesecBatch = vi.fn().mockResolvedValue([])
        const { state } = makeSlice()
        await state.scanSecurity()
        expect(windowMock.kubectl.onSecurityProgress).toHaveBeenCalled()
        expect(unsub).toHaveBeenCalled()
    })

    it('unsubscribes from progress even when scan throws', async () => {
        const unsub = vi.fn()
        windowMock.kubectl.onSecurityProgress = vi.fn().mockReturnValue(unsub)
        windowMock.kubectl.scanSecurity = vi.fn().mockRejectedValue(new Error('network error'))
        windowMock.kubectl.scanKubesecBatch = vi.fn().mockRejectedValue(new Error('network error'))
        const { state } = makeSlice()
        // scanSecurity catches errors internally via Promise.allSettled, so shouldn't throw
        await state.scanSecurity()
        expect(unsub).toHaveBeenCalled()
    })
})
