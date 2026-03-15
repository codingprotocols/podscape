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
})
