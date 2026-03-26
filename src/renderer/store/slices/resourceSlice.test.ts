import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createResourceSlice, SECTION_CONFIG, sectionClearState } from './resourceSlice'
import { createOperationSlice } from './operationSlice'
import { createAnalysisSlice } from './analysisSlice'
import { createClusterSlice } from './clusterSlice'
import { setupMocks } from './test-utils'

const { windowMock } = setupMocks()

describe('resourceSlice', () => {
    let set: any
    let get: any
    let state: any

    beforeEach(() => {
        state = {
            section: 'pods',
            selectedContext: 'ctx1',
            selectedNamespace: 'ns1',
            loadDashboard: vi.fn(),
            loadSection: vi.fn(), // Needed for refresh
            // Required by loadDashboard's AppGroup computation
            deployments: [], statefulsets: [], daemonsets: [],
            services: [], configmaps: [], hpas: [],
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

    it('loadSection calls loadDashboard for dashboard section', async () => {
        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadSection('dashboard')
        expect(state.loadDashboard).toHaveBeenCalled()
    })

    it('loadSection fetches pods for pods section', async () => {
        const pods = [{ metadata: { name: 'pod1' } }]
        windowMock.kubectl.getPods.mockResolvedValue(pods)

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadSection('pods')

        expect(windowMock.kubectl.getPods).toHaveBeenCalledWith('ctx1', 'ns1')
        // loadSection now combines pods + loadingResources in one set call
        expect(set).toHaveBeenCalledWith(expect.objectContaining({ pods }))
        expect(state.pods).toEqual(pods)
    })

    it('loadSection handles errors', async () => {
        windowMock.kubectl.getPods.mockRejectedValue(new Error('Kube error'))

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadSection('pods')

        // loadSection now combines error + loadingResources in one set call
        expect(set).toHaveBeenCalledWith(expect.objectContaining({ error: 'Kube error' }))
    })

    it('loadDashboard fetches multiple resources', async () => {
        windowMock.kubectl.getNodes.mockResolvedValue([{ name: 'node1' }])
        windowMock.kubectl.getPods.mockResolvedValue([])
        windowMock.kubectl.getDeployments.mockResolvedValue([])
        windowMock.kubectl.getNamespaces.mockResolvedValue([])
        windowMock.kubectl.getNodeMetrics.mockResolvedValue([])
        windowMock.kubectl.getEvents.mockResolvedValue([])

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadDashboard()

        expect(windowMock.kubectl.getNodes).toHaveBeenCalled()
        expect(windowMock.kubectl.getPods).toHaveBeenCalled()
        expect(set).toHaveBeenCalledWith(expect.objectContaining({ loadingResources: false }))
    })

    it('refresh calls loadSection with current section', () => {
        state.section = 'deployments'
        const slice = createResourceSlice(set, get, {} as any)
        slice.refresh()
        expect(state.loadSection).toHaveBeenCalledWith('deployments')
    })

    it('loadDashboard sets error and loadingResources=false when getNodes fails', async () => {
        windowMock.kubectl.getNodes.mockRejectedValue(new Error('nodes unreachable'))
        windowMock.kubectl.getNodeMetrics.mockResolvedValue([])
        windowMock.kubectl.getNamespaces.mockResolvedValue([])
        windowMock.kubectl.getEvents.mockResolvedValue([])
        windowMock.kubectl.getPods.mockResolvedValue([])
        windowMock.kubectl.getDeployments.mockResolvedValue([])

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadDashboard()

        expect(state.error).toBe('nodes unreachable')
        expect(state.loadingResources).toBe(false)
    })

    it('loadDashboard retains only the first error when multiple fetches fail', async () => {
        windowMock.kubectl.getNodes.mockRejectedValue(new Error('first error'))
        windowMock.kubectl.getNodeMetrics.mockResolvedValue([])
        windowMock.kubectl.getNamespaces.mockRejectedValue(new Error('second error'))
        windowMock.kubectl.getEvents.mockResolvedValue([])
        windowMock.kubectl.getPods.mockResolvedValue([])
        windowMock.kubectl.getDeployments.mockResolvedValue([])

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadDashboard()

        expect(state.error).toBe('first error')
        expect(state.loadingResources).toBe(false)
    })

    // ── SECTION_CONFIG path tests (Issue 10A) ──────────────────────────────────

    it('loadSection: cluster-scoped section (nodes) ignores namespace', async () => {
        const nodes = [{ metadata: { name: 'node1' } }]
        windowMock.kubectl.getNodes.mockResolvedValue(nodes)
        state.selectedNamespace = 'some-ns' // should be ignored for cluster-scoped

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadSection('nodes')

        // Cluster-scoped fetch receives only the context — no namespace argument
        expect(windowMock.kubectl.getNodes).toHaveBeenCalledWith('ctx1')
        expect(set).toHaveBeenCalledWith(expect.objectContaining({ nodes }))
    })

    it('loadSection: namespaced section with no namespace clears state without fetching', async () => {
        state.selectedNamespace = null

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadSection('pods')

        expect(windowMock.kubectl.getPods).not.toHaveBeenCalled()
        expect(set).toHaveBeenCalledWith(expect.objectContaining({ pods: [] }))
    })

    it('loadSection: selectedNamespace="_all" passes null to fetch', async () => {
        state.selectedNamespace = '_all'
        windowMock.kubectl.getPods.mockResolvedValue([])

        const slice = createResourceSlice(set, get, {} as any)
        await slice.loadSection('pods')

        // _all means "all namespaces" — translated to null before the API call
        expect(windowMock.kubectl.getPods).toHaveBeenCalledWith('ctx1', null)
    })

    // ── SECTION_CONFIG exhaustiveness ─────────────────────────────────────────

    it('every SECTION_CONFIG stateKey maps to a key in the slice initial state', () => {
        // SECTION_CONFIG spans both resourceSlice (namespaced + most cluster-scoped
        // resources) and clusterSlice (namespaces). Merge both initial states so the
        // check covers the full AppStore shape relevant to resource sections.
        const resourceState = createResourceSlice(set, get, {} as any)
        const clusterState = createClusterSlice(set, get, {} as any)
        const combinedState = { ...resourceState, ...clusterState }

        const missing: string[] = []
        for (const [section, config] of Object.entries(SECTION_CONFIG)) {
            if (!(config!.stateKey in combinedState)) {
                missing.push(`${section} → stateKey "${config!.stateKey}" not found in slice`)
            }
        }
        if (missing.length > 0) {
            throw new Error(`SECTION_CONFIG stateKey mismatches:\n  ${missing.join('\n  ')}`)
        }
    })

    it('sectionClearState contains an entry for every SECTION_CONFIG key', () => {
        const configKeys = Object.keys(SECTION_CONFIG)
        const clearKeys = Object.keys(sectionClearState)

        // Every stateKey in SECTION_CONFIG must be in sectionClearState
        for (const [section, config] of Object.entries(SECTION_CONFIG)) {
            if (!clearKeys.includes(config!.stateKey)) {
                throw new Error(
                    `sectionClearState is missing stateKey "${config!.stateKey}" for section "${section}"`
                )
            }
        }
        // sectionClearState must not have extra keys beyond SECTION_CONFIG
        const stateKeys = configKeys.map(k => SECTION_CONFIG[k as keyof typeof SECTION_CONFIG]!.stateKey)
        for (const key of clearKeys) {
            if (!stateKeys.includes(key)) {
                throw new Error(`sectionClearState has unexpected key "${key}" not in SECTION_CONFIG`)
            }
        }
    })

    // ── scanSecurity ──────────────────────────────────────────────────────────

    describe('scanSecurity', () => {
        beforeEach(() => {
            state.pods = []
            state.deployments = []
            state.statefulsets = []
            state.daemonsets = []
            state.jobs = []
            state.cronjobs = []
        })

        it('sets trivyAvailable=false when trivy_not_found error, no error toast', async () => {
            windowMock.kubectl.scanSecurity.mockRejectedValue(
                new Error('503: {"error":"trivy_not_found","message":"trivy not found"}')
            )
            windowMock.kubectl.scanKubesecBatch.mockResolvedValue([])

            const slice = createAnalysisSlice(set, get, {} as any)
            await slice.scanSecurity()

            expect(state.trivyAvailable).toBe(false)
            expect(state.error).toBeNull()
            expect(state.securityScanning).toBe(false)
        })

        it('sets trivyAvailable=true and stores results when trivy scan succeeds', async () => {
            const fakeResults = { Resources: [{ Name: 'pod-a', Namespace: 'default', Kind: 'Pod', Results: [] }] }
            windowMock.kubectl.scanSecurity.mockResolvedValue(fakeResults)
            windowMock.kubectl.scanKubesecBatch.mockResolvedValue([])

            const slice = createAnalysisSlice(set, get, {} as any)
            await slice.scanSecurity()

            expect(state.trivyAvailable).toBe(true)
            expect(state.securityScanResults).toEqual(fakeResults)
            expect(state.securityScanning).toBe(false)
        })

        it('sets error string when trivy fails with a non-trivy_not_found error', async () => {
            windowMock.kubectl.scanSecurity.mockRejectedValue(new Error('network timeout'))
            windowMock.kubectl.scanKubesecBatch.mockResolvedValue([])

            const slice = createAnalysisSlice(set, get, {} as any)
            await slice.scanSecurity()

            expect(state.error).toContain('network timeout')
            expect(state.trivyAvailable).toBeNull()
        })

        it('builds kubesecBatchResults map with "namespace/name/kind" keys matching SecurityHub lookup', async () => {
            windowMock.kubectl.scanSecurity.mockResolvedValue({ Resources: [] })
            const batchResults = [
                { score: 5, issues: [{ id: 'A', reason: 'r', selector: 's', points: 3 }] },
                { score: 2, issues: [] },
            ]
            windowMock.kubectl.scanKubesecBatch.mockResolvedValue(batchResults)

            state.pods = [
                { metadata: { name: 'pod-a', namespace: 'ns1', uid: '1', creationTimestamp: '', labels: {} }, kind: 'Pod', apiVersion: 'v1', spec: {}, status: {} },
                { metadata: { name: 'pod-b', namespace: 'ns2', uid: '2', creationTimestamp: '', labels: {} }, kind: 'Pod', apiVersion: 'v1', spec: {}, status: {} },
            ]

            const slice = createAnalysisSlice(set, get, {} as any)
            await slice.scanSecurity()

            expect(state.kubesecBatchResults?.['ns1/pod-a/Pod']).toEqual(batchResults[0])
            expect(state.kubesecBatchResults?.['ns2/pod-b/Pod']).toEqual(batchResults[1])
        })

        it('sets kubesecBatchResults=null and clears securityScanning when kubesec fails', async () => {
            windowMock.kubectl.scanSecurity.mockResolvedValue({ Resources: [] })
            windowMock.kubectl.scanKubesecBatch.mockRejectedValue(new Error('kubesec error'))

            const slice = createAnalysisSlice(set, get, {} as any)
            await slice.scanSecurity()

            expect(state.kubesecBatchResults).toBeNull()
            expect(state.securityScanning).toBe(false)
        })
    })

    // ── Exec session state machine ─────────────────────────────────────────────

    describe('exec session actions', () => {
        const target1 = { pod: 'pod-a', container: 'app', namespace: 'default' }
        const target2 = { pod: 'pod-b', container: 'sidecar', namespace: 'kube-system' }

        beforeEach(() => {
            state.execSessions = []
            state.activeExecId = null
        })

        it('openExec appends a new session and sets it as active', () => {
            const slice = createOperationSlice(set, get, {} as any)
            slice.openExec(target1)

            expect(state.execSessions).toHaveLength(1)
            expect(state.execSessions[0].target).toEqual(target1)
            expect(state.activeExecId).toBe(state.execSessions[0].id)
        })

        it('openExec twice appends two sessions, active is the second', () => {
            const slice = createOperationSlice(set, get, {} as any)
            slice.openExec(target1)
            slice.openExec(target2)

            expect(state.execSessions).toHaveLength(2)
            expect(state.execSessions[0].target).toEqual(target1)
            expect(state.execSessions[1].target).toEqual(target2)
            expect(state.activeExecId).toBe(state.execSessions[1].id)
        })

        it('closeExec clears all sessions and activeExecId', () => {
            const slice = createOperationSlice(set, get, {} as any)
            slice.openExec(target1)
            slice.openExec(target2)
            slice.closeExec()

            expect(state.execSessions).toHaveLength(0)
            expect(state.activeExecId).toBeNull()
        })

        it('closeExecTab removes the tab and shifts active to next', () => {
            const slice = createOperationSlice(set, get, {} as any)
            slice.openExec(target1)
            slice.openExec(target2)
            const firstId = state.execSessions[0].id
            const secondId = state.execSessions[1].id

            // Make first tab active, then close it → should shift to second
            slice.setActiveExecId(firstId)
            slice.closeExecTab(firstId)

            expect(state.execSessions).toHaveLength(1)
            expect(state.execSessions[0].id).toBe(secondId)
            expect(state.activeExecId).toBe(secondId)
        })

        it('closeExecTab on the last session leaves execSessions empty and activeExecId null', () => {
            const slice = createOperationSlice(set, get, {} as any)
            slice.openExec(target1)
            const id = state.execSessions[0].id
            slice.closeExecTab(id)

            expect(state.execSessions).toHaveLength(0)
            expect(state.activeExecId).toBeNull()
        })

        it('closeExecTab on a non-active tab leaves active unchanged', () => {
            const slice = createOperationSlice(set, get, {} as any)
            slice.openExec(target1)
            slice.openExec(target2)
            const firstId = state.execSessions[0].id
            const secondId = state.execSessions[1].id

            // second tab is active; close first → active stays second
            slice.closeExecTab(firstId)

            expect(state.execSessions).toHaveLength(1)
            expect(state.activeExecId).toBe(secondId)
        })

        it('setActiveExecId switches the active tab', () => {
            const slice = createOperationSlice(set, get, {} as any)
            slice.openExec(target1)
            slice.openExec(target2)
            const firstId = state.execSessions[0].id

            slice.setActiveExecId(firstId)
            expect(state.activeExecId).toBe(firstId)
        })
    })
})
