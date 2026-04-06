import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createCostSlice } from './costSlice'
import { setupMocks } from './test-utils'

const { windowMock } = setupMocks()

function makeSlice() {
    const state: any = { selectedContext: 'ctx1' }
    const set = vi.fn((up: any) => {
        if (typeof up === 'function') Object.assign(state, up(state))
        else Object.assign(state, up)
    })
    const get = vi.fn(() => state)
    return { slice: createCostSlice(set, get, {} as any), state }
}

describe('costSlice', () => {
    beforeEach(() => { vi.clearAllMocks() })

    it('probeCost sets costAvailable true and stores provider when tool detected', async () => {
        windowMock.kubectl.costStatus.mockResolvedValue({ available: true, provider: 'kubecost' })
        const { slice, state } = makeSlice()
        await slice.probeCost()
        expect(state.costAvailable).toBe(true)
        expect(state.costProvider).toBe('kubecost')
        expect(state.costError).toBeNull()
    })

    it('probeCost sets costAvailable true for opencost', async () => {
        windowMock.kubectl.costStatus.mockResolvedValue({ available: true, provider: 'opencost' })
        const { slice, state } = makeSlice()
        await slice.probeCost()
        expect(state.costAvailable).toBe(true)
        expect(state.costProvider).toBe('opencost')
    })

    it('probeCost sets costAvailable false when neither tool found', async () => {
        windowMock.kubectl.costStatus.mockResolvedValue({ available: false, provider: '' })
        const { slice, state } = makeSlice()
        await slice.probeCost()
        expect(state.costAvailable).toBe(false)
        expect(state.costProvider).toBe('')
    })

    it('probeCost sets costAvailable false on IPC throw', async () => {
        windowMock.kubectl.costStatus.mockRejectedValue(new Error('ipc failed'))
        const { slice, state } = makeSlice()
        await slice.probeCost()
        expect(state.costAvailable).toBe(false)
    })

    it('probeCost discards result when context changed mid-flight', async () => {
        let resolveFn: (v: any) => void
        windowMock.kubectl.costStatus.mockReturnValue(new Promise(r => { resolveFn = r }))
        const { slice, state } = makeSlice()
        const p = slice.probeCost()
        state.selectedContext = 'ctx2'
        resolveFn!({ available: true, provider: 'kubecost' })
        await p
        // costAvailable should not have been set — initial state has no costAvailable key
        expect(state.costAvailable).toBeUndefined()
    })

    it('probeCost skips when no selectedContext', async () => {
        const { slice, state } = makeSlice()
        state.selectedContext = null
        await slice.probeCost()
        expect(windowMock.kubectl.costStatus).not.toHaveBeenCalled()
    })

    it('loadCostAllocations populates costAllocations', async () => {
        const items = [{ name: 'default', totalCost: 3.45, cpuCost: 1.0, ramCost: 2.45 }]
        windowMock.kubectl.costAllocation.mockResolvedValue(items)
        const { slice, state } = makeSlice()
        state.costProvider = 'kubecost'
        await slice.loadCostAllocations('1d', 'namespace')
        expect(state.costAllocations).toEqual(items)
        expect(state.costLoading).toBe(false)
    })

    it('loadCostAllocations sets costError on failure', async () => {
        windowMock.kubectl.costAllocation.mockRejectedValue(new Error('bad gateway'))
        const { slice, state } = makeSlice()
        state.costProvider = 'kubecost'
        await slice.loadCostAllocations('1d', 'namespace')
        expect(state.costError).toBe('bad gateway')
        expect(state.costLoading).toBe(false)
    })
})
