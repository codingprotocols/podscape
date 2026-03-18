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
})
