import { StateCreator } from 'zustand'
import {
    KubeContextEntry, KubeNamespace, KubePod, KubeDeployment, KubeDaemonSet, KubeStatefulSet,
    KubeReplicaSet, KubeJob, KubeCronJob, KubeHPA, KubePDB,
    KubeService, KubeIngress, KubeIngressClass, KubeNetworkPolicy, KubeEndpoints,
    KubeConfigMap, KubeSecret, KubePVC, KubePV, KubeStorageClass,
    KubeServiceAccount, KubeRole, KubeClusterRole, KubeRoleBinding, KubeClusterRoleBinding,
    KubeNode, KubeEvent, KubeCRD,
    NodeMetrics, PodMetrics, ResourceKind, AnyKubeResource, PortForwardEntry,
    HelmRelease, DebugPodEntry, AppGroup, OwnerChainResponse, ProviderSet
} from '../types'
import { AnalysisSlice } from './slices/analysisSlice'
import { ProvidersSlice } from './slices/providersSlice'

declare global {
    interface Window {
        kubectl: {
            getContexts: () => Promise<KubeContextEntry[]>
            getCurrentContext: () => Promise<string>
            switchContext: (context: string) => Promise<void>
            getNamespaces: (context: string) => Promise<KubeNamespace[]>
            getPods: (context: string, namespace: string | null) => Promise<KubePod[]>
            getDeployments: (context: string, namespace: string | null) => Promise<KubeDeployment[]>
            getDaemonSets: (context: string, namespace: string | null) => Promise<KubeDaemonSet[]>
            getStatefulSets: (context: string, namespace: string | null) => Promise<KubeStatefulSet[]>
            getReplicaSets: (context: string, namespace: string | null) => Promise<KubeReplicaSet[]>
            getJobs: (context: string, namespace: string | null) => Promise<KubeJob[]>
            getCronJobs: (context: string, namespace: string | null) => Promise<KubeCronJob[]>
            getHPAs: (context: string, namespace: string | null) => Promise<KubeHPA[]>
            getPodDisruptionBudgets: (context: string, namespace: string | null) => Promise<KubePDB[]>
            getServices: (context: string, namespace: string | null) => Promise<KubeService[]>
            getIngresses: (context: string, namespace: string | null) => Promise<KubeIngress[]>
            getCustomResource: (context: string, namespace: string | null, crdName: string) => Promise<unknown[]>
            getIngressClasses: (context: string) => Promise<KubeIngressClass[]>
            getNetworkPolicies: (context: string, namespace: string | null) => Promise<KubeNetworkPolicy[]>
            getEndpoints: (context: string, namespace: string | null) => Promise<KubeEndpoints[]>
            getConfigMaps: (context: string, namespace: string | null) => Promise<KubeConfigMap[]>
            getSecrets: (context: string, namespace: string | null) => Promise<KubeSecret[]>
            getPVCs: (context: string, namespace: string | null) => Promise<KubePVC[]>
            getPVs: (context: string) => Promise<KubePV[]>
            getStorageClasses: (context: string) => Promise<KubeStorageClass[]>
            getServiceAccounts: (context: string, namespace: string | null) => Promise<KubeServiceAccount[]>
            getRoles: (context: string, namespace: string | null) => Promise<KubeRole[]>
            getClusterRoles: (context: string) => Promise<KubeClusterRole[]>
            getRoleBindings: (context: string, namespace: string | null) => Promise<KubeRoleBinding[]>
            getClusterRoleBindings: (context: string) => Promise<KubeClusterRoleBinding[]>
            getNodes: (context: string) => Promise<KubeNode[]>
            getCRDs: (context: string) => Promise<KubeCRD[]>
            getEvents: (context: string, namespace: string | null) => Promise<KubeEvent[]>
            getPodMetrics: (context: string, namespace: string | null) => Promise<PodMetrics[]>
            getNodeMetrics: (context: string) => Promise<NodeMetrics[]>
            createDebugPod: (context: string, namespace: string, image: string, name: string) => Promise<void>
            scale: (context: string, namespace: string, name: string, replicas: number) => Promise<string>
            scaleResource: (context: string, namespace: string, kind: string, name: string, replicas: number) => Promise<string>
            rolloutRestart: (context: string, namespace: string, kind: string, name: string) => Promise<string>
            rolloutHistory: (context: string, namespace: string, kind: string, name: string) => Promise<string>
            rolloutUndo: (context: string, namespace: string, kind: string, name: string, revision?: number) => Promise<string>
            getResourceEvents: (context: string, namespace: string, kind: string, name: string) => Promise<KubeEvent[]>
            cordonNode: (context: string, name: string, unschedulable: boolean) => Promise<void>
            drainNode: (context: string, name: string) => Promise<void>
            deleteResource: (context: string, namespace: string | null, kind: string, name: string) => Promise<string>
            getYAML: (context: string, namespace: string | null, kind: string, name: string) => Promise<string>
            getSecretValue: (context: string, namespace: string, name: string, key: string) => Promise<string>
            execCommand: (context: string, namespace: string, pod: string, container: string, command: string[]) => Promise<{ stdout: string; exitCode: number }>
            applyYAML: (context: string, yaml: string) => Promise<string>
            copyToContainer: (context: string, namespace: string, pod: string, container: string, localPath: string, remotePath: string) => Promise<void>
            copyFromContainer: (context: string, namespace: string, pod: string, container: string, remotePath: string, localPath: string) => Promise<void>
            streamLogs: (
                context: string, namespace: string, pod: string, container: string | undefined,
                onChunk: (chunk: string) => void, onEnd: () => void
            ) => Promise<string>
            stopLogs: (streamId: string) => Promise<void>
            cancelAllStreams: () => Promise<void>
            portForward: (context: string, namespace: string, type: string, name: string, localPort: number, remotePort: number, id: string) => Promise<string>
            stopPortForward: (id: string) => Promise<void>
            onPortForwardReady: (id: string, cb: (msg: string) => void) => () => void
            onPortForwardError: (id: string, cb: (msg: string) => void) => () => void
            onPortForwardExit: (id: string, cb: () => void) => () => void
            scanSecurity: () => Promise<any>
            scanKubesecBatch: (resources: any[]) => Promise<any[]>
            scanTrivyImages: (workloads: any[]) => Promise<any>
            onSecurityProgress: (cb: (line: string) => void) => () => void
            prometheusStatus: (url?: string) => Promise<{ available: boolean; error?: string }>
            prometheusQueryBatch: (queries: Array<{ query: string; label: string }>, start: number, end: number) => Promise<Array<{ label: string; points: Array<{ t: number; v: number }>; error?: string }>>
            getOwnerChain: (kind: string, name: string, namespace: string) => Promise<OwnerChainResponse>
            getTLSCerts: (namespace?: string) => Promise<any[]>
            getGitOps: (namespace?: string) => Promise<any>
            getProviders: () => Promise<ProviderSet>
        }
        helm: {
            list: (context: string) => Promise<HelmRelease[]>
            status: (context: string, namespace: string, release: string) => Promise<string>
            values: (context: string, namespace: string, release: string) => Promise<string>
            history: (context: string, namespace: string, release: string) => Promise<unknown[]>
            rollback: (context: string, namespace: string, release: string, revision: number) => Promise<string>
            uninstall: (context: string, namespace: string, release: string) => Promise<string>
            repoList: () => Promise<Array<{ name: string; url: string }>>
            repoSearch: (query: string, limit: number, offset: number) => Promise<{ charts: Array<{ name: string; repo: string; description: string; version: string; appVersion: string }>; total: number }>
            repoVersions: (repoName: string, chartName: string) => Promise<Array<{ version: string; appVersion: string; description: string }>>
            repoValues: (repoName: string, chartName: string, version: string) => Promise<string>
            repoRefresh: () => Promise<void>
            install: (chart: string, version: string, releaseName: string, namespace: string, values: string, context: string) => Promise<void>
            onInstallProgress: (cb: (msg: string) => void) => () => void
            onRefreshProgress: (cb: (msg: string) => void) => () => void
        }
        exec: {
            start: (context: string, namespace: string, pod: string, container: string) => Promise<string>
            write: (id: string, data: string) => Promise<void>
            resize: (id: string, cols: number, rows: number) => Promise<void>
            kill: (id: string) => Promise<void>
            onData: (id: string, cb: (data: string) => void) => () => void
            onExit: (id: string, cb: () => void) => () => void
        }
        settings: {
            get: () => Promise<{ shellPath: string; theme: string; kubeconfigPath: string; prodContexts: string[]; prometheusUrls?: Record<string, string> }>
            set: (s: { shellPath: string; theme: string; kubeconfigPath: string; prodContexts: string[]; prometheusUrls?: Record<string, string> }) => Promise<void>
            checkTools: () => Promise<{ kubeconfigOk: boolean; trivyOk: boolean }>
        }
        kubeconfig: {
            get: () => Promise<{ path: string; content: string }>
            set: (content: string) => Promise<void>
            reveal: () => Promise<void>
            selectPath: () => Promise<string | null>
            clearPath: () => Promise<void>
        }
        dialog: {
            showOpenFile: () => Promise<string | null>
            showSaveFile: (defaultName: string) => Promise<string | null>
        }
    }
}

export interface CustomScanOptions {
    /** Namespaces to scan; empty array = all loaded namespaces */
    namespaces: string[]
    /** Resource kinds to include (e.g. "Pod", "Deployment"); empty = all */
    kinds: string[]
    runTrivy: boolean
    runKubesec: boolean
    /** Images selected in the pre-scan picker. Present when trivy runs per-image. */
    selectedImages?: string[]
}

export interface ExecTarget {
    pod: string
    container: string
    namespace: string
}

export interface ExecSession {
    id: string
    target: ExecTarget
}

export interface AppStore extends AnalysisSlice, ProvidersSlice {
    // Navigation
    section: ResourceKind
    setSection: (s: ResourceKind) => void
    navWidth: number
    setNavWidth: (w: number) => void
    detailWidth: number
    setDetailWidth: (w: number) => void
    theme: 'light' | 'dark'
    setTheme: (theme: 'light' | 'dark') => void
    toggleTheme: () => void
    searchQuery: string
    setSearchQuery: (q: string) => void
    isSearchOpen: boolean
    setSearchOpen: (open: boolean) => void

    // Cluster selection
    contexts: KubeContextEntry[]
    selectedContext: string | null
    starredContext: string | null
    setStarredContext: (name: string | null) => void
    hotbarContexts: string[]
    toggleHotbarContext: (name: string) => void
    namespaces: KubeNamespace[]
    selectedNamespace: string | null
    selectedResource: AnyKubeResource | null
    kubeconfigOk: boolean
    prodContexts: string[]
    setProdContexts: (contexts: string[]) => Promise<void>
    isProduction: boolean
    contextSwitchStatus: string | null
    resourceHistory: AnyKubeResource[]
    apps: AppGroup[]

    // Resources
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
    portForwards: PortForwardEntry[]
    helmReleases: HelmRelease[]
    debugPods: DebugPodEntry[]
    securityScanResults: any | null
    securityScanning: boolean
    securityScanProgressLines: string[]
    // Map of "namespace/name/kind" → KubesecBatchItem from /security/kubesec/batch
    kubesecBatchResults: Record<string, any> | null
    trivyAvailable: boolean | null
    lastPreloadedAt: number
    lastDashboardLoadedAt: number
    addDebugPod: (pod: DebugPodEntry) => void
    removeDebugPod: (name: string) => void
    updateDebugPod: (name: string, updates: Partial<DebugPodEntry>) => void

    // Terminal session
    execSessions: ExecSession[]
    activeExecId: string | null
    openExec: (target: ExecTarget) => void
    setActiveExecId: (id: string) => void
    closeExec: () => void

    // Loading / errors
    loadingContexts: boolean
    loadingNamespaces: boolean
    loadingResources: boolean
    error: string | null
    setError: (err: string | null) => void
    clearError: () => void

    // Actions
    init: () => Promise<void>
    selectContext: (name: string) => Promise<void>
    selectNamespace: (name: string) => void
    selectResource: (r: AnyKubeResource | null) => void
    deniedSections: Set<ResourceKind>
    loadSection: (section: ResourceKind) => Promise<void>
    loadDashboard: () => Promise<void>
    refresh: () => Promise<void>
    preloadSearchResources: () => Promise<void>
    scanSecurity: (options?: CustomScanOptions) => Promise<void>

    // Operations
    scaleDeployment: (name: string, replicas: number, namespace?: string) => Promise<void>
    scaleStatefulSet: (name: string, replicas: number, namespace?: string) => Promise<void>
    rolloutRestart: (kind: string, name: string, namespace?: string) => Promise<void>
    deleteResource: (kind: string, name: string, clusterScoped?: boolean, namespace?: string) => Promise<void>
    getYAML: (kind: string, name: string, clusterScoped?: boolean, namespace?: string) => Promise<string>
    getSecretValue: (name: string, key: string, namespace?: string) => Promise<string>
    applyYAML: (yaml: string) => Promise<string>

    // Port forwarding
    startPortForward: (entry: PortForwardEntry) => void
    stopPortForward: (id: string) => void

    // Prometheus
    prometheusAvailable: boolean | null
    prometheusProbeError: string | null
    prometheusTimeRange: { start: number; end: number }
    prometheusActivePreset: '1h' | '6h' | '24h' | '7d'
    setPrometheusTimeRange: (range: { start: number; end: number }, preset?: '1h' | '6h' | '24h' | '7d') => void
    probePrometheus: () => Promise<void>
    disconnectPrometheus: () => void

    // Owner chains — keyed by resource UID
    ownerChains: Record<string, OwnerChainResponse>

    // Navigation
    navigateToResource: (kind: string, name: string, namespace: string) => void
}

export type StoreSlice<T> = StateCreator<AppStore, [], [], T>
