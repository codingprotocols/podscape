import { ResourceKind } from './types/ui'

// ─── Sections ─────────────────────────────────────────────────────────────────

/** Sections that show a list + detail panel */
export const LIST_SECTIONS: ResourceKind[] = [
  'pods', 'deployments', 'daemonsets', 'statefulsets', 'replicasets',
  'jobs', 'cronjobs', 'hpas', 'pdbs',
  'services', 'ingresses', 'ingressclasses', 'networkpolicies', 'endpoints',
  'configmaps', 'secrets',
  'pvcs', 'pvs', 'storageclasses',
  'serviceaccounts', 'roles', 'clusterroles', 'rolebindings', 'clusterrolebindings',
  'nodes', 'namespaces', 'crds'
]

/** Cluster-scoped sections (show "cluster-wide" subtitle instead of namespace) */
export const CLUSTER_SCOPED_SECTIONS = new Set<ResourceKind>([
  'nodes', 'namespaces', 'crds', 'pvs', 'storageclasses',
  'clusterroles', 'clusterrolebindings', 'ingressclasses',
])

/** Provider-specific sections — conditionally shown based on cluster detection */
export const PROVIDER_SECTIONS = new Set<ResourceKind>([
  'istio-virtualservices', 'istio-destinationrules', 'istio-gateways',
  'istio-serviceentries', 'istio-peerauth', 'istio-authpolicies', 'istio-requestauth',
  'traefik-ingressroutes', 'traefik-ingressroutestcp', 'traefik-ingressroutesudp',
  'traefik-middlewares', 'traefik-middlewaretcps', 'traefik-services',
  'traefik-tlsoptions', 'traefik-tlsstores', 'traefik-serverstransporttcps',
  'nginx-virtualservers', 'nginx-virtualserverroutes', 'nginx-policies', 'nginx-transportservers',
])

// ─── Labels ───────────────────────────────────────────────────────────────────

export const SECTION_LABELS: Record<string, string> = {
  pods: 'Pods',
  deployments: 'Deployments',
  daemonsets: 'DaemonSets',
  statefulsets: 'StatefulSets',
  replicasets: 'ReplicaSets',
  jobs: 'Jobs',
  cronjobs: 'CronJobs',
  hpas: 'HorizontalPodAutoscalers',
  pdbs: 'PodDisruptionBudgets',
  services: 'Services',
  ingresses: 'Ingresses',
  ingressclasses: 'IngressClasses',
  networkpolicies: 'NetworkPolicies',
  endpoints: 'Endpoints',
  configmaps: 'ConfigMaps',
  secrets: 'Secrets',
  pvcs: 'PersistentVolumeClaims',
  pvs: 'PersistentVolumes',
  storageclasses: 'StorageClasses',
  serviceaccounts: 'ServiceAccounts',
  roles: 'Roles',
  clusterroles: 'ClusterRoles',
  rolebindings: 'RoleBindings',
  clusterrolebindings: 'ClusterRoleBindings',
  nodes: 'Nodes',
  namespaces: 'Namespaces',
  crds: 'CRDs'
}

// ─── Columns ──────────────────────────────────────────────────────────────────

export const COLUMNS: Record<string, string[]> = {
  pods: ['Name', 'Status', 'Restarts', 'Node', 'Age'],
  deployments: ['Name', 'Ready', 'Strategy', 'Age'],
  daemonsets: ['Name', 'Desired', 'Ready', 'Available', 'Update Strategy', 'Age'],
  statefulsets: ['Name', 'Ready', 'Service', 'Age'],
  replicasets: ['Name', 'Ready', 'Age'],
  jobs: ['Name', 'Status', 'Completions', 'Age'],
  cronjobs: ['Name', 'Schedule', 'Status', 'Age'],
  hpas: ['Name', 'Target', 'Min', 'Max', 'Current/Desired', 'Age'],
  pdbs: ['Name', 'Min Available', 'Max Unavailable', 'Healthy/Expected', 'Age'],
  services: ['Name', 'Type', 'Cluster IP', 'External IP', 'Ports'],
  ingresses: ['Name', 'Hosts', 'Address', 'Class'],
  ingressclasses: ['Name', 'Controller', 'Default', 'Age'],
  networkpolicies: ['Name', 'Pod Selector', 'Policy Types', 'Age'],
  endpoints: ['Name', 'Addresses', 'Ports', 'Age'],
  configmaps: ['Name', 'Keys', 'Age'],
  secrets: ['Name', 'Type', 'Keys', 'Age'],
  pvcs: ['Name', 'Phase', 'Capacity', 'Access Modes', 'Storage Class', 'Age'],
  pvs: ['Name', 'Phase', 'Capacity', 'Reclaim Policy', 'Storage Class', 'Age'],
  storageclasses: ['Name', 'Provisioner', 'Reclaim Policy', 'Binding Mode', 'Age'],
  serviceaccounts: ['Name', 'Secrets', 'Age'],
  roles: ['Name', 'Rules', 'Age'],
  clusterroles: ['Name', 'Rules', 'Age'],
  rolebindings: ['Name', 'Role', 'Subjects', 'Age'],
  clusterrolebindings: ['Name', 'Role', 'Subjects', 'Age'],
  nodes: ['Name', 'Status', 'Instance Type', 'Node Pool', 'Capacity', 'CPU', 'Memory', 'IP', 'Age'],
  namespaces: ['Name', 'Status', 'Age'],
  crds: ['Name', 'Group', 'Scope', 'Age']
}
