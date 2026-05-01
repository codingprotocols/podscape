interface BaseObjectMeta {
  name: string
  uid: string
  creationTimestamp: string
  deletionTimestamp?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  ownerReferences?: Array<{ apiVersion: string; kind: string; name: string; uid: string }>
  resourceVersion?: string
  generation?: number
}

// namespace is required (not optional) for namespace-scoped resources
export type NamespacedMeta = BaseObjectMeta & { namespace: string }

// namespace cannot appear on cluster-scoped resources
export type ClusterMeta = BaseObjectMeta & { namespace?: never }

// Backwards-compat union used by KubeResource base and any untyped callsites
export type ObjectMeta = NamespacedMeta | ClusterMeta

export interface KubeCondition {
  type: string
  status: string
  reason?: string
  message?: string
  lastTransitionTime?: string
  lastUpdateTime?: string
}
