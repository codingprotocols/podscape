import { ResourceKind } from '../types'
import { CustomScanOptions } from './types'

// ── Section config ────────────────────────────────────────────────────────────
// Single source of truth mapping each resource section to its state key and
// fetch function. Both loadSection and the clear-on-context-switch derive from
// this map, so they can never fall out of sync.

export type SectionConfig = {
    stateKey: string
    fetch: (ctx: string, ns: string | null) => Promise<any[]>
    namespaced: boolean  // false = cluster-scoped; namespace arg is ignored
}

export const SECTION_CONFIG: Partial<Record<ResourceKind, SectionConfig>> = {
    pods:                { stateKey: 'pods',                fetch: (c, ns) => window.kubectl.getPods(c, ns),                  namespaced: true },
    deployments:         { stateKey: 'deployments',         fetch: (c, ns) => window.kubectl.getDeployments(c, ns),            namespaced: true },
    daemonsets:          { stateKey: 'daemonsets',          fetch: (c, ns) => window.kubectl.getDaemonSets(c, ns),             namespaced: true },
    statefulsets:        { stateKey: 'statefulsets',        fetch: (c, ns) => window.kubectl.getStatefulSets(c, ns),           namespaced: true },
    replicasets:         { stateKey: 'replicasets',         fetch: (c, ns) => window.kubectl.getReplicaSets(c, ns),            namespaced: true },
    jobs:                { stateKey: 'jobs',                fetch: (c, ns) => window.kubectl.getJobs(c, ns),                   namespaced: true },
    cronjobs:            { stateKey: 'cronjobs',            fetch: (c, ns) => window.kubectl.getCronJobs(c, ns),               namespaced: true },
    hpas:                { stateKey: 'hpas',                fetch: (c, ns) => window.kubectl.getHPAs(c, ns),                   namespaced: true },
    pdbs:                { stateKey: 'pdbs',                fetch: (c, ns) => window.kubectl.getPodDisruptionBudgets(c, ns),   namespaced: true },
    services:            { stateKey: 'services',            fetch: (c, ns) => window.kubectl.getServices(c, ns),               namespaced: true },
    ingresses:           { stateKey: 'ingresses',           fetch: (c, ns) => window.kubectl.getIngresses(c, ns),              namespaced: true },
    networkpolicies:     { stateKey: 'networkpolicies',     fetch: (c, ns) => window.kubectl.getNetworkPolicies(c, ns),        namespaced: true },
    endpoints:           { stateKey: 'endpoints',           fetch: (c, ns) => window.kubectl.getEndpoints(c, ns),              namespaced: true },
    configmaps:          { stateKey: 'configmaps',          fetch: (c, ns) => window.kubectl.getConfigMaps(c, ns),             namespaced: true },
    secrets:             { stateKey: 'secrets',             fetch: (c, ns) => window.kubectl.getSecrets(c, ns),                namespaced: true },
    pvcs:                { stateKey: 'pvcs',                fetch: (c, ns) => window.kubectl.getPVCs(c, ns),                   namespaced: true },
    serviceaccounts:     { stateKey: 'serviceaccounts',     fetch: (c, ns) => window.kubectl.getServiceAccounts(c, ns),        namespaced: true },
    roles:               { stateKey: 'roles',               fetch: (c, ns) => window.kubectl.getRoles(c, ns),                  namespaced: true },
    rolebindings:        { stateKey: 'rolebindings',        fetch: (c, ns) => window.kubectl.getRoleBindings(c, ns),           namespaced: true },
    events:              { stateKey: 'events',              fetch: (c, ns) => window.kubectl.getEvents(c, ns),                 namespaced: true },
    nodes:               { stateKey: 'nodes',               fetch: (c, _)  => window.kubectl.getNodes(c),                     namespaced: false },
    namespaces:          { stateKey: 'namespaces',          fetch: (c, _)  => window.kubectl.getNamespaces(c),                 namespaced: false },
    crds:                { stateKey: 'crds',                fetch: (c, _)  => window.kubectl.getCRDs(c),                       namespaced: false },
    ingressclasses:      { stateKey: 'ingressclasses',      fetch: (c, _)  => window.kubectl.getIngressClasses(c),             namespaced: false },
    pvs:                 { stateKey: 'pvs',                 fetch: (c, _)  => window.kubectl.getPVs(c),                        namespaced: false },
    storageclasses:      { stateKey: 'storageclasses',      fetch: (c, _)  => window.kubectl.getStorageClasses(c),             namespaced: false },
    clusterroles:        { stateKey: 'clusterroles',        fetch: (c, _)  => window.kubectl.getClusterRoles(c),               namespaced: false },
    clusterrolebindings: { stateKey: 'clusterrolebindings', fetch: (c, _)  => window.kubectl.getClusterRoleBindings(c),        namespaced: false },
}

// Pre-computed reset object for all resource sections (empty arrays).
// Import this in clusterSlice to clear resource lists on context switch.
// Note: deniedSections is reset separately in clusterSlice alongside other cross-cutting state.
export const sectionClearState: Record<string, any> = {
    ...Object.fromEntries(Object.values(SECTION_CONFIG).map(c => [c!.stateKey, []])),
}

export const kindToSection: Record<string, ResourceKind> = {
    Pod: 'pods',
    Deployment: 'deployments',
    ReplicaSet: 'replicasets',
    DaemonSet: 'daemonsets',
    StatefulSet: 'statefulsets',
    Job: 'jobs',
    CronJob: 'cronjobs',
    Service: 'services',
    Ingress: 'ingresses',
    ConfigMap: 'configmaps',
    Secret: 'secrets',
    Node: 'nodes',
    Namespace: 'namespaces',
    HorizontalPodAutoscaler: 'hpas',
    PersistentVolumeClaim: 'pvcs',
    PersistentVolume: 'pvs',
    ServiceAccount: 'serviceaccounts',
    Role: 'roles',
    ClusterRole: 'clusterroles',
    RoleBinding: 'rolebindings',
    ClusterRoleBinding: 'clusterrolebindings',
}

export function kindLabel(section: string): string {
    const map: Record<string, string> = {
        pods: 'pod', deployments: 'deployment', daemonsets: 'daemonset',
        statefulsets: 'statefulset', replicasets: 'replicaset', jobs: 'job', cronjobs: 'cronjob',
        hpas: 'horizontalpodautoscaler', pdbs: 'poddisruptionbudget',
        services: 'service', ingresses: 'ingress', ingressclasses: 'ingressclass',
        networkpolicies: 'networkpolicy', endpoints: 'endpoints',
        configmaps: 'configmap', secrets: 'secret',
        pvcs: 'persistentvolumeclaim', pvs: 'persistentvolume', storageclasses: 'storageclass',
        serviceaccounts: 'serviceaccount', roles: 'role', clusterroles: 'clusterrole',
        rolebindings: 'rolebinding', clusterrolebindings: 'clusterrolebinding',
        nodes: 'node', namespaces: 'namespace', crds: 'crd'
    }
    return map[section] ?? section
}

/** Post-filters trivy scan output to match the custom scan scope. */
export function filterTrivyByScope(data: any, options: CustomScanOptions): any {
    if (!data?.Resources) return data
    let resources = data.Resources
    if (options.namespaces.length > 0) {
        const nsSet = new Set(options.namespaces)
        resources = resources.filter((r: any) => nsSet.has(r.Namespace))
    }
    if (options.kinds.length > 0) {
        const kindSet = new Set(options.kinds)
        resources = resources.filter((r: any) => kindSet.has(r.Kind))
    }
    return { ...data, Resources: resources }
}
