import { ObjectMeta, KubeCondition } from './common'

export interface KubeResource {
  apiVersion?: string
  kind?: string
  metadata: ObjectMeta
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
  data?: Record<string, string>
  binaryData?: Record<string, string>
}

// ─── Secret ───────────────────────────────────────────────────────────────────

export interface KubeSecret extends KubeResource {
  type?: string
  data?: Record<string, string>
}

// ─── Event ────────────────────────────────────────────────────────────────────

export interface KubeEvent extends KubeResource {
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
  spec: {
    podSelector: { matchLabels?: Record<string, string> }
    policyTypes?: string[]
    ingress?: NetworkPolicyIngressRule[]
    egress?: NetworkPolicyEgressRule[]
  }
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

export interface KubeEndpoints extends KubeResource {
  subsets?: Array<{
    addresses?: Array<{ ip: string; nodeName?: string; targetRef?: { kind: string; name: string } }>
    notReadyAddresses?: Array<{ ip: string; nodeName?: string; targetRef?: { kind: string; name: string } }>
    ports?: Array<{ name?: string; port: number; protocol?: string }>
  }>
}

// ─── PersistentVolumeClaim ────────────────────────────────────────────────────

export interface KubePVC extends KubeResource {
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
  provisioner: string
  reclaimPolicy?: string
  volumeBindingMode?: string
  allowVolumeExpansion?: boolean
  parameters?: Record<string, string>
}

// ─── ServiceAccount ───────────────────────────────────────────────────────────

export interface KubeServiceAccount extends KubeResource {
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
  rules?: PolicyRule[]
}

export interface KubeClusterRole extends KubeResource {
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
  roleRef: RoleRef
  subjects?: Subject[]
}

export interface KubeClusterRoleBinding extends KubeResource {
  roleRef: RoleRef
  subjects?: Subject[]
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
