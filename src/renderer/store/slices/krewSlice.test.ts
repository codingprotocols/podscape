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
    })

    it('probeKrew sets krewAvailable false when not detected', async () => {
        windowMock.krew.detect.mockResolvedValue({ available: false, unsupported: false })
        const { slice, state } = makeSlice()
        await slice.probeKrew()
        expect(state.krewAvailable).toBe(false)
    })

    it('probeKrew sets krewAvailable false on IPC error', async () => {
        windowMock.krew.detect.mockRejectedValue(new Error('ipc failed'))
        const { slice, state } = makeSlice()
        await slice.probeKrew()
        expect(state.krewAvailable).toBe(false)
    })

    it('loadPluginIndex populates pluginIndex and sets indexLastUpdated', async () => {
        const plugins = [{ name: 'ctx', version: '0.9.5', short: 'Switch contexts' }]
        windowMock.krew.search.mockResolvedValue(plugins)
        windowMock.krew.installed.mockResolvedValue([])
        const { slice, state } = makeSlice()
        await slice.loadPluginIndex()
        expect(state.pluginIndex).toHaveLength(1)
        expect(state.pluginIndex[0].name).toBe('ctx')
        expect(state.indexLastUpdated).toBeTypeOf('number')
    })

    it('loadPluginIndex marks installed plugins', async () => {
        windowMock.krew.search.mockResolvedValue([
            { name: 'ctx', version: '0.9.5', short: 'Switch contexts' },
            { name: 'ns', version: '0.9.1', short: 'Switch namespaces' },
        ])
        windowMock.krew.installed.mockResolvedValue(['ctx'])
        const { slice, state } = makeSlice()
        await slice.loadPluginIndex()
        const ctx = state.pluginIndex.find((p: any) => p.name === 'ctx')
        const ns = state.pluginIndex.find((p: any) => p.name === 'ns')
        expect(ctx.installed).toBe(true)
        expect(ns.installed).toBe(false)
    })

    it('refreshIndexIfStale triggers refresh when cache is older than 24h', async () => {
        windowMock.krew.update.mockResolvedValue({ ok: true })
        windowMock.krew.search.mockResolvedValue([])
        windowMock.krew.installed.mockResolvedValue([])
        const { slice, state } = makeSlice()
        state.indexLastUpdated = Date.now() - TWENTY_FIVE_HOURS_MS
        await slice.refreshIndexIfStale()
        expect(windowMock.krew.update).toHaveBeenCalled()
    })

    it('refreshIndexIfStale does NOT trigger refresh when cache is fresh', async () => {
        windowMock.krew.update.mockResolvedValue({ ok: true })
        const { slice, state } = makeSlice()
        state.indexLastUpdated = Date.now() - 1000
        await slice.refreshIndexIfStale()
        expect(windowMock.krew.update).not.toHaveBeenCalled()
    })

    it('setSelectedPlugin updates selectedPlugin', () => {
        const { slice, state } = makeSlice()
        slice.setSelectedPlugin('ctx')
        expect(state.selectedPlugin).toBe('ctx')
    })
})
