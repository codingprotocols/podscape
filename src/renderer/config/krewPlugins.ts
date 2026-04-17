import type { KrewPlugin } from '../store/slices/krewSlice'

export const CURATED_PLUGINS: Omit<KrewPlugin, 'installed'>[] = [
  { name: 'neat',          version: '', short: 'Remove clutter from Kubernetes manifests to make them more readable' },
  { name: 'stern',         version: '', short: 'Multi pod and container log tailing' },
  { name: 'tree',          version: '', short: 'Show a tree of object hierarchies through ownerReferences' },
  { name: 'images',        version: '', short: 'Show container images used in the cluster' },
  { name: 'whoami',        version: '', short: 'Show the subject currently authenticated as' },
  { name: 'access-matrix', version: '', short: 'Display access rights for users in your cluster' },
  { name: 'view-secret',   version: '', short: 'Decode Kubernetes secrets without cluttering your terminal' },
  { name: 'node-shell',    version: '', short: 'Spawn a root shell on a node via a privileged pod' },
  { name: 'df-pv',         version: '', short: 'Show disk usage of PersistentVolumes' },
  { name: 'outdated',      version: '', short: 'Finds outdated container images running in a cluster' },
]
