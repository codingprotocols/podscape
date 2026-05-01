import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createProvidersSlice } from './providersSlice'
import { setupMocks } from './test-utils'

const { windowMock } = setupMocks()

describe('providersSlice', () => {
    let set: any
    let get: any
    let state: any

    beforeEach(() => {
        state = {
            selectedContext: 'ctx-a',
            providers: { istio: false, traefik: false, nginxInc: false, nginxCommunity: false, keda: false },
            providersLoading: false,
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

    it('fetchProviders does nothing when selectedContext is null', async () => {
        state.selectedContext = null
        const slice = (createProvidersSlice as any)(set, get)
        await slice.fetchProviders()
        expect(windowMock.kubectl.getProviders).not.toHaveBeenCalled()
        expect(set).not.toHaveBeenCalled()
    })

    it('fetchProviders sets providers on success', async () => {
        const mockProviders = {
            traefik: true,
            traefikVersion: 'v3',
            istio: false,
            nginxInc: false,
            nginxCommunity: false,
        }
        windowMock.kubectl.getProviders.mockResolvedValue(mockProviders)

        const slice = (createProvidersSlice as any)(set, get)
        await slice.fetchProviders()

        // First set call: providersLoading: true
        expect(set).toHaveBeenCalledWith({ providersLoading: true })
        // Second set call: providers + providersLoading: false
        expect(set).toHaveBeenCalledWith({ providers: mockProviders, providersLoading: false })
    })

    it('fetchProviders resets to defaults on error', async () => {
        windowMock.kubectl.getProviders.mockRejectedValue(new Error('network error'))

        const slice = (createProvidersSlice as any)(set, get)
        await slice.fetchProviders()

        // First set call: providersLoading: true
        expect(set).toHaveBeenCalledWith({ providersLoading: true })
        // Error path: reset to defaults
        expect(set).toHaveBeenCalledWith({
            providers: { istio: false, traefik: false, nginxInc: false, nginxCommunity: false, keda: false },
            providersLoading: false,
        })
    })

    it('stale-context guard: discards result when context switches mid-fetch', async () => {
        // Deferred promise so we control when getProviders resolves.
        let resolveProviders!: (v: any) => void
        const deferred = new Promise<any>(r => { resolveProviders = r })
        windowMock.kubectl.getProviders.mockReturnValue(deferred)

        state.selectedContext = 'ctx-a'

        const slice = (createProvidersSlice as any)(set, get)
        const fetchPromise = slice.fetchProviders()

        // Context switches away before getProviders resolves.
        state.selectedContext = 'ctx-b'

        // Resolve the in-flight fetch.
        resolveProviders({ traefik: true, istio: false, nginxInc: false, nginxCommunity: false })
        await fetchPromise

        // Only the initial { providersLoading: true } call should have happened.
        // The result should have been discarded due to the stale-context guard.
        expect(set).toHaveBeenCalledTimes(1)
        expect(set).toHaveBeenCalledWith({ providersLoading: true })
        // providers state must not have been updated.
        expect(state.providers).toEqual({ istio: false, traefik: false, nginxInc: false, nginxCommunity: false, keda: false })
    })
})
