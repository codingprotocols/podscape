import { vi, describe, it, expect, beforeEach } from 'vitest'

// The hook file imports useAppStore, which creates the Zustand store on module
// load and immediately calls localStorage.getItem. Mock the store module so
// the import doesn't trigger real store initialization in this unit-test
// environment (no DOM / no localStorage).
vi.mock('../store', () => ({ useAppStore: vi.fn() }))

import { _createYAMLEditorHandlers } from './useYAMLEditor'

describe('_createYAMLEditorHandlers', () => {
    let getYAML: ReturnType<typeof vi.fn>
    let applyYAML: ReturnType<typeof vi.fn>
    let refresh: ReturnType<typeof vi.fn>
    let state: { yaml: string | null; loading: boolean; error: string | null }
    let setState: { setYaml: ReturnType<typeof vi.fn>; setLoading: ReturnType<typeof vi.fn>; setError: ReturnType<typeof vi.fn> }

    beforeEach(() => {
        getYAML = vi.fn()
        applyYAML = vi.fn().mockResolvedValue('applied')
        refresh = vi.fn()
        state = { yaml: null, loading: false, error: null }
        setState = {
            setYaml: vi.fn(v => { state.yaml = v }),
            setLoading: vi.fn(v => { state.loading = v }),
            setError: vi.fn(v => { state.error = v }),
        }
    })

    // ── open ──────────────────────────────────────────────────────────────────

    it('open: fetches YAML and sets yaml state on success', async () => {
        const content = 'apiVersion: v1\nkind: Pod'
        getYAML.mockResolvedValue(content)

        const { open } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        await open('pod', 'my-pod', false, 'default')

        expect(getYAML).toHaveBeenCalledWith('pod', 'my-pod', false, 'default')
        expect(state.yaml).toBe(content)
        expect(state.loading).toBe(false)
        expect(state.error).toBeNull()
    })

    it('open: passes undefined namespace correctly for cluster-scoped resources', async () => {
        getYAML.mockResolvedValue('yaml')

        const { open } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        await open('node', 'my-node', true)

        expect(getYAML).toHaveBeenCalledWith('node', 'my-node', true, undefined)
    })

    it('open: clears previous yaml and error before fetching', async () => {
        state.yaml = 'old yaml'
        state.error = 'old error'
        getYAML.mockResolvedValue('new yaml')

        const { open } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        await open('pod', 'my-pod', false, 'ns')

        expect(setState.setYaml).toHaveBeenCalledWith(null)   // reset before fetch
        expect(setState.setError).toHaveBeenCalledWith(null)  // reset before fetch
        expect(state.yaml).toBe('new yaml')
    })

    it('open: sets loading true then false around the fetch', async () => {
        const loadingValues: boolean[] = []
        setState.setLoading = vi.fn(v => { loadingValues.push(v); state.loading = v })
        getYAML.mockResolvedValue('yaml')

        const { open } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        await open('pod', 'my-pod', false)

        expect(loadingValues).toEqual([true, false])
    })

    it('open: sets error state on failure with the Error message', async () => {
        getYAML.mockRejectedValue(new Error('connection refused'))

        const { open } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        await open('pod', 'my-pod', false, 'default')

        expect(state.error).toBe('connection refused')
        expect(state.yaml).toBeNull()
        expect(state.loading).toBe(false)
    })

    it('open: uses fallback message when thrown value has no .message property', async () => {
        getYAML.mockRejectedValue('plain string, not an Error')

        const { open } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        await open('pod', 'my-pod', false)

        expect(state.error).toBe('Failed to fetch YAML')
    })

    it('open: clears loading=false even when fetch throws', async () => {
        getYAML.mockRejectedValue(new Error('timeout'))

        const { open } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        await open('pod', 'my-pod', false)

        expect(state.loading).toBe(false)
    })

    // ── apply ─────────────────────────────────────────────────────────────────

    it('apply: calls applyYAML with the new YAML, then refresh, then closes', async () => {
        const newYaml = 'apiVersion: v1\nkind: Pod\n...'
        const { apply } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        await apply(newYaml)

        expect(applyYAML).toHaveBeenCalledWith(newYaml)
        expect(refresh).toHaveBeenCalled()
        expect(state.yaml).toBeNull()
    })

    it('apply: calls refresh after applyYAML resolves (order matters)', async () => {
        const order: string[] = []
        applyYAML.mockImplementation(async () => { order.push('apply') })
        refresh.mockImplementation(() => { order.push('refresh') })
        setState.setYaml = vi.fn(v => { order.push('close'); state.yaml = v })

        const { apply } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        await apply('some yaml')

        expect(order).toEqual(['apply', 'refresh', 'close'])
    })

    it('apply: propagates applyYAML errors to the caller', async () => {
        applyYAML.mockRejectedValue(new Error('server rejected manifest'))

        const { apply } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        await expect(apply('bad yaml')).rejects.toThrow('server rejected manifest')

        // refresh must NOT have been called if apply failed
        expect(refresh).not.toHaveBeenCalled()
    })

    // ── close ─────────────────────────────────────────────────────────────────

    it('close: sets yaml to null', () => {
        state.yaml = 'some yaml'

        const { close } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        close()

        expect(state.yaml).toBeNull()
    })

    it('close: also clears error so the modal dismisses after a fetch failure', () => {
        state.error = 'Go sidecar returned 500'

        const { close } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        close()

        expect(state.error).toBeNull()
    })

    it('close: sets loading to false so the modal dismisses while loading', () => {
        state.loading = true

        const { close } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        close()

        expect(state.loading).toBe(false)
    })

    it('open: discards result if close() was called before the fetch resolved', async () => {
        let resolve!: (v: string) => void
        getYAML.mockReturnValue(new Promise<string>(r => { resolve = r }))

        const genRef = { current: 0 }
        const { open, close } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState, genRef)

        const opening = open('pod', 'my-pod', false, 'default')
        close()          // invalidate the in-flight fetch
        resolve('yaml content')
        await opening

        // yaml must remain null — close won the race
        expect(state.yaml).toBeNull()
        expect(state.loading).toBe(false)
    })

    it('open: discards error if close() was called before the fetch rejected', async () => {
        let reject!: (e: Error) => void
        getYAML.mockReturnValue(new Promise<string>((_, r) => { reject = r }))

        const genRef = { current: 0 }
        const { open, close } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState, genRef)

        const opening = open('pod', 'my-pod', false, 'default')
        close()
        reject(new Error('connection lost'))
        await opening

        expect(state.error).toBeNull()
        expect(state.loading).toBe(false)
    })

    // ── not-found error friendliness ───────────────────────────────────────────

    it('open: shows human-readable message when sidecar returns "not found"', async () => {
        getYAML.mockRejectedValue(new Error('Go sidecar returned 500 for /getYAML: pods "my-pod" not found'))

        const { open } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        await open('pod', 'my-pod', false, 'default')

        expect(state.error).toBe('Resource not found — it may have been deleted or is still terminating.')
    })

    it('open: shows human-readable message when error contains 404', async () => {
        getYAML.mockRejectedValue(new Error('request failed with status 404'))

        const { open } = _createYAMLEditorHandlers(getYAML, applyYAML, refresh, setState)
        await open('pod', 'my-pod', false, 'default')

        expect(state.error).toBe('Resource not found — it may have been deleted or is still terminating.')
    })
})
