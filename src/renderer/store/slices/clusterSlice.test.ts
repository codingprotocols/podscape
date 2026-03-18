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
            fetchProviders: vi.fn(),
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
        windowMock.kubectl.switchContext.mockResolvedValue(undefined)
        windowMock.kubectl.getNamespaces.mockImplementation(() => new Promise(() => { })) // Never resolves

        const slice = createClusterSlice(set, get, {} as any)
        const promise = slice.selectContext('my-ctx')

        vi.advanceTimersByTime(15001)

        await expect(promise).resolves.toBeUndefined() // It catches internally and sets error
        expect(set).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.stringContaining('did not respond in time'),
            loadingNamespaces: false,
        }))
    })

    it('selectNamespace updates state and calls loadSection', () => {
        const slice = createClusterSlice(set, get, {} as any)
        slice.selectNamespace('myns')

        expect(set).toHaveBeenCalledWith({ selectedNamespace: 'myns', selectedResource: null })
        expect(state.loadSection).toHaveBeenCalledWith('pods')
    })

    // ── Rollback tests ────────────────────────────────────────────────────────

    it('selectContext rolls back to previous context when getNamespaces fails', async () => {
        const previousCtx = 'prev-ctx'
        state.selectedContext = previousCtx
        state.prodContexts = []
        windowMock.kubectl.switchContext
            .mockResolvedValueOnce(undefined)  // forward switch succeeds
            .mockResolvedValueOnce(undefined)  // rollback switch
        windowMock.kubectl.getNamespaces.mockRejectedValue(new Error('connection refused'))

        const slice = createClusterSlice(set, get, {} as any)
        await slice.selectContext('bad-ctx')

        // Store should be restored to the previous context
        expect(state.selectedContext).toBe(previousCtx)
        // Error message should be set
        expect(set).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.stringContaining('bad-ctx'),
            loadingNamespaces: false,
            contextSwitchStatus: null,
        }))
        // Rollback switchContext must have been called
        expect(windowMock.kubectl.switchContext).toHaveBeenCalledWith(previousCtx)
    })

    it('selectContext clears contextSwitchStatus on success', async () => {
        windowMock.kubectl.switchContext.mockResolvedValue(undefined)
        windowMock.kubectl.getNamespaces.mockResolvedValue([{ name: 'ns1' }])
        state.preloadSearchResources = vi.fn()

        const slice = createClusterSlice(set, get, {} as any)
        await slice.selectContext('ok-ctx')

        expect(set).toHaveBeenCalledWith(expect.objectContaining({
            loadingNamespaces: false,
            contextSwitchStatus: null,
        }))
    })

    it('selectContext clears contextSwitchStatus on failure', async () => {
        windowMock.kubectl.switchContext.mockResolvedValue(undefined)
        windowMock.kubectl.getNamespaces.mockRejectedValue(new Error('unreachable'))

        const slice = createClusterSlice(set, get, {} as any)
        await slice.selectContext('bad-ctx')

        expect(set).toHaveBeenCalledWith(expect.objectContaining({
            contextSwitchStatus: null,
            loadingNamespaces: false,
        }))
    })

    // ── probePrometheus stale-context guard ───────────────────────────────────

    it('probePrometheus discards result when context switches mid-probe', async () => {
        // Deferred promise so we can control when prometheusStatus resolves
        let resolveProbe: ((v: { available: boolean }) => void) | undefined
        const probePromise = new Promise<{ available: boolean }>(r => { resolveProbe = r })
        windowMock.kubectl.prometheusStatus.mockReturnValue(probePromise)
        // settings.get needed by probePrometheus to look up URL
        windowMock.settings.get.mockResolvedValue({
            shellPath: '', theme: 'dark', kubeconfigPath: '', prodContexts: [], prometheusUrls: {},
        })

        state.selectedContext = 'ctx-a'
        state.prometheusAvailable = null

        const slice = createClusterSlice(set, get, {} as any)
        const probe = slice.probePrometheus()

        // Context switches away before probe resolves
        state.selectedContext = 'ctx-b'

        // Resolve the in-flight probe with available=true
        resolveProbe!({ available: true })
        await probe

        // prometheusAvailable must NOT have been updated — stale result discarded
        expect(state.prometheusAvailable).toBeNull()
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

    // ── Provider section navigation on context switch ─────────────────────────

    it('navigates away from traefik provider section on context switch', async () => {
        state.section = 'traefik-ingressroutes'
        windowMock.kubectl.switchContext.mockResolvedValue(undefined)
        windowMock.kubectl.getNamespaces.mockResolvedValue([{ name: 'ns1' }])
        state.preloadSearchResources = vi.fn()

        const slice = createClusterSlice(set, get, {} as any)
        await slice.selectContext('new-ctx')

        // The first set call (state reset) should include section: 'dashboard'
        const firstSetCall = set.mock.calls[0][0]
        expect(firstSetCall).toMatchObject({ section: 'dashboard' })
    })

    it('does NOT navigate away from non-provider section on context switch', async () => {
        state.section = 'pods'
        windowMock.kubectl.switchContext.mockResolvedValue(undefined)
        windowMock.kubectl.getNamespaces.mockResolvedValue([{ name: 'ns1' }])
        state.preloadSearchResources = vi.fn()

        const slice = createClusterSlice(set, get, {} as any)
        await slice.selectContext('new-ctx')

        // The first set call (state reset) must NOT include a section key
        const firstSetCall = set.mock.calls[0][0]
        expect(firstSetCall).not.toHaveProperty('section')
    })

    it('navigates away from istio section on context switch', async () => {
        state.section = 'istio-virtualservices'
        windowMock.kubectl.switchContext.mockResolvedValue(undefined)
        windowMock.kubectl.getNamespaces.mockResolvedValue([{ name: 'ns1' }])
        state.preloadSearchResources = vi.fn()

        const slice = createClusterSlice(set, get, {} as any)
        await slice.selectContext('new-ctx')

        const firstSetCall = set.mock.calls[0][0]
        expect(firstSetCall).toMatchObject({ section: 'dashboard' })
    })

    it('navigates away from nginx section on context switch', async () => {
        state.section = 'nginx-virtualservers'
        windowMock.kubectl.switchContext.mockResolvedValue(undefined)
        windowMock.kubectl.getNamespaces.mockResolvedValue([{ name: 'ns1' }])
        state.preloadSearchResources = vi.fn()

        const slice = createClusterSlice(set, get, {} as any)
        await slice.selectContext('new-ctx')

        const firstSetCall = set.mock.calls[0][0]
        expect(firstSetCall).toMatchObject({ section: 'dashboard' })
    })
})
