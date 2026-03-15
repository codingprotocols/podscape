import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClusterSlice } from './clusterSlice'
import { setupMocks } from './test-utils'

const { localStorageMock, windowMock } = setupMocks()

describe('clusterSlice', () => {
    let set: any
    let get: any
    let state: any

    beforeEach(() => {
        state = {
            section: 'pods',
            selectedContext: null,
            loadSection: vi.fn(),
            hotbarContexts: [],
            prodContexts: [],
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
        localStorageMock.clear()
        vi.clearAllMocks()
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('initializes hotbar from localStorage', () => {
        localStorageMock.setItem('podscape:hotbar', JSON.stringify(['ctx1', 'ctx2']))
        const slice = createClusterSlice(set, get, {} as any)
        expect(slice.hotbarContexts).toEqual(['ctx1', 'ctx2'])
    })

    it('toggleHotbarContext adds and removes contexts', () => {
        const slice = createClusterSlice(set, get, {} as any)

        // Add
        slice.toggleHotbarContext('ctx1')
        expect(set).toHaveBeenCalledWith({ hotbarContexts: ['ctx1'] })
        expect(localStorageMock.setItem).toHaveBeenCalledWith('podscape:hotbar', JSON.stringify(['ctx1']))

        // Remove
        state.hotbarContexts = ['ctx1']
        slice.toggleHotbarContext('ctx1')
        expect(set).toHaveBeenCalledWith({ hotbarContexts: [] })
    })

    it('selectContext updates state and fetches namespaces', async () => {
        const namespaces = [{ name: 'ns1' }]
        windowMock.kubectl.switchContext.mockResolvedValue(undefined)
        windowMock.kubectl.getNamespaces.mockResolvedValue(namespaces)
        state.preloadSearchResources = vi.fn()

        const slice = createClusterSlice(set, get, {} as any)
        const promise = slice.selectContext('my-ctx')

        // First set call clears state and sets loadingNamespaces: true
        expect(set).toHaveBeenCalledWith(expect.objectContaining({
            selectedContext: 'my-ctx',
            loadingNamespaces: true,
        }))

        await promise

        // Namespaces arrive in a second set call
        expect(set).toHaveBeenCalledWith(expect.objectContaining({
            namespaces,
            selectedNamespace: '_all',
        }))
        // Loading clears in a third set call
        expect(set).toHaveBeenCalledWith(expect.objectContaining({
            loadingNamespaces: false,
        }))
        expect(state.loadSection).toHaveBeenCalledWith('pods')
    })

    it('selectContext handles timeout', async () => {
        windowMock.kubectl.getNamespaces.mockImplementation(() => new Promise(() => { })) // Never resolves

        const slice = createClusterSlice(set, get, {} as any)
        const promise = slice.selectContext('my-ctx')

        vi.advanceTimersByTime(30001)

        await expect(promise).resolves.toBeUndefined() // It catches internally and sets error
        expect(set).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.stringContaining('timed out'),
            loadingNamespaces: false,
        }))
    })

    it('selectNamespace updates state and calls loadSection', () => {
        const slice = createClusterSlice(set, get, {} as any)
        slice.selectNamespace('myns')

        expect(set).toHaveBeenCalledWith({ selectedNamespace: 'myns', selectedResource: null })
        expect(state.loadSection).toHaveBeenCalledWith('pods')
    })

    // ── Race condition test (Issue 11A) ────────────────────────────────────────

    it('concurrent selectContext: stale first call is discarded when second wins', async () => {
        // First call's switchContext hangs; second call completes immediately.
        // When the first call is unblocked it should bail out via the seq guard.
        let releaseFirstSwitch!: () => void
        windowMock.kubectl.switchContext
            .mockImplementationOnce(() => new Promise<void>(r => { releaseFirstSwitch = r }))
            .mockResolvedValueOnce(undefined)

        const nsB = [{ name: 'ns-b' }]
        windowMock.kubectl.getNamespaces.mockResolvedValue(nsB)
        state.preloadSearchResources = vi.fn()

        const slice = createClusterSlice(set, get, {} as any)

        const p1 = slice.selectContext('ctx-a')  // hangs at switchContext
        const p2 = slice.selectContext('ctx-b')  // completes immediately

        await p2  // second call fully completes

        releaseFirstSwitch()  // unblock first call — seq guard should stop it
        await p1

        // Second call's namespace data wins; loadSection called exactly once
        expect(state.namespaces).toEqual(nsB)
        expect(state.loadSection).toHaveBeenCalledTimes(1)
        expect(state.loadSection).toHaveBeenCalledWith(state.section)
    })
})
