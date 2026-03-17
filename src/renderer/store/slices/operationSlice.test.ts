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

    it('startPortForward registers all three IPC listeners', () => {
        const entry = { id: 'pf2', name: 'p2', namespace: 'ns1', type: 'pod', localPort: 9090, remotePort: 90 }
        const slice = createOperationSlice(set, get, {} as any)
        slice.startPortForward(entry as any)

        expect(windowMock.kubectl.onPortForwardReady).toHaveBeenCalledWith('pf2', expect.any(Function))
        expect(windowMock.kubectl.onPortForwardError).toHaveBeenCalledWith('pf2', expect.any(Function))
        expect(windowMock.kubectl.onPortForwardExit).toHaveBeenCalledWith('pf2', expect.any(Function))
    })

    it('stopPortForward calls all three unsubscribers and removes entry', () => {
        const unsubReady = vi.fn()
        const unsubError = vi.fn()
        const unsubExit = vi.fn()
        windowMock.kubectl.onPortForwardReady.mockReturnValueOnce(unsubReady)
        windowMock.kubectl.onPortForwardError.mockReturnValueOnce(unsubError)
        windowMock.kubectl.onPortForwardExit.mockReturnValueOnce(unsubExit)

        const entry = { id: 'pf3', name: 'p3', namespace: 'ns1', type: 'pod', localPort: 7070, remotePort: 70 }
        state.portForwards = [entry]
        const slice = createOperationSlice(set, get, {} as any)
        slice.startPortForward(entry as any)
        slice.stopPortForward('pf3')

        expect(unsubReady).toHaveBeenCalledTimes(1)
        expect(unsubError).toHaveBeenCalledTimes(1)
        expect(unsubExit).toHaveBeenCalledTimes(1)
        expect(windowMock.kubectl.stopPortForward).toHaveBeenCalledWith('pf3')
        expect(state.portForwards.find((f: any) => f.id === 'pf3')).toBeUndefined()
    })

    it('onPortForwardReady callback updates entry status to active', () => {
        let readyCb: (() => void) | undefined
        windowMock.kubectl.onPortForwardReady.mockImplementationOnce((_id: string, cb: () => void) => {
            readyCb = cb
            return vi.fn()
        })

        const entry = { id: 'pf4', name: 'p4', namespace: 'ns1', type: 'pod', localPort: 6060, remotePort: 60, status: 'starting' }
        state.portForwards = [entry]
        const slice = createOperationSlice(set, get, {} as any)
        slice.startPortForward(entry as any)

        readyCb!()
        const updated = state.portForwards.find((f: any) => f.id === 'pf4')
        expect(updated?.status).toBe('active')
    })

    // ── Error / rejection paths ───────────────────────────────────────────────

    it('scaleDeployment propagates kubectl error without corrupting store', async () => {
        windowMock.kubectl.scale.mockRejectedValue(new Error('scale failed'))
        const slice = createOperationSlice(set, get, {} as any)
        await expect(slice.scaleDeployment('dep1', 5)).rejects.toThrow('scale failed')
        // loadSection must NOT have been called — caller handles error display
        expect(state.loadSection).not.toHaveBeenCalled()
    })

    it('rolloutRestart propagates kubectl error', async () => {
        windowMock.kubectl.rolloutRestart.mockRejectedValue(new Error('rollout error'))
        const slice = createOperationSlice(set, get, {} as any)
        await expect(slice.rolloutRestart('deployment', 'dep1')).rejects.toThrow('rollout error')
    })

    it('deleteResource propagates kubectl error and does not clear selectedResource', async () => {
        windowMock.kubectl.deleteResource.mockRejectedValue(new Error('delete error'))
        const slice = createOperationSlice(set, get, {} as any)
        await expect(slice.deleteResource('pod', 'pod1')).rejects.toThrow('delete error')
        // selectedResource must not have been cleared — the resource still exists
        expect(set).not.toHaveBeenCalledWith({ selectedResource: null })
        expect(state.loadSection).not.toHaveBeenCalled()
    })

    it('onPortForwardExit callback removes entry and cleans up unsubscribers', () => {
        let exitCb: (() => void) | undefined
        windowMock.kubectl.onPortForwardExit.mockImplementationOnce((_id: string, cb: () => void) => {
            exitCb = cb
            return vi.fn()
        })

        const entry = { id: 'pf5', name: 'p5', namespace: 'ns1', type: 'pod', localPort: 5050, remotePort: 50, status: 'active' }
        state.portForwards = [entry]
        const slice = createOperationSlice(set, get, {} as any)
        slice.startPortForward(entry as any)

        exitCb!()
        expect(state.portForwards.find((f: any) => f.id === 'pf5')).toBeUndefined()
        // After exit cleans up, stopPortForward should not call stale unsubscribers
        const unsubReady = windowMock.kubectl.onPortForwardReady.mock.results.at(-1)?.value
        expect(unsubReady).toBeDefined()
    })
})
