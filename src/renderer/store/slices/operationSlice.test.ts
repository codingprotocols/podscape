import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createOperationSlice } from './operationSlice'
import { setupMocks } from './test-utils'

const { windowMock } = setupMocks()

describe('operationSlice', () => {
    let set: any
    let get: any
    let state: any

    beforeEach(() => {
        state = {
            section: 'pods',
            selectedContext: 'ctx1',
            selectedNamespace: 'ns1',
            selectedResource: { metadata: { name: 'res1', namespace: 'ns1' } },
            loadSection: vi.fn(),
            portForwards: [],
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

    it('scaleDeployment calls kubectl scale and reloads section', async () => {
        const slice = createOperationSlice(set, get, {} as any)
        await slice.scaleDeployment('dep1', 3)

        expect(windowMock.kubectl.scale).toHaveBeenCalledWith('ctx1', 'ns1', 'dep1', 3)
        expect(state.loadSection).toHaveBeenCalledWith('deployments')
    })

    it('rolloutRestart calls kubectl rolloutRestart', async () => {
        const slice = createOperationSlice(set, get, {} as any)
        await slice.rolloutRestart('deployment', 'dep1')

        expect(windowMock.kubectl.rolloutRestart).toHaveBeenCalledWith('ctx1', 'ns1', 'deployment', 'dep1')
    })

    it('deleteResource calls kubectl deleteResource and clears selection', async () => {
        const slice = createOperationSlice(set, get, {} as any)
        await slice.deleteResource('pod', 'pod1')

        expect(windowMock.kubectl.deleteResource).toHaveBeenCalledWith('ctx1', 'ns1', 'pod', 'pod1')
        expect(set).toHaveBeenCalledWith({ selectedResource: null })
        expect(state.loadSection).toHaveBeenCalledWith('pods')
    })

    it('applyYAML calls kubectl applyYAML', async () => {
        windowMock.kubectl.applyYAML.mockResolvedValue('applied')
        const slice = createOperationSlice(set, get, {} as any)
        const res = await slice.applyYAML('some yaml')

        expect(windowMock.kubectl.applyYAML).toHaveBeenCalledWith('ctx1', 'some yaml')
        expect(res).toBe('applied')
    })

    it('startPortForward adds entry and calls kubectl portForward', () => {
        const entry = { id: 'pf1', name: 'p1', namespace: 'ns1', type: 'pod', localPort: 8080, remotePort: 80 }
        const slice = createOperationSlice(set, get, {} as any)
        slice.startPortForward(entry as any)

        expect(state.portForwards).toContain(entry)
        expect(windowMock.kubectl.portForward).toHaveBeenCalledWith('ctx1', 'ns1', 'pod', 'p1', 8080, 80, 'pf1')
    })
})
