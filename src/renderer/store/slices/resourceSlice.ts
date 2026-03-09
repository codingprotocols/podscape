import { StoreSlice, ExecTarget } from '../types'
import {
    KubePod, KubeDeployment, KubeDaemonSet, KubeStatefulSet,
    KubeReplicaSet, KubeJob, KubeCronJob, KubeHPA, KubePDB,
    KubeService, KubeIngress, KubeIngressClass, KubeNetworkPolicy, KubeEndpoints,
    KubeConfigMap, KubeSecret, KubePVC, KubePV, KubeStorageClass,
    KubeServiceAccount, KubeRole, KubeClusterRole, KubeRoleBinding, KubeClusterRoleBinding,
    KubeNode, KubeEvent, KubeCRD,
    NodeMetrics, PodMetrics, Plugin, ResourceKind, AnyKubeResource, PortForwardEntry,
    HelmRelease, DebugPodEntry
} from '../../types'

export interface ResourceSlice {
    pods: KubePod[]
    deployments: KubeDeployment[]
    daemonsets: KubeDaemonSet[]
    statefulsets: KubeStatefulSet[]
    replicasets: KubeReplicaSet[]
    jobs: KubeJob[]
    cronjobs: KubeCronJob[]
    hpas: KubeHPA[]
    pdbs: KubePDB[]
    services: KubeService[]
    ingresses: KubeIngress[]
    ingressclasses: KubeIngressClass[]
    networkpolicies: KubeNetworkPolicy[]
    endpoints: KubeEndpoints[]
    configmaps: KubeConfigMap[]
    secrets: KubeSecret[]
    pvcs: KubePVC[]
    pvs: KubePV[]
    storageclasses: KubeStorageClass[]
    serviceaccounts: KubeServiceAccount[]
    roles: KubeRole[]
    clusterroles: KubeClusterRole[]
    rolebindings: KubeRoleBinding[]
    clusterrolebindings: KubeClusterRoleBinding[]
    nodes: KubeNode[]
    events: KubeEvent[]
    crds: KubeCRD[]
    podMetrics: PodMetrics[]
    nodeMetrics: NodeMetrics[]
    plugins: Plugin[]
    portForwards: PortForwardEntry[]
    helmReleases: HelmRelease[]
    debugPods: DebugPodEntry[]
    addDebugPod: (pod: DebugPodEntry) => void
    removeDebugPod: (name: string) => void
    updateDebugPod: (name: string, updates: Partial<DebugPodEntry>) => void
    selectedResource: AnyKubeResource | null
    loadingResources: boolean
    error: string | null
    execTarget: ExecTarget | null
    selectResource: (r: AnyKubeResource | null) => void
    clearError: () => void
    openExec: (target: ExecTarget) => void
    closeExec: () => void
    loadSection: (section: ResourceKind) => Promise<void>
    loadDashboard: () => Promise<void>
    refresh: () => Promise<void>
}

export const createResourceSlice: StoreSlice<ResourceSlice> = (set, get) => ({
    pods: [],
    deployments: [],
    daemonsets: [],
    statefulsets: [],
    replicasets: [],
    jobs: [],
    cronjobs: [],
    hpas: [],
    pdbs: [],
    services: [],
    ingresses: [],
    ingressclasses: [],
    networkpolicies: [],
    endpoints: [],
    configmaps: [],
    secrets: [],
    pvcs: [],
    pvs: [],
    storageclasses: [],
    serviceaccounts: [],
    roles: [],
    clusterroles: [],
    rolebindings: [],
    clusterrolebindings: [],
    nodes: [],
    events: [],
    crds: [],
    podMetrics: [],
    nodeMetrics: [],
    plugins: [],
    portForwards: [],
    helmReleases: [],
    debugPods: [],
    selectedResource: null,
    loadingResources: false,
    error: null,
    execTarget: null,

    selectResource: (r) => set({ selectedResource: r }),
    clearError: () => set({ error: null }),
    openExec: (target) => set({ execTarget: target }),
    closeExec: () => set({ execTarget: null }),
    addDebugPod: (pod) => set(s => ({ debugPods: [pod, ...s.debugPods] })),
    removeDebugPod: (name) => set(s => ({ debugPods: s.debugPods.filter(p => p.name !== name) })),
    updateDebugPod: (name, updates) => set(s => ({ debugPods: s.debugPods.map(p => p.name === name ? { ...p, ...updates } : p) })),

    loadSection: async (section) => {
        const { selectedContext: ctx, selectedNamespace: ns } = get()
        if (!ctx) return

        if (section === 'dashboard') {
            await get().loadDashboard()
            return
        }

        const nsArg = ns === '_all' ? null : ns

        if (['terminal', 'extensions', 'metrics', 'network', 'portforwards', 'helm', 'settings', 'connectivity', 'debugpod'].includes(section)) {
            if (section === 'metrics' && ctx) {
                set({ loadingResources: true })
                try {
                    const [pm, nm, pds, nds, hpas] = await Promise.all([
                        window.kubectl.getPodMetrics(ctx, nsArg),
                        window.kubectl.getNodeMetrics(ctx),
                        window.kubectl.getPods(ctx, nsArg),
                        window.kubectl.getNodes(ctx),
                        window.kubectl.getHPAs(ctx, nsArg)
                    ])
                    set({
                        podMetrics: pm,
                        nodeMetrics: nm,
                        pods: pds as KubePod[],
                        nodes: nds as KubeNode[],
                        hpas: hpas as KubeHPA[],
                        loadingResources: false
                    })
                } catch { set({ loadingResources: false }) }
            }
            if (section === 'network' && ctx) {
                set({ loadingResources: true })
                try {
                    const [svcs, ings, pds, nss, nps] = await Promise.all([
                        window.kubectl.getServices(ctx, nsArg),
                        window.kubectl.getIngresses(ctx, nsArg),
                        window.kubectl.getPods(ctx, nsArg),
                        window.kubectl.getNamespaces(ctx),
                        window.kubectl.getNetworkPolicies(ctx, nsArg)
                    ])
                    set({
                        services: svcs as KubeService[],
                        ingresses: ings as KubeIngress[],
                        pods: pds as KubePod[],
                        namespaces: nss,
                        networkpolicies: nps as KubeNetworkPolicy[],
                        loadingResources: false
                    })
                } catch { set({ loadingResources: false }) }
            }
            return
        }

        set({ loadingResources: true, error: null, selectedResource: null })
        try {
            switch (section) {
                case 'pods': set({ pods: (ns ? await window.kubectl.getPods(ctx, nsArg) : []) }); break
                case 'deployments': set({ deployments: (ns ? await window.kubectl.getDeployments(ctx, nsArg) : []) }); break
                case 'statefulsets': set({ statefulsets: (ns ? await window.kubectl.getStatefulSets(ctx, nsArg) : []) }); break
                case 'replicasets': set({ replicasets: (ns ? await window.kubectl.getReplicaSets(ctx, nsArg) : []) }); break
                case 'jobs': set({ jobs: (ns ? await window.kubectl.getJobs(ctx, nsArg) : []) }); break
                case 'cronjobs': set({ cronjobs: (ns ? await window.kubectl.getCronJobs(ctx, nsArg) : []) }); break
                case 'services': set({ services: (ns ? await window.kubectl.getServices(ctx, nsArg) : []) }); break
                case 'ingresses': set({ ingresses: (ns ? await window.kubectl.getIngresses(ctx, nsArg) : []) }); break
                case 'configmaps': set({ configmaps: (ns ? await window.kubectl.getConfigMaps(ctx, nsArg) : []) }); break
                case 'secrets': set({ secrets: (ns ? await window.kubectl.getSecrets(ctx, nsArg) : []) }); break
                case 'nodes': set({ nodes: await window.kubectl.getNodes(ctx) }); break
                case 'namespaces': set({ namespaces: await window.kubectl.getNamespaces(ctx) }); break
                case 'events': set({ events: (ns ? await window.kubectl.getEvents(ctx, nsArg) : []) }); break
                case 'crds': set({ crds: await window.kubectl.getCRDs(ctx) }); break
                case 'daemonsets': set({ daemonsets: (ns ? await window.kubectl.getDaemonSets(ctx, nsArg) : []) }); break
                case 'hpas': set({ hpas: (ns ? await window.kubectl.getHPAs(ctx, nsArg) : []) }); break
                case 'pdbs': set({ pdbs: (ns ? await window.kubectl.getPodDisruptionBudgets(ctx, nsArg) : []) }); break
                case 'networkpolicies': set({ networkpolicies: (ns ? await window.kubectl.getNetworkPolicies(ctx, nsArg) : []) }); break
                case 'endpoints': set({ endpoints: (ns ? await window.kubectl.getEndpoints(ctx, nsArg) : []) }); break
                case 'pvcs': set({ pvcs: (ns ? await window.kubectl.getPVCs(ctx, nsArg) : []) }); break
                case 'serviceaccounts': set({ serviceaccounts: (ns ? await window.kubectl.getServiceAccounts(ctx, nsArg) : []) }); break
                case 'roles': set({ roles: (ns ? await window.kubectl.getRoles(ctx, nsArg) : []) }); break
                case 'rolebindings': set({ rolebindings: (ns ? await window.kubectl.getRoleBindings(ctx, nsArg) : []) }); break
                case 'ingressclasses': set({ ingressclasses: await window.kubectl.getIngressClasses(ctx) }); break
                case 'pvs': set({ pvs: await window.kubectl.getPVs(ctx) }); break
                case 'storageclasses': set({ storageclasses: await window.kubectl.getStorageClasses(ctx) }); break
                case 'clusterroles': set({ clusterroles: await window.kubectl.getClusterRoles(ctx) }); break
                case 'clusterrolebindings': set({ clusterrolebindings: await window.kubectl.getClusterRoleBindings(ctx) }); break
            }
        } catch (err) {
            set({ error: (err as Error).message })
        } finally {
            set({ loadingResources: false })
        }
    },

    loadDashboard: async () => {
        const { selectedContext: ctx } = get()
        if (!ctx) return
        set({ loadingResources: true, error: null })
        const ns = get().selectedNamespace
        let firstError: string | null = null
        const setErr = (err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err)
            if (!firstError) firstError = msg
        }
        await Promise.all([
            window.kubectl.getNodes(ctx).then(nodes => set({ nodes })).catch(e => { setErr(e); set({ nodes: [] }) }),
            window.kubectl.getNodeMetrics(ctx).then(nodeMetrics => set({ nodeMetrics })).catch(() => set({ nodeMetrics: [] })),
            window.kubectl.getNamespaces(ctx).then(namespaces => set({ namespaces })).catch(e => { setErr(e); set({ namespaces: [] }) }),
            window.kubectl.getEvents(ctx, null).then(events => set({ events })).catch(() => { if (ns) window.kubectl.getEvents(ctx, ns).then(events => set({ events })).catch(() => { }) }),
            window.kubectl.getPods(ctx, null).then(pods => set({ pods })).catch(() => { if (ns) window.kubectl.getPods(ctx, ns).then(pods => set({ pods })).catch(() => { }) }),
            window.kubectl.getDeployments(ctx, null).then(deployments => set({ deployments })).catch(() => { if (ns) window.kubectl.getDeployments(ctx, ns).then(deployments => set({ deployments })).catch(() => { }) }),
        ])
        if (firstError) set({ error: firstError })
        set({ loadingResources: false })
    },

    refresh: () => get().loadSection(get().section),
})
