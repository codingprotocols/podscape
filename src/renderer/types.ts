// ─── Common ───────────────────────────────────────────────────────────────────

export interface KubeResource {
  apiVersion?: string
  kind?: string
  metadata: ObjectMeta
}

export interface ObjectMeta {
  name: string
  namespace?: string
  uid: string
  creationTimestamp: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  ownerReferences?: Array<{ apiVersion: string; kind: string; name: string; uid: string }>
  resourceVersion?: string
  generation?: number
}

export interface KubeCondition {
  type: string
  status: string
  reason?: string
  message?: string
  lastTransitionTime?: string
  lastUpdateTime?: string
}

// ─── Context / Config ─────────────────────────────────────────────────────────

export interface KubeContextEntry {
  name: string
  context: { cluster: string; user: string; namespace?: string }
}

// ─── Namespace ────────────────────────────────────────────────────────────────

export interface KubeNamespace extends KubeResource {
  status: { phase: string }
}

// ─── Pod ──────────────────────────────────────────────────────────────────────

export type PodPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'

export interface ContainerStatus {
  name: string
  ready: boolean
  restartCount: number
  state: {
    running?: { startedAt: string }
    waiting?: { reason: string; message?: string }
    terminated?: { exitCode: number; reason?: string; message?: string; startedAt?: string; finishedAt?: string; containerID?: string }
  }
  lastState?: {
    running?: { startedAt: string }
    waiting?: { reason: string; message?: string }
    terminated?: { exitCode: number; reason?: string; message?: string; startedAt?: string; finishedAt?: string; containerID?: string }
  }
  image: string
  imageID: string
  containerID?: string
}

export interface PodCondition extends KubeCondition {
  lastTransitionTime: string
}

export interface PodStatus {
  phase: PodPhase
  conditions?: PodCondition[]
  podIP?: string
  podIPs?: Array<{ ip: string }>
  hostIP?: string
  startTime?: string
  containerStatuses?: ContainerStatus[]
  initContainerStatuses?: ContainerStatus[]
  message?: string
  reason?: string
  nominatedNodeName?: string
  qosClass?: string
}

export interface ContainerSpec {
  name: string
  image: string
  ports?: Array<{ containerPort: number; protocol?: string; name?: string }>
  resources?: {
    requests?: Record<string, string>
    limits?: Record<string, string>
  }
  env?: Array<{ name: string; value?: string; valueFrom?: unknown }>
  volumeMounts?: Array<{ name: string; mountPath: string; readOnly?: boolean }>
}

export interface PodSpec {
  nodeName?: string
  serviceAccountName?: string
  containers: ContainerSpec[]
  initContainers?: ContainerSpec[]
  restartPolicy?: string
  terminationGracePeriodSeconds?: number
  schedulerName?: string
  priority?: number
  volumes?: Array<{ name: string;[key: string]: unknown }>
}

export interface KubePod extends KubeResource {
  spec: PodSpec
  status: PodStatus
}

// ─── Deployment ───────────────────────────────────────────────────────────────

export interface KubeDeployment extends KubeResource {
  metadata: ObjectMeta
  spec: {
    replicas?: number
    selector: { matchLabels?: Record<string, string> }
    template: { metadata: Partial<ObjectMeta>; spec: PodSpec }
    strategy?: {
      type?: string
      rollingUpdate?: { maxSurge?: string | number; maxUnavailable?: string | number }
    }
  }
  status: {
    replicas?: number
    readyReplicas?: number
    availableReplicas?: number
    updatedReplicas?: number
    unavailableReplicas?: number
    conditions?: KubeCondition[]
  }
}

// ─── StatefulSet ──────────────────────────────────────────────────────────────

export interface KubeStatefulSet extends KubeResource {
  metadata: ObjectMeta
  spec: {
    replicas?: number
    selector: { matchLabels?: Record<string, string> }
    serviceName: string
    template: { metadata: Partial<ObjectMeta>; spec: PodSpec }
    updateStrategy?: { type?: 'RollingUpdate' | 'OnDelete'; rollingUpdate?: { partition?: number } }
  }
  status: {
    replicas: number
    readyReplicas?: number
    currentReplicas?: number
    updatedReplicas?: number
    availableReplicas?: number
    conditions?: KubeCondition[]
  }
}

// ─── ReplicaSet ───────────────────────────────────────────────────────────────

export interface KubeReplicaSet extends KubeResource {
  metadata: ObjectMeta
  spec: { replicas?: number; selector: { matchLabels?: Record<string, string> } }
  status: {
    replicas: number
    readyReplicas?: number
    availableReplicas?: number
    conditions?: KubeCondition[]
  }
}

// ─── Job ──────────────────────────────────────────────────────────────────────

export interface KubeJob extends KubeResource {
  metadata: ObjectMeta
  spec: {
    completions?: number
    parallelism?: number
    backoffLimit?: number
    template: { spec: PodSpec }
  }
  status: {
    active?: number
    succeeded?: number
    failed?: number
    startTime?: string
    completionTime?: string
    conditions?: KubeCondition[]
  }
}

// ─── CronJob ──────────────────────────────────────────────────────────────────

export interface KubeCronJob extends KubeResource {
  metadata: ObjectMeta
  spec: {
    schedule: string
    suspend?: boolean
    concurrencyPolicy?: string
    jobTemplate: { spec: KubeJob['spec'] }
    successfulJobsHistoryLimit?: number
    failedJobsHistoryLimit?: number
  }
  status: {
    active?: Array<{ name: string; namespace: string }>
    lastScheduleTime?: string
    lastSuccessfulTime?: string
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export interface ServicePort {
  name?: string
  port: number
  targetPort?: number | string
  protocol?: string
  nodePort?: number
}

export interface KubeService extends KubeResource {
  metadata: ObjectMeta
  spec: {
    type?: string
    clusterIP?: string
    clusterIPs?: string[]
    externalIPs?: string[]
    loadBalancerIP?: string
    ports?: ServicePort[]
    selector?: Record<string, string>
    sessionAffinity?: string
    externalTrafficPolicy?: string
  }
  status: {
    loadBalancer?: { ingress?: Array<{ ip?: string; hostname?: string }> }
  }
}

// ─── Ingress ──────────────────────────────────────────────────────────────────

export interface KubeIngress extends KubeResource {
  metadata: ObjectMeta
  spec: {
    ingressClassName?: string
    rules?: Array<{
      host?: string
      http?: {
        paths: Array<{
          path?: string
          pathType?: string
          backend: { service?: { name: string; port: { number?: number; name?: string } } }
        }>
      }
    }>
    tls?: Array<{ hosts?: string[]; secretName?: string }>
  }
  status: { loadBalancer?: { ingress?: Array<{ ip?: string; hostname?: string }> } }
}

// ─── Node ─────────────────────────────────────────────────────────────────────

export interface NodeCondition extends KubeCondition {
  lastHeartbeatTime?: string
}

export interface KubeNode extends KubeResource {
  metadata: ObjectMeta
  spec: {
    podCIDR?: string
    podCIDRs?: string[]
    taints?: Array<{ key: string; value?: string; effect: string }>
    unschedulable?: boolean
  }
  status: {
    capacity?: Record<string, string>
    allocatable?: Record<string, string>
    conditions?: NodeCondition[]
    nodeInfo?: {
      machineID: string
      kernelVersion: string
      osImage: string
      containerRuntimeVersion: string
      kubeletVersion: string
      architecture: string
      operatingSystem: string
    }
    addresses?: Array<{ type: string; address: string }>
  }
}

// ─── ConfigMap ────────────────────────────────────────────────────────────────

export interface KubeConfigMap extends KubeResource {
  metadata: ObjectMeta
  data?: Record<string, string>
  binaryData?: Record<string, string>
}

// ─── Secret ───────────────────────────────────────────────────────────────────

export interface KubeSecret extends KubeResource {
  metadata: ObjectMeta
  type?: string
  data?: Record<string, string>
}

// ─── Event ────────────────────────────────────────────────────────────────────

export interface KubeEvent extends KubeResource {
  metadata: ObjectMeta
  involvedObject: {
    kind: string
    namespace?: string
    name: string
    uid?: string
    apiVersion?: string
    fieldPath?: string
  }
  reason?: string
  message?: string
  type?: string
  source?: { component?: string; host?: string }
  firstTimestamp?: string
  lastTimestamp?: string
  eventTime?: string
  count?: number
  action?: string
  reportingComponent?: string
}

// ─── CRD ──────────────────────────────────────────────────────────────────────

export interface KubeCRD extends KubeResource {
  metadata: ObjectMeta
  spec: {
    group: string
    names: { plural: string; singular: string; kind: string; shortNames?: string[] }
    scope: string
    versions: Array<{ name: string; served: boolean; storage: boolean }>
  }
  status?: {
    conditions?: KubeCondition[]
  }
}

// ─── DaemonSet ────────────────────────────────────────────────────────────────

export interface KubeDaemonSet extends KubeResource {
  metadata: ObjectMeta
  spec: {
    selector: { matchLabels?: Record<string, string> }
    template: { metadata: Partial<ObjectMeta>; spec: PodSpec }
    updateStrategy?: { type?: string; rollingUpdate?: { maxUnavailable?: number | string } }
  }
  status: {
    desiredNumberScheduled: number
    currentNumberScheduled: number
    numberReady: number
    updatedNumberScheduled?: number
    numberAvailable?: number
    numberUnavailable?: number
    conditions?: KubeCondition[]
  }
}

// ─── HorizontalPodAutoscaler ──────────────────────────────────────────────────

export interface KubeHPA extends KubeResource {
  metadata: ObjectMeta
  spec: {
    scaleTargetRef: { apiVersion?: string; kind: string; name: string }
    minReplicas?: number
    maxReplicas: number
    metrics?: Array<{ type: string;[key: string]: unknown }>
  }
  status: {
    currentReplicas: number
    desiredReplicas: number
    currentMetrics?: Array<{ type: string;[key: string]: unknown }>
    conditions?: KubeCondition[]
    lastScaleTime?: string
  }
}

// ─── PodDisruptionBudget ──────────────────────────────────────────────────────

export interface KubePDB extends KubeResource {
  metadata: ObjectMeta
  spec: {
    minAvailable?: number | string
    maxUnavailable?: number | string
    selector?: { matchLabels?: Record<string, string> }
  }
  status: {
    currentHealthy: number
    desiredHealthy: number
    disruptionsAllowed: number
    expectedPods: number
    conditions?: KubeCondition[]
  }
}

// ─── IngressClass ─────────────────────────────────────────────────────────────

export interface KubeIngressClass extends KubeResource {
  metadata: ObjectMeta
  spec: {
    controller?: string
    parameters?: {
      apiGroup?: string
      kind?: string
      name?: string
      namespace?: string
    }
  }
}

// ─── NetworkPolicy ────────────────────────────────────────────────────────────

export interface NetworkPolicyPort {
  protocol?: string
  port?: number | string
  endPort?: number
}

export interface NetworkPolicyPeer {
  podSelector?: { matchLabels?: Record<string, string> }
  namespaceSelector?: { matchLabels?: Record<string, string> }
  ipBlock?: { cidr: string; except?: string[] }
}

export interface NetworkPolicyIngressRule {
  from?: NetworkPolicyPeer[]
  ports?: NetworkPolicyPort[]
}

export interface NetworkPolicyEgressRule {
  to?: NetworkPolicyPeer[]
  ports?: NetworkPolicyPort[]
}

export interface KubeNetworkPolicy extends KubeResource {
  metadata: ObjectMeta
  spec: {
    podSelector: { matchLabels?: Record<string, string> }
    policyTypes?: string[]
    ingress?: NetworkPolicyIngressRule[]
    egress?: NetworkPolicyEgressRule[]
  }
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

export interface KubeEndpoints extends KubeResource {
  metadata: ObjectMeta
  subsets?: Array<{
    addresses?: Array<{ ip: string; nodeName?: string; targetRef?: { kind: string; name: string } }>
    notReadyAddresses?: Array<{ ip: string; nodeName?: string; targetRef?: { kind: string; name: string } }>
    ports?: Array<{ name?: string; port: number; protocol?: string }>
  }>
}

// ─── PersistentVolumeClaim ────────────────────────────────────────────────────

export interface KubePVC extends KubeResource {
  metadata: ObjectMeta
  spec: {
    accessModes?: string[]
    storageClassName?: string
    volumeName?: string
    resources?: { requests?: Record<string, string> }
    volumeMode?: string
  }
  status: {
    phase?: string
    capacity?: Record<string, string>
    accessModes?: string[]
    conditions?: KubeCondition[]
  }
}

// ─── PersistentVolume ─────────────────────────────────────────────────────────

export interface KubePV extends KubeResource {
  metadata: ObjectMeta
  spec: {
    capacity?: Record<string, string>
    accessModes?: string[]
    persistentVolumeReclaimPolicy?: string
    storageClassName?: string
    volumeMode?: string
    claimRef?: { name?: string; namespace?: string }
    [key: string]: unknown
  }
  status: { phase?: string; reason?: string; conditions?: KubeCondition[] }
}

// ─── StorageClass ─────────────────────────────────────────────────────────────

export interface KubeStorageClass extends KubeResource {
  metadata: ObjectMeta
  provisioner: string
  reclaimPolicy?: string
  volumeBindingMode?: string
  allowVolumeExpansion?: boolean
  parameters?: Record<string, string>
}

// ─── ServiceAccount ───────────────────────────────────────────────────────────

export interface KubeServiceAccount extends KubeResource {
  metadata: ObjectMeta
  secrets?: Array<{ name: string }>
  imagePullSecrets?: Array<{ name: string }>
  automountServiceAccountToken?: boolean
}

// ─── RBAC ─────────────────────────────────────────────────────────────────────

export interface PolicyRule {
  apiGroups?: string[]
  resources?: string[]
  verbs: string[]
  resourceNames?: string[]
  nonResourceURLs?: string[]
}

export interface KubeRole extends KubeResource {
  metadata: ObjectMeta
  rules?: PolicyRule[]
}

export interface KubeClusterRole extends KubeResource {
  metadata: ObjectMeta
  rules?: PolicyRule[]
  aggregationRule?: { clusterRoleSelectors?: Array<{ matchLabels?: Record<string, string> }> }
}

export interface RoleRef {
  apiGroup: string
  kind: string
  name: string
}

export interface Subject {
  kind: string
  name: string
  namespace?: string
  apiGroup?: string
}

export interface KubeRoleBinding extends KubeResource {
  metadata: ObjectMeta
  roleRef: RoleRef
  subjects?: Subject[]
}

export interface KubeClusterRoleBinding extends KubeResource {
  metadata: ObjectMeta
  roleRef: RoleRef
  subjects?: Subject[]
}

// ─── Port Forward ─────────────────────────────────────────────────────────────

export interface PortForwardEntry {
  id: string
  type: 'pod' | 'service'
  namespace: string
  name: string
  localPort: number
  remotePort: number
  status: 'starting' | 'active' | 'error' | 'stopped'
  error?: string
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface NodeMetrics {
  metadata: ObjectMeta
  timestamp: string
  window: string
  usage: { cpu: string; memory: string }
}

export interface PodMetrics {
  metadata: ObjectMeta
  timestamp: string
  window: string
  containers: Array<{ name: string; usage: { cpu: string; memory: string } }>
}

// ─── Helm ─────────────────────────────────────────────────────────────────────

export interface HelmRelease {
  name: string
  namespace: string
  revision: string
  updated: string
  status: string
  chart: string
  app_version: string
}

export interface HelmHistoryEntry {
  revision: number
  updated: string
  status: string
  chart: string
  app_version: string
  description: string
}



// ─── Owner Chain ──────────────────────────────────────────────────────────────

export interface OwnerRef {
  kind: string
  name: string
  namespace: string
  uid: string
  found: boolean
}

export interface OwnerChainResponse {
  ancestors: OwnerRef[]
  descendants: Record<string, OwnerRef[]>
}

// ─── Debug Pod ────────────────────────────────────────────────────────────────

export interface DebugPodEntry {
  name: string
  namespace: string
  image: string
  imageLabel: string
  launchedAt: Date
  status: 'creating' | 'running' | 'error'
  error?: string
}

export interface AppGroup {
  name: string
  namespace: string
  resources: AnyKubeResource[]
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export type ResourceKind =
  | 'unifiedlogs'
  | 'multi-terminal'
  | 'apps'
  | 'dashboard'
  | 'helm'
  | 'pods'
  | 'deployments'
  | 'daemonsets'
  | 'statefulsets'
  | 'replicasets'
  | 'jobs'
  | 'cronjobs'
  | 'hpas'
  | 'pdbs'
  | 'services'
  | 'ingresses'
  | 'ingressclasses'
  | 'networkpolicies'
  | 'endpoints'
  | 'portforwards'
  | 'configmaps'
  | 'secrets'
  | 'pvcs'
  | 'pvs'
  | 'storageclasses'
  | 'serviceaccounts'
  | 'roles'
  | 'clusterroles'
  | 'rolebindings'
  | 'clusterrolebindings'
  | 'nodes'
  | 'namespaces'
  | 'events'
  | 'crds'
  | 'metrics'
  | 'settings'
  | 'network'
  | 'connectivity'
  | 'debugpod'
  | 'security'
  | 'tls'
  | 'gitops'
  | 'cost'
  | 'helm'
  // Istio service mesh
  | 'istio-virtualservices'
  | 'istio-destinationrules'
  | 'istio-gateways'
  | 'istio-serviceentries'
  | 'istio-peerauth'
  | 'istio-authpolicies'
  | 'istio-requestauth'
  // Traefik
  | 'traefik-ingressroutes'
  | 'traefik-ingressroutestcp'
  | 'traefik-ingressroutesudp'
  | 'traefik-middlewares'
  | 'traefik-middlewaretcps'
  | 'traefik-services'
  | 'traefik-tlsoptions'
  | 'traefik-tlsstores'
  | 'traefik-serverstransporttcps'
  // NGINX Inc (kubernetes-ingress, CRD-based)
  | 'nginx-virtualservers'
  | 'nginx-virtualserverroutes'
  | 'nginx-policies'
  | 'nginx-transportservers'

// ─── Provider detection ───────────────────────────────────────────────────────

export interface ProviderSet {
  istio: boolean
  istioVersion?: string
  traefik: boolean
  traefikVersion?: string // "v2" | "v3"
  nginxInc: boolean       // kubernetes-ingress (NGINX Inc, CRD-based)
  nginxCommunity: boolean // ingress-nginx (community, annotation-based)
}

export type AnyKubeResource =
  | KubePod
  | KubeDeployment
  | KubeDaemonSet
  | KubeStatefulSet
  | KubeReplicaSet
  | KubeJob
  | KubeCronJob
  | KubeHPA
  | KubePDB
  | KubeService
  | KubeIngress
  | KubeIngressClass
  | KubeNetworkPolicy
  | KubeEndpoints
  | KubeConfigMap
  | KubeSecret
  | KubePVC
  | KubePV
  | KubeStorageClass
  | KubeServiceAccount
  | KubeRole
  | KubeClusterRole
  | KubeRoleBinding
  | KubeClusterRoleBinding
  | KubeNode
  | KubeNamespace
  | KubeCRD

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function podPhaseBg(phase: string): string {
  switch (phase) {
    case 'Running': return 'bg-green-500/20 text-green-300 ring-green-500/30'
    case 'Succeeded': return 'bg-blue-500/20 text-blue-300 ring-blue-500/30'
    case 'Pending': return 'bg-yellow-500/20 text-yellow-300 ring-yellow-500/30'
    case 'Failed': return 'bg-red-500/20 text-red-300 ring-red-500/30'
    default: return 'bg-gray-500/20 text-gray-300 ring-gray-500/30'
  }
}

export function totalRestarts(pod: KubePod): number {
  return (pod.status.containerStatuses ?? []).reduce((sum, cs) => sum + cs.restartCount, 0)
}

export function formatAge(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime()
  const s = Math.floor(diffMs / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function parseCpuMillicores(cpu: string): number {
  if (!cpu) return 0
  if (cpu.endsWith('n')) return parseInt(cpu) / 1_000_000
  if (cpu.endsWith('u')) return parseInt(cpu) / 1_000
  if (cpu.endsWith('m')) return parseInt(cpu)
  return parseFloat(cpu) * 1000
}

export function parseMemoryMiB(mem: string): number {
  if (!mem) return 0
  if (mem.endsWith('Ki')) return parseInt(mem) / 1024
  if (mem.endsWith('Mi')) return parseInt(mem)
  if (mem.endsWith('Gi')) return parseInt(mem) * 1024
  if (mem.endsWith('Ti')) return parseInt(mem) * 1024 * 1024
  if (mem.endsWith('k') || mem.endsWith('K')) return parseInt(mem) / 1024
  if (mem.endsWith('M')) return parseInt(mem)
  if (mem.endsWith('G')) return parseInt(mem) * 1024
  return parseInt(mem) / (1024 * 1024)
}

export function getNodeReady(node: KubeNode): boolean {
  return (node.status.conditions ?? []).some(c => c.type === 'Ready' && c.status === 'True')
}
