import { AppStore, StoreSlice } from '../types'
import { PortForwardEntry } from '../../types'

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
}

export const createOperationSlice: StoreSlice<OperationSlice> = (set, get) => ({
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
        window.kubectl.portForward(ctx, entry.namespace, entry.type, entry.name, entry.localPort, entry.remotePort, entry.id)
        window.kubectl.onPortForwardReady(entry.id, () => set(s => ({ portForwards: s.portForwards.map(f => f.id === entry.id ? { ...f, status: 'active' } : f) })))
        window.kubectl.onPortForwardError(entry.id, (msg) => set(s => ({ portForwards: s.portForwards.map(f => f.id === entry.id ? { ...f, status: 'error', error: msg } : f) })))
        window.kubectl.onPortForwardExit(entry.id, () => set(s => ({ portForwards: s.portForwards.filter(f => f.id !== entry.id) })))
    },
    stopPortForward: (id) => {
        window.kubectl.stopPortForward(id)
        set(s => ({ portForwards: s.portForwards.filter(f => f.id !== id) }))
    },
})
