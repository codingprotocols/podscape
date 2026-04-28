import { StoreSlice, ExecTarget, ExecSession } from '../types'
import { PortForwardEntry } from '../../types'
import type { CreatableKind } from '../../components/common/CreateResourceModal'

// Keyed by port-forward ID; holds the three IPC unsubscribe functions so they
// can be called when the forward is stopped or exits on its own.
const pfUnsubs = new Map<string, [() => void, () => void, () => void]>()

export interface OperationSlice {
    scaleDeployment: (name: string, replicas: number, namespace?: string) => Promise<void>
    scaleStatefulSet: (name: string, replicas: number, namespace?: string) => Promise<void>
    rolloutRestart: (kind: string, name: string, namespace?: string) => Promise<void>
    deleteResource: (kind: string, name: string, clusterScoped?: boolean, namespace?: string) => Promise<void>
    getYAML: (kind: string, name: string, clusterScoped?: boolean, namespace?: string) => Promise<string>
    getSecretValue: (name: string, key: string, namespace?: string) => Promise<string>
    applyYAML: (yaml: string) => Promise<string>
    startPortForward: (entry: PortForwardEntry) => void
    stopPortForward: (id: string) => void
    stopAllPortForwards: () => void
    execSessions: ExecSession[]
    activeExecId: string | null
    openExec: (target: ExecTarget) => void
    setActiveExecId: (id: string) => void
    closeExecTab: (id: string) => void
    closeExec: () => void
    createKind: CreatableKind | null
    openCreate: (kind: CreatableKind) => void
    closeCreate: () => void
}

export const createOperationSlice: StoreSlice<OperationSlice> = (set, get) => ({
    execSessions: [],
    activeExecId: null,
    createKind: null,
    openCreate: (kind) => set(() => ({ createKind: kind })),
    closeCreate: () => set(() => ({ createKind: null })),
    openExec: (target) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const session: ExecSession = { id, target }
        set(s => ({ execSessions: [...s.execSessions, session], activeExecId: id }))
    },
    closeExecTab: (id) => set(s => {
        const remaining = s.execSessions.filter(sess => sess.id !== id)
        let nextActive = s.activeExecId
        if (s.activeExecId === id) {
            const idx = s.execSessions.findIndex(sess => sess.id === id)
            const next = s.execSessions[idx + 1] ?? s.execSessions[idx - 1]
            nextActive = next?.id ?? null
        }
        return { execSessions: remaining, activeExecId: nextActive }
    }),
    setActiveExecId: (id) => set({ activeExecId: id }),
    closeExec: () => set({ execSessions: [], activeExecId: null }),
    scaleDeployment: async (name, replicas, namespace) => {
        const { selectedContext: ctx, selectedNamespace: ns, selectedResource } = get()
        if (!ctx) return
        const actualNs = namespace ?? (ns === '_all' ? (selectedResource?.metadata.namespace ?? null) : ns)
        if (!actualNs) return
        await window.kubectl.scale(ctx, actualNs, name, replicas)
        await get().loadSection('deployments')
    },
    scaleStatefulSet: async (name, replicas, namespace) => {
        const { selectedContext: ctx, selectedNamespace: ns, selectedResource } = get()
        if (!ctx) return
        const actualNs = namespace ?? (ns === '_all' ? (selectedResource?.metadata.namespace ?? null) : ns)
        if (!actualNs) return
        await window.kubectl.scaleResource(ctx, actualNs, 'statefulset', name, replicas)
        await get().loadSection('statefulsets')
    },
    rolloutRestart: async (kind, name, namespace) => {
        const { selectedContext: ctx, selectedNamespace: ns, selectedResource } = get()
        if (!ctx) return
        const actualNs = namespace ?? (ns === '_all' ? (selectedResource?.metadata.namespace ?? null) : ns)
        if (!actualNs) return
        await window.kubectl.rolloutRestart(ctx, actualNs, kind, name)
    },
    deleteResource: async (kind, name, clusterScoped = false, namespace?: string) => {
        const { selectedContext: ctx, selectedNamespace: ns, selectedResource } = get()
        if (!ctx) return
        const actualNs = clusterScoped ? null : (namespace ?? (ns === '_all' ? (selectedResource?.metadata.namespace ?? null) : ns))
        await window.kubectl.deleteResource(ctx, actualNs, kind, name)
        set({ selectedResource: null })
        await get().loadSection(get().section)
    },
    getYAML: async (kind, name, clusterScoped = false, namespace?: string) => {
        const { selectedContext: ctx, selectedNamespace: ns, selectedResource } = get()
        if (!ctx) return ''
        const actualNs = clusterScoped ? null : (namespace ?? (ns === '_all' ? (selectedResource?.metadata.namespace ?? null) : ns))
        return window.kubectl.getYAML(ctx, actualNs, kind, name)
    },
    getSecretValue: async (name, key, namespace) => {
        const { selectedContext: ctx, selectedNamespace: ns, selectedResource } = get()
        if (!ctx) return ''
        const actualNs = namespace ?? (ns === '_all' ? (selectedResource?.metadata.namespace ?? null) : ns)
        if (!actualNs) return ''
        return window.kubectl.getSecretValue(ctx, actualNs, name, key)
    },
    applyYAML: async (yaml) => {
        const { selectedContext: ctx } = get()
        if (!ctx) return ''
        const result = await window.kubectl.applyYAML(ctx, yaml)
        await get().loadSection(get().section)
        return result
    },
    startPortForward: (entry) => {
        set(s => ({ portForwards: [...s.portForwards, entry] }))
        const ctx = get().selectedContext!

        const unsubReady = window.kubectl.onPortForwardReady(entry.id, () =>
            set(s => ({ portForwards: s.portForwards.map(f => f.id === entry.id ? { ...f, status: 'active' } : f) }))
        )
        const unsubError = window.kubectl.onPortForwardError(entry.id, (msg) =>
            set(s => ({ portForwards: s.portForwards.map(f => f.id === entry.id ? { ...f, status: 'error', error: msg } : f) }))
        )
        const unsubExit = window.kubectl.onPortForwardExit(entry.id, () => {
            pfUnsubs.delete(entry.id)
            set(s => ({ portForwards: s.portForwards.filter(f => f.id !== entry.id) }))
        })

        pfUnsubs.set(entry.id, [unsubReady, unsubError, unsubExit])

        // Register listeners before invoking IPC so no events are missed.
        // If the IPC layer itself throws (before the sidecar is reached),
        // clean up the entry and listeners so it doesn't stay stuck in 'starting'.
        window.kubectl.portForward(ctx, entry.namespace, entry.type, entry.name, entry.localPort, entry.remotePort, entry.id)
            .catch((err: Error) => {
                const unsubs = pfUnsubs.get(entry.id)
                if (unsubs) { unsubs.forEach(fn => fn()); pfUnsubs.delete(entry.id) }
                set(s => ({ portForwards: s.portForwards.map(f =>
                    f.id === entry.id ? { ...f, status: 'error', error: err.message } : f
                )}))
            })
    },
    stopPortForward: (id) => {
        const unsubs = pfUnsubs.get(id)
        if (unsubs) {
            unsubs.forEach(fn => fn())
            pfUnsubs.delete(id)
        }
        window.kubectl.stopPortForward(id)
        set(s => ({ portForwards: s.portForwards.filter(f => f.id !== id) }))
    },
    stopAllPortForwards: () => {
        for (const [id, unsubs] of pfUnsubs) {
            unsubs.forEach(fn => fn())
            window.kubectl.stopPortForward(id)
        }
        pfUnsubs.clear()
        set({ portForwards: [] })
    },
})
