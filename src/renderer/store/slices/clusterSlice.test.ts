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
        windowMock.kubectl.getNamespaces.mockResolvedValue(namespaces)

        const slice = createClusterSlice(set, get, {} as any)
        const promise = slice.selectContext('my-ctx')

        expect(set).toHaveBeenCalledWith(expect.objectContaining({
            selectedContext: 'my-ctx',
            loadingNamespaces: true,
        }))

        await promise

        expect(set).toHaveBeenCalledWith(expect.objectContaining({
            namespaces,
            selectedNamespace: '_all',
            loadingNamespaces: false,
        }))
        expect(state.loadSection).toHaveBeenCalledWith('pods')
    })

    it('selectContext handles timeout', async () => {
        windowMock.kubectl.getNamespaces.mockImplementation(() => new Promise(() => { })) // Never resolves

        const slice = createClusterSlice(set, get, {} as any)
        const promise = slice.selectContext('my-ctx')

        vi.advanceTimersByTime(8001)

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
})
