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
