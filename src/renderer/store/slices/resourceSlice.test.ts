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
        expect(set).toHaveBeenCalledWith({ pods })
        expect(state.pods).toEqual(pods)
    })

    it('loadSection handles errors', async () => {
        windowMock.kubectl.getPods.mockRejectedValue(new Error('Kube error'))

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadSection('pods')

        expect(set).toHaveBeenCalledWith({ error: 'Kube error' })
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
})
