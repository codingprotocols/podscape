import { ResourceKind } from '../types'
import {
    KubePod, KubeDeployment, KubeDaemonSet, KubeStatefulSet, KubeReplicaSet,
    KubeJob, KubeCronJob, KubeHPA, KubePDB, KubeService, KubeIngress,
    KubeIngressClass, KubeNetworkPolicy, KubeEndpoints, KubeConfigMap,
    KubeSecret, KubePVC, KubePV, KubeStorageClass, KubeServiceAccount,
    KubeRole, KubeClusterRole, KubeRoleBinding, KubeClusterRoleBinding,
    KubeNode, KubeNamespace, KubeCRD, KubeEvent, KubeResourceQuota, KubeLimitRange,
} from '../types/k8s'
import { CustomScanOptions } from './types'

// ── Section config ────────────────────────────────────────────────────────────
// Single source of truth mapping each resource section to its state key,
// fetch function, and search fields. loadSection, clear-on-context-switch,
// and ResourceList filtering all derive from this map.

export type SectionConfig = {
    stateKey: string
    fetch: (ctx: string, ns: string | null) => Promise<any[]>
    namespaced: boolean  // false = cluster-scoped; namespace arg is ignored
    // Returns all strings worth indexing for search. Falls back to name-only
    // if omitted (should not happen — all sections below define this).
    searchFields: (r: any) => (string | null | undefined)[]
}

export function labelsToStrings(labels?: Record<string, string>): string[] {
    if (!labels) return []
    const result: string[] = []
    for (const k in labels) result.push(`${k}=${labels[k]}`)
    return result
}

export const SECTION_CONFIG: Partial<Record<ResourceKind, SectionConfig>> = {
    pods: {
        stateKey: 'pods', fetch: (c, ns) => window.kubectl.getPods(c, ns), namespaced: true,
        searchFields: (r: KubePod) => [
            r.metadata.name,
            r.metadata.namespace,
            r.status?.phase,
            r.status?.reason,
            r.status?.podIP,
            r.status?.hostIP,
            r.spec?.nodeName,
            r.spec?.serviceAccountName,
            ...r.spec?.containers?.map(c => c.image) ?? [],
            ...r.spec?.containers?.map(c => c.name) ?? [],
            ...r.spec?.initContainers?.map(c => c.image) ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    deployments: {
        stateKey: 'deployments', fetch: (c, ns) => window.kubectl.getDeployments(c, ns), namespaced: true,
        searchFields: (r: KubeDeployment) => [
            r.metadata.name,
            r.metadata.namespace,
            r.spec?.strategy?.type,
            ...r.spec?.template?.spec?.containers?.map(c => c.image) ?? [],
            ...r.spec?.template?.spec?.containers?.map(c => c.name) ?? [],
            ...labelsToStrings(r.metadata.labels),
            ...labelsToStrings(r.spec?.selector?.matchLabels),
        ],
    },
    daemonsets: {
        stateKey: 'daemonsets', fetch: (c, ns) => window.kubectl.getDaemonSets(c, ns), namespaced: true,
        searchFields: (r: KubeDaemonSet) => [
            r.metadata.name,
            r.metadata.namespace,
            r.spec?.updateStrategy?.type,
            ...r.spec?.template?.spec?.containers?.map(c => c.image) ?? [],
            ...labelsToStrings(r.metadata.labels),
            ...labelsToStrings(r.spec?.selector?.matchLabels),
        ],
    },
    statefulsets: {
        stateKey: 'statefulsets', fetch: (c, ns) => window.kubectl.getStatefulSets(c, ns), namespaced: true,
        searchFields: (r: KubeStatefulSet) => [
            r.metadata.name,
            r.metadata.namespace,
            r.spec?.serviceName,
            ...r.spec?.template?.spec?.containers?.map(c => c.image) ?? [],
            ...labelsToStrings(r.metadata.labels),
            ...labelsToStrings(r.spec?.selector?.matchLabels),
        ],
    },
    replicasets: {
        stateKey: 'replicasets', fetch: (c, ns) => window.kubectl.getReplicaSets(c, ns), namespaced: true,
        searchFields: (r: KubeReplicaSet) => [
            r.metadata.name,
            r.metadata.namespace,
            ...r.metadata.ownerReferences?.map(o => o.name) ?? [],
            ...labelsToStrings(r.metadata.labels),
            ...labelsToStrings(r.spec?.selector?.matchLabels),
        ],
    },
    jobs: {
        stateKey: 'jobs', fetch: (c, ns) => window.kubectl.getJobs(c, ns), namespaced: true,
        searchFields: (r: KubeJob) => [
            r.metadata.name,
            r.metadata.namespace,
            ...r.metadata.ownerReferences?.map(o => o.name) ?? [],
            ...r.spec?.template?.spec?.containers?.map(c => c.image) ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    cronjobs: {
        stateKey: 'cronjobs', fetch: (c, ns) => window.kubectl.getCronJobs(c, ns), namespaced: true,
        searchFields: (r: KubeCronJob) => [
            r.metadata.name,
            r.metadata.namespace,
            r.spec?.schedule,
            r.spec?.suspend ? 'suspended' : null,
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    hpas: {
        stateKey: 'hpas', fetch: (c, ns) => window.kubectl.getHPAs(c, ns), namespaced: true,
        searchFields: (r: KubeHPA) => [
            r.metadata.name,
            r.metadata.namespace,
            r.spec?.scaleTargetRef?.name,
            r.spec?.scaleTargetRef?.kind,
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    pdbs: {
        stateKey: 'pdbs', fetch: (c, ns) => window.kubectl.getPodDisruptionBudgets(c, ns), namespaced: true,
        searchFields: (r: KubePDB) => [
            r.metadata.name,
            r.metadata.namespace,
            ...labelsToStrings(r.metadata.labels),
            ...labelsToStrings(r.spec?.selector?.matchLabels),
        ],
    },
    resourcequotas: {
        stateKey: 'resourcequotas', fetch: (c, ns) => window.kubectl.getResourceQuotas(c, ns), namespaced: true,
        searchFields: (r: KubeResourceQuota) => [
            r.metadata.name,
            r.metadata.namespace,
            ...Object.keys(r.spec?.hard ?? {}),
            ...r.spec?.scopes ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    limitranges: {
        stateKey: 'limitranges', fetch: (c, ns) => window.kubectl.getLimitRanges(c, ns), namespaced: true,
        searchFields: (r: KubeLimitRange) => [
            r.metadata.name,
            r.metadata.namespace,
            ...r.spec?.limits?.map(l => l.type) ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    services: {
        stateKey: 'services', fetch: (c, ns) => window.kubectl.getServices(c, ns), namespaced: true,
        searchFields: (r: KubeService) => [
            r.metadata.name,
            r.metadata.namespace,
            r.spec?.type,
            r.spec?.clusterIP,
            r.spec?.externalName,
            ...r.spec?.clusterIPs ?? [],
            ...r.spec?.externalIPs ?? [],
            ...r.status?.loadBalancer?.ingress?.map(i => i.ip ?? i.hostname) ?? [],
            ...labelsToStrings(r.metadata.labels),
            ...labelsToStrings(r.spec?.selector),
        ],
    },
    ingresses: {
        stateKey: 'ingresses', fetch: (c, ns) => window.kubectl.getIngresses(c, ns), namespaced: true,
        searchFields: (r: KubeIngress) => [
            r.metadata.name,
            r.metadata.namespace,
            r.spec?.ingressClassName,
            ...r.spec?.rules?.map(rule => rule.host) ?? [],
            ...r.spec?.tls?.flatMap(t => t.hosts ?? []) ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    networkpolicies: {
        stateKey: 'networkpolicies', fetch: (c, ns) => window.kubectl.getNetworkPolicies(c, ns), namespaced: true,
        searchFields: (r: KubeNetworkPolicy) => [
            r.metadata.name,
            r.metadata.namespace,
            ...r.spec?.policyTypes ?? [],
            ...labelsToStrings(r.metadata.labels),
            ...labelsToStrings(r.spec?.podSelector?.matchLabels),
        ],
    },
    endpoints: {
        stateKey: 'endpoints', fetch: (c, ns) => window.kubectl.getEndpoints(c, ns), namespaced: true,
        searchFields: (r: KubeEndpoints) => [
            r.metadata.name,
            r.metadata.namespace,
            ...r.subsets?.flatMap(s => s.addresses?.map(a => a.ip) ?? []) ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    configmaps: {
        stateKey: 'configmaps', fetch: (c, ns) => window.kubectl.getConfigMaps(c, ns), namespaced: true,
        searchFields: (r: KubeConfigMap) => [
            r.metadata.name,
            r.metadata.namespace,
            ...Object.keys(r.data ?? {}),
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    secrets: {
        stateKey: 'secrets', fetch: (c, ns) => window.kubectl.getSecrets(c, ns), namespaced: true,
        searchFields: (r: KubeSecret) => [
            r.metadata.name,
            r.metadata.namespace,
            r.type,
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    pvcs: {
        stateKey: 'pvcs', fetch: (c, ns) => window.kubectl.getPVCs(c, ns), namespaced: true,
        searchFields: (r: KubePVC) => [
            r.metadata.name,
            r.metadata.namespace,
            r.status?.phase,
            r.spec?.storageClassName,
            r.spec?.volumeName,
            r.spec?.volumeMode,
            ...r.spec?.accessModes ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    serviceaccounts: {
        stateKey: 'serviceaccounts', fetch: (c, ns) => window.kubectl.getServiceAccounts(c, ns), namespaced: true,
        searchFields: (r: KubeServiceAccount) => [
            r.metadata.name,
            r.metadata.namespace,
            ...r.secrets?.map(s => s.name) ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    roles: {
        stateKey: 'roles', fetch: (c, ns) => window.kubectl.getRoles(c, ns), namespaced: true,
        searchFields: (r: KubeRole) => [
            r.metadata.name,
            r.metadata.namespace,
            ...r.rules?.flatMap(rule => rule.resources ?? []) ?? [],
            ...r.rules?.flatMap(rule => rule.verbs) ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    rolebindings: {
        stateKey: 'rolebindings', fetch: (c, ns) => window.kubectl.getRoleBindings(c, ns), namespaced: true,
        searchFields: (r: KubeRoleBinding) => [
            r.metadata.name,
            r.metadata.namespace,
            r.roleRef?.name,
            r.roleRef?.kind,
            ...r.subjects?.map(s => s.name) ?? [],
            ...r.subjects?.map(s => s.kind) ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    events: {
        stateKey: 'events', fetch: (c, ns) => window.kubectl.getEvents(c, ns), namespaced: true,
        searchFields: (r: KubeEvent) => [
            r.metadata.name,
            r.metadata.namespace,
            r.reason,
            r.message,
            r.involvedObject?.name,
            r.involvedObject?.kind,
            r.type,
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    nodes: {
        stateKey: 'nodes', fetch: (c, _) => window.kubectl.getNodes(c), namespaced: false,
        searchFields: (r: KubeNode) => [
            r.metadata.name,
            r.status?.nodeInfo?.kubeletVersion,
            r.status?.nodeInfo?.osImage,
            r.status?.nodeInfo?.containerRuntimeVersion,
            r.status?.nodeInfo?.architecture,
            ...r.status?.addresses?.map(a => a.address) ?? [],
            ...Object.keys(r.metadata.labels ?? {})
                .filter(k => k.startsWith('node-role.kubernetes.io/'))
                .map(k => k.replace('node-role.kubernetes.io/', '')),
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    namespaces: {
        stateKey: 'namespaces', fetch: (c, _) => window.kubectl.getNamespaces(c), namespaced: false,
        searchFields: (r: KubeNamespace) => [
            r.metadata.name,
            r.status?.phase,
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    crds: {
        stateKey: 'crds', fetch: (c, _) => window.kubectl.getCRDs(c), namespaced: false,
        searchFields: (r: KubeCRD) => [
            r.metadata.name,
            r.spec?.group,
            r.spec?.names?.kind,
            r.spec?.names?.plural,
            r.spec?.names?.singular,
            r.spec?.scope,
            ...r.spec?.names?.shortNames ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    ingressclasses: {
        stateKey: 'ingressclasses', fetch: (c, _) => window.kubectl.getIngressClasses(c), namespaced: false,
        searchFields: (r: KubeIngressClass) => [
            r.metadata.name,
            r.spec?.controller,
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    pvs: {
        stateKey: 'pvs', fetch: (c, _) => window.kubectl.getPVs(c), namespaced: false,
        searchFields: (r: KubePV) => [
            r.metadata.name,
            r.status?.phase,
            r.spec?.storageClassName,
            r.spec?.persistentVolumeReclaimPolicy,
            r.spec?.volumeMode,
            r.spec?.claimRef?.name,
            r.spec?.claimRef?.namespace,
            ...r.spec?.accessModes ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    storageclasses: {
        stateKey: 'storageclasses', fetch: (c, _) => window.kubectl.getStorageClasses(c), namespaced: false,
        searchFields: (r: KubeStorageClass) => [
            r.metadata.name,
            r.provisioner,
            r.reclaimPolicy,
            r.volumeBindingMode,
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    clusterroles: {
        stateKey: 'clusterroles', fetch: (c, _) => window.kubectl.getClusterRoles(c), namespaced: false,
        searchFields: (r: KubeClusterRole) => [
            r.metadata.name,
            ...r.rules?.flatMap(rule => rule.resources ?? []) ?? [],
            ...r.rules?.flatMap(rule => rule.verbs) ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
    clusterrolebindings: {
        stateKey: 'clusterrolebindings', fetch: (c, _) => window.kubectl.getClusterRoleBindings(c), namespaced: false,
        searchFields: (r: KubeClusterRoleBinding) => [
            r.metadata.name,
            r.roleRef?.name,
            r.roleRef?.kind,
            ...r.subjects?.map(s => s.name) ?? [],
            ...r.subjects?.map(s => s.kind) ?? [],
            ...labelsToStrings(r.metadata.labels),
        ],
    },
}

// Pre-computed reset object for all resource sections (empty arrays).
// Import this in clusterSlice to clear resource lists on context switch.
// Note: deniedSections is reset separately in clusterSlice alongside other cross-cutting state.
export const sectionClearState: Record<string, any> = {
    ...Object.fromEntries(Object.values(SECTION_CONFIG).map(c => [c!.stateKey, []])),
    sectionLoadedAt: {},
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
    ResourceQuota: 'resourcequotas',
    LimitRange: 'limitranges',
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
        resourcequotas: 'resourcequota', limitranges: 'limitrange',
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
