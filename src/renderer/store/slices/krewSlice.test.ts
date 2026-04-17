import { vi, describe, it, expect, beforeEach } from 'vitest'
import { setupMocks } from './test-utils'

const { windowMock } = setupMocks()

import { createKrewSlice } from './krewSlice'

const TWENTY_FIVE_HOURS_MS = 25 * 60 * 60 * 1000

function makeSlice() {
    const state: any = {}
    const set = vi.fn((up: any) => {
        if (typeof up === 'function') Object.assign(state, up(state))
        else Object.assign(state, up)
    })
    const get = vi.fn(() => state)
    return { slice: (createKrewSlice as any)(set, get), state }
}

describe('krewSlice', () => {
    beforeEach(() => { vi.clearAllMocks() })

    it('probeKrew sets krewAvailable true when detected', async () => {
        windowMock.krew.detect.mockResolvedValue({ available: true, unsupported: false })
        const { slice, state } = makeSlice()
        await slice.probeKrew()
        expect(state.krewAvailable).toBe(true)
        expect(state.krewUnsupported).toBe(false)
    })

    it('probeKrew sets krewAvailable false when not detected', async () => {
        windowMock.krew.detect.mockResolvedValue({ available: false, unsupported: false })
        const { slice, state } = makeSlice()
        await slice.probeKrew()
        expect(state.krewAvailable).toBe(false)
        expect(state.krewUnsupported).toBe(false)
    })

    it('probeKrew sets krewUnsupported true on Windows', async () => {
        windowMock.krew.detect.mockResolvedValue({ available: false, unsupported: true })
        const { slice, state } = makeSlice()
        await slice.probeKrew()
        expect(state.krewAvailable).toBe(false)
        expect(state.krewUnsupported).toBe(true)
    })

    it('probeKrew sets krewAvailable false on IPC error', async () => {
        windowMock.krew.detect.mockRejectedValue(new Error('ipc failed'))
        const { slice, state } = makeSlice()
        await slice.probeKrew()
        expect(state.krewAvailable).toBe(false)
        expect(state.krewUnsupported).toBe(false)
    })

    it('loadPluginIndex populates pluginIndex with curated entries and sets indexLastUpdated', async () => {
        windowMock.krew.installed.mockResolvedValue([])
        const { slice, state } = makeSlice()
        await slice.loadPluginIndex()
        // curated list has entries — ctx should be present
        expect(state.pluginIndex.some((p: any) => p.name === 'ctx')).toBe(true)
        expect(state.indexLastUpdated).toBeTypeOf('number')
    })

    it('loadPluginIndex marks installed plugins from curated list', async () => {
        windowMock.krew.installed.mockResolvedValue(['ctx'])
        const { slice, state } = makeSlice()
        await slice.loadPluginIndex()
        const ctx = state.pluginIndex.find((p: any) => p.name === 'ctx')
        const ns = state.pluginIndex.find((p: any) => p.name === 'ns')
        expect(ctx.installed).toBe(true)
        expect(ns.installed).toBe(false)
    })

    it('loadPluginIndex includes non-curated installed plugins as stub entries', async () => {
        windowMock.krew.installed.mockResolvedValue(['unknown-plugin'])
        const { slice, state } = makeSlice()
        await slice.loadPluginIndex()
        const stub = state.pluginIndex.find((p: any) => p.name === 'unknown-plugin')
        expect(stub).toBeDefined()
        expect(stub.installed).toBe(true)
    })

    it('loadPluginIndex does not call window.krew.search', async () => {
        windowMock.krew.installed.mockResolvedValue([])
        const { slice } = makeSlice()
        await slice.loadPluginIndex()
        expect(windowMock.krew.search).not.toHaveBeenCalled()
    })

    it('loadPluginIndex sets indexRefreshing to false on error', async () => {
        windowMock.krew.installed.mockRejectedValue(new Error('network error'))
        const { slice, state } = makeSlice()
        state.indexRefreshing = true
        await slice.loadPluginIndex()
        expect(state.indexRefreshing).toBe(false)
    })

    it('refreshIndexIfStale triggers refresh when cache is older than 24h', async () => {
        windowMock.krew.installed.mockResolvedValue([])
        const { slice, state } = makeSlice()
        state.indexLastUpdated = Date.now() - TWENTY_FIVE_HOURS_MS
        await slice.refreshIndexIfStale()
        expect(windowMock.krew.installed).toHaveBeenCalled()
    })

    it('refreshIndexIfStale does NOT trigger refresh when cache is fresh', async () => {
        const { slice, state } = makeSlice()
        state.indexLastUpdated = Date.now() - 1000
        state.indexRefreshing = false
        await slice.refreshIndexIfStale()
        expect(windowMock.krew.installed).not.toHaveBeenCalled()
    })

    it('refreshIndexIfStale triggers refresh when indexLastUpdated is null (first boot)', async () => {
        windowMock.krew.installed.mockResolvedValue([])
        const { slice, state } = makeSlice()
        state.indexLastUpdated = null
        await slice.refreshIndexIfStale()
        expect(windowMock.krew.installed).toHaveBeenCalled()
    })

    it('refreshIndexIfStale does not call window.krew.update', async () => {
        windowMock.krew.installed.mockResolvedValue([])
        const { slice, state } = makeSlice()
        state.indexLastUpdated = Date.now() - TWENTY_FIVE_HOURS_MS
        await slice.refreshIndexIfStale()
        expect(windowMock.krew.update).not.toHaveBeenCalled()
    })

    it('setSelectedPlugin updates selectedPlugin', () => {
        const { slice, state } = makeSlice()
        slice.setSelectedPlugin('ctx')
        expect(state.selectedPlugin).toBe('ctx')
    })

    it('setSelectedPlugin accepts null', () => {
        const { slice, state } = makeSlice()
        slice.setSelectedPlugin('ctx')
        slice.setSelectedPlugin(null)
        expect(state.selectedPlugin).toBeNull()
    })

    it('upgradeAll delegates to window.krew.upgradeAll', async () => {
        windowMock.krew.upgradeAll.mockResolvedValue({ ok: true })
        const { slice } = makeSlice()
        const result = await slice.upgradeAll()
        expect(result).toEqual({ ok: true })
        expect(windowMock.krew.upgradeAll).toHaveBeenCalled()
    })
})
