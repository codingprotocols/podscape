import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createResourceSlice } from './resourceSlice'
import { setupMocks } from './test-utils'

const { windowMock } = setupMocks()

describe('resourceSlice', () => {
    let set: any
    let get: any
    let state: any

    beforeEach(() => {
        state = {
            section: 'pods',
            selectedContext: 'ctx1',
            selectedNamespace: 'ns1',
            loadDashboard: vi.fn(),
            loadSection: vi.fn(), // Needed for refresh
            // Required by loadDashboard's AppGroup computation
            deployments: [], statefulsets: [], daemonsets: [],
            services: [], configmaps: [], hpas: [],
        }
        set = vi.fn((update: any) => {
            if (typeof update === 'function') {
                const next = update(state)
                Object.assign(state, next)
            } else {
                Object.assign(state, update)
            }
        })
        get = vi.fn(() => state)
        vi.clearAllMocks()
    })

    it('loadSection calls loadDashboard for dashboard section', async () => {
        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadSection('dashboard')
        expect(state.loadDashboard).toHaveBeenCalled()
    })

    it('loadSection fetches pods for pods section', async () => {
        const pods = [{ metadata: { name: 'pod1' } }]
        windowMock.kubectl.getPods.mockResolvedValue(pods)

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadSection('pods')

        expect(windowMock.kubectl.getPods).toHaveBeenCalledWith('ctx1', 'ns1')
        // loadSection now combines pods + loadingResources in one set call
        expect(set).toHaveBeenCalledWith(expect.objectContaining({ pods }))
        expect(state.pods).toEqual(pods)
    })

    it('loadSection handles errors', async () => {
        windowMock.kubectl.getPods.mockRejectedValue(new Error('Kube error'))

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadSection('pods')

        // loadSection now combines error + loadingResources in one set call
        expect(set).toHaveBeenCalledWith(expect.objectContaining({ error: 'Kube error' }))
    })

    it('loadDashboard fetches multiple resources', async () => {
        windowMock.kubectl.getNodes.mockResolvedValue([{ name: 'node1' }])
        windowMock.kubectl.getPods.mockResolvedValue([])
        windowMock.kubectl.getDeployments.mockResolvedValue([])
        windowMock.kubectl.getNamespaces.mockResolvedValue([])
        windowMock.kubectl.getNodeMetrics.mockResolvedValue([])
        windowMock.kubectl.getEvents.mockResolvedValue([])

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadDashboard()

        expect(windowMock.kubectl.getNodes).toHaveBeenCalled()
        expect(windowMock.kubectl.getPods).toHaveBeenCalled()
        expect(set).toHaveBeenCalledWith(expect.objectContaining({ loadingResources: false }))
    })

    it('refresh calls loadSection with current section', () => {
        state.section = 'deployments'
        const slice = createResourceSlice(set, get, {} as any)
        slice.refresh()
        expect(state.loadSection).toHaveBeenCalledWith('deployments')
    })

    it('loadDashboard sets error and loadingResources=false when getNodes fails', async () => {
        windowMock.kubectl.getNodes.mockRejectedValue(new Error('nodes unreachable'))
        windowMock.kubectl.getNodeMetrics.mockResolvedValue([])
        windowMock.kubectl.getNamespaces.mockResolvedValue([])
        windowMock.kubectl.getEvents.mockResolvedValue([])
        windowMock.kubectl.getPods.mockResolvedValue([])
        windowMock.kubectl.getDeployments.mockResolvedValue([])

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadDashboard()

        expect(state.error).toBe('nodes unreachable')
        expect(state.loadingResources).toBe(false)
    })

    it('loadDashboard retains only the first error when multiple fetches fail', async () => {
        windowMock.kubectl.getNodes.mockRejectedValue(new Error('first error'))
        windowMock.kubectl.getNodeMetrics.mockResolvedValue([])
        windowMock.kubectl.getNamespaces.mockRejectedValue(new Error('second error'))
        windowMock.kubectl.getEvents.mockResolvedValue([])
        windowMock.kubectl.getPods.mockResolvedValue([])
        windowMock.kubectl.getDeployments.mockResolvedValue([])

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadDashboard()

        expect(state.error).toBe('first error')
        expect(state.loadingResources).toBe(false)
    })

    // ── SECTION_CONFIG path tests (Issue 10A) ──────────────────────────────────

    it('loadSection: cluster-scoped section (nodes) ignores namespace', async () => {
        const nodes = [{ metadata: { name: 'node1' } }]
        windowMock.kubectl.getNodes.mockResolvedValue(nodes)
        state.selectedNamespace = 'some-ns' // should be ignored for cluster-scoped

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadSection('nodes')

        // Cluster-scoped fetch receives only the context — no namespace argument
        expect(windowMock.kubectl.getNodes).toHaveBeenCalledWith('ctx1')
        expect(set).toHaveBeenCalledWith(expect.objectContaining({ nodes }))
    })

    it('loadSection: namespaced section with no namespace clears state without fetching', async () => {
        state.selectedNamespace = null

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadSection('pods')

        expect(windowMock.kubectl.getPods).not.toHaveBeenCalled()
        expect(set).toHaveBeenCalledWith(expect.objectContaining({ pods: [] }))
    })

    it('loadSection: selectedNamespace="_all" passes null to fetch', async () => {
        state.selectedNamespace = '_all'
        windowMock.kubectl.getPods.mockResolvedValue([])

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadSection('pods')

        // _all means "all namespaces" — translated to null before the API call
        expect(windowMock.kubectl.getPods).toHaveBeenCalledWith('ctx1', null)
    })

    // ── scanSecurity ──────────────────────────────────────────────────────────

    describe('scanSecurity', () => {
        beforeEach(() => {
            state.pods = []
            state.deployments = []
            state.statefulsets = []
            state.daemonsets = []
            state.jobs = []
            state.cronjobs = []
        })

        it('sets trivyAvailable=false when trivy_not_found error, no error toast', async () => {
            windowMock.kubectl.scanSecurity.mockRejectedValue(
                new Error('503: {"error":"trivy_not_found","message":"trivy not found"}')
            )
            windowMock.kubectl.scanKubesecBatch.mockResolvedValue([])

            const slice = createResourceSlice(set, get, {} as any)
            await slice.scanSecurity()

            expect(state.trivyAvailable).toBe(false)
            expect(state.error).toBeNull()
            expect(state.securityScanning).toBe(false)
        })

        it('sets trivyAvailable=true and stores results when trivy scan succeeds', async () => {
            const fakeResults = { Resources: [{ Name: 'pod-a', Namespace: 'default', Kind: 'Pod', Results: [] }] }
            windowMock.kubectl.scanSecurity.mockResolvedValue(fakeResults)
            windowMock.kubectl.scanKubesecBatch.mockResolvedValue([])

            const slice = createResourceSlice(set, get, {} as any)
            await slice.scanSecurity()

            expect(state.trivyAvailable).toBe(true)
            expect(state.securityScanResults).toEqual(fakeResults)
            expect(state.securityScanning).toBe(false)
        })

        it('sets error string when trivy fails with a non-trivy_not_found error', async () => {
            windowMock.kubectl.scanSecurity.mockRejectedValue(new Error('network timeout'))
            windowMock.kubectl.scanKubesecBatch.mockResolvedValue([])

            const slice = createResourceSlice(set, get, {} as any)
            await slice.scanSecurity()

            expect(state.error).toContain('network timeout')
            expect(state.trivyAvailable).toBeNull()
        })

        it('builds kubesecBatchResults map with "namespace/name/kind" keys matching SecurityHub lookup', async () => {
            windowMock.kubectl.scanSecurity.mockResolvedValue({ Resources: [] })
            const batchResults = [
                { score: 5, issues: [{ id: 'A', reason: 'r', selector: 's', points: 3 }] },
                { score: 2, issues: [] },
            ]
            windowMock.kubectl.scanKubesecBatch.mockResolvedValue(batchResults)

            state.pods = [
                { metadata: { name: 'pod-a', namespace: 'ns1', uid: '1', creationTimestamp: '', labels: {} }, kind: 'Pod', apiVersion: 'v1', spec: {}, status: {} },
                { metadata: { name: 'pod-b', namespace: 'ns2', uid: '2', creationTimestamp: '', labels: {} }, kind: 'Pod', apiVersion: 'v1', spec: {}, status: {} },
            ]

            const slice = createResourceSlice(set, get, {} as any)
            await slice.scanSecurity()

            expect(state.kubesecBatchResults?.['ns1/pod-a/Pod']).toEqual(batchResults[0])
            expect(state.kubesecBatchResults?.['ns2/pod-b/Pod']).toEqual(batchResults[1])
        })

        it('sets kubesecBatchResults=null and clears securityScanning when kubesec fails', async () => {
            windowMock.kubectl.scanSecurity.mockResolvedValue({ Resources: [] })
            windowMock.kubectl.scanKubesecBatch.mockRejectedValue(new Error('kubesec error'))

            const slice = createResourceSlice(set, get, {} as any)
            await slice.scanSecurity()

            expect(state.kubesecBatchResults).toBeNull()
            expect(state.securityScanning).toBe(false)
        })
    })
})
