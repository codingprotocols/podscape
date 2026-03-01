import React, { useMemo, useState } from 'react'
import { useAppStore } from '../store'
import type {
  KubePod, KubeDeployment, KubeDaemonSet, KubeStatefulSet, KubeReplicaSet, KubeJob, KubeCronJob,
  KubeHPA, KubePDB, KubeService, KubeIngress, KubeIngressClass, KubeNetworkPolicy, KubeEndpoints,
  KubeConfigMap, KubeSecret, KubePVC, KubePV, KubeStorageClass,
  KubeServiceAccount, KubeRole, KubeClusterRole, KubeRoleBinding, KubeClusterRoleBinding,
  KubeNode, KubeNamespace, KubeCRD, AnyKubeResource
} from '../types'
import { podPhaseBg, totalRestarts, formatAge, getNodeReady } from '../types'
import ScaleDialog from './ScaleDialog'
import DeleteConfirm from './DeleteConfirm'
import YAMLViewer from './YAMLViewer'

// ─── Section → resource selector ─────────────────────────────────────────────

function useResources() {
  const store = useAppStore()
  switch (store.section) {
    case 'pods': return store.pods as AnyKubeResource[]
    case 'deployments': return store.deployments as AnyKubeResource[]
    case 'daemonsets': return store.daemonsets as AnyKubeResource[]
    case 'statefulsets': return store.statefulsets as AnyKubeResource[]
    case 'replicasets': return store.replicasets as AnyKubeResource[]
    case 'jobs': return store.jobs as AnyKubeResource[]
    case 'cronjobs': return store.cronjobs as AnyKubeResource[]
    case 'hpas': return store.hpas as AnyKubeResource[]
    case 'pdbs': return store.pdbs as AnyKubeResource[]
    case 'services': return store.services as AnyKubeResource[]
    case 'ingresses': return store.ingresses as AnyKubeResource[]
    case 'ingressclasses': return store.ingressclasses as AnyKubeResource[]
    case 'networkpolicies': return store.networkpolicies as AnyKubeResource[]
    case 'endpoints': return store.endpoints as AnyKubeResource[]
    case 'configmaps': return store.configmaps as AnyKubeResource[]
    case 'secrets': return store.secrets as AnyKubeResource[]
    case 'pvcs': return store.pvcs as AnyKubeResource[]
    case 'pvs': return store.pvs as AnyKubeResource[]
    case 'storageclasses': return store.storageclasses as AnyKubeResource[]
    case 'serviceaccounts': return store.serviceaccounts as AnyKubeResource[]
    case 'roles': return store.roles as AnyKubeResource[]
    case 'clusterroles': return store.clusterroles as AnyKubeResource[]
    case 'rolebindings': return store.rolebindings as AnyKubeResource[]
    case 'clusterrolebindings': return store.clusterrolebindings as AnyKubeResource[]
    case 'nodes': return store.nodes as AnyKubeResource[]
    case 'namespaces': return store.namespaces as AnyKubeResource[]
    case 'crds': return store.crds as AnyKubeResource[]
    default: return []
  }
}

const SECTION_LABELS: Record<string, string> = {
  pods: 'Pods', deployments: 'Deployments', daemonsets: 'DaemonSets',
  statefulsets: 'StatefulSets', replicasets: 'ReplicaSets', jobs: 'Jobs', cronjobs: 'CronJobs',
  hpas: 'HorizontalPodAutoscalers', pdbs: 'PodDisruptionBudgets',
  services: 'Services', ingresses: 'Ingresses', ingressclasses: 'IngressClasses',
  networkpolicies: 'NetworkPolicies', endpoints: 'Endpoints',
  configmaps: 'ConfigMaps', secrets: 'Secrets',
  pvcs: 'PersistentVolumeClaims', pvs: 'PersistentVolumes', storageclasses: 'StorageClasses',
  serviceaccounts: 'ServiceAccounts', roles: 'Roles', clusterroles: 'ClusterRoles',
  rolebindings: 'RoleBindings', clusterrolebindings: 'ClusterRoleBindings',
  nodes: 'Nodes', namespaces: 'Namespaces', crds: 'CRDs'
}

// ─── Row renderers ────────────────────────────────────────────────────────────

function PodRow({ pod }: { pod: KubePod }) {
  const phase = pod.status.phase ?? 'Unknown'
  const restarts = totalRestarts(pod)
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{pod.metadata.name}</td>
      <td className="px-6 py-3">
        <Badge text={phase} cls={podPhaseBg(phase)} />
      </td>
      <td className="px-6 py-3 text-xs">
        <span className={`font-bold ${restarts > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400 dark:text-slate-500'}`}>{restarts}</span>
      </td>
      <td className="px-6 py-3 text-xs text-slate-500 font-mono truncate max-w-[140px]">{pod.spec.nodeName ?? '—'}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(pod.metadata.creationTimestamp)}</td>
    </>
  )
}

function DeploymentRow({ d }: { d: KubeDeployment }) {
  const desired = d.spec.replicas ?? 0
  const ready = d.status.readyReplicas ?? 0
  const ok = ready >= desired
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{d.metadata.name}</td>
      <td className="px-6 py-3 text-xs font-bold">
        <span className={ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{ready}/{desired}</span>
      </td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{d.spec.strategy?.type ?? 'RollingUpdate'}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(d.metadata.creationTimestamp)}</td>
    </>
  )
}

function StatefulSetRow({ s }: { s: KubeStatefulSet }) {
  const desired = s.spec.replicas ?? 0
  const ready = s.status.readyReplicas ?? 0
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{s.metadata.name}</td>
      <td className="px-6 py-3 text-xs font-bold">
        <span className={ready >= desired ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{ready}/{desired}</span>
      </td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono">{s.spec.serviceName}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(s.metadata.creationTimestamp)}</td>
    </>
  )
}

function ReplicaSetRow({ rs }: { rs: KubeReplicaSet }) {
  const desired = rs.spec.replicas ?? 0
  const ready = rs.status.readyReplicas ?? 0
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{rs.metadata.name}</td>
      <td className="px-6 py-3 text-xs font-bold">
        <span className={ready >= desired ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{ready}/{desired}</span>
      </td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(rs.metadata.creationTimestamp)}</td>
    </>
  )
}

function JobRow({ job }: { job: KubeJob }) {
  const done = (job.status.succeeded ?? 0) > 0
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{job.metadata.name}</td>
      <td className="px-6 py-3">
        <Badge
          text={done ? 'Complete' : 'Running'}
          cls={done ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 outline-blue-500/20' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 outline-amber-500/20'}
        />
      </td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-medium">{job.status.succeeded ?? 0}/{job.spec.completions ?? '?'}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(job.metadata.creationTimestamp)}</td>
    </>
  )
}

function CronJobRow({ cj }: { cj: KubeCronJob }) {
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{cj.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300 font-mono font-bold">{cj.spec.schedule}</td>
      <td className="px-6 py-3">
        <Badge
          text={cj.spec.suspend ? 'Suspended' : 'Active'}
          cls={cj.spec.suspend ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 outline-slate-500/20' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 outline-emerald-500/20'}
        />
      </td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(cj.metadata.creationTimestamp)}</td>
    </>
  )
}

function ServiceRow({ svc }: { svc: KubeService }) {
  const lbIp = svc.status.loadBalancer?.ingress?.[0]?.ip ?? svc.status.loadBalancer?.ingress?.[0]?.hostname ?? ''
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[200px]">{svc.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300 font-medium">{svc.spec.type ?? 'ClusterIP'}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono">{svc.spec.clusterIP ?? '—'}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-[120px] font-bold">{lbIp || '—'}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500 truncate max-w-[150px]">
        {(svc.spec.ports ?? []).map(p => `${p.port}/${p.protocol ?? 'TCP'}`).join(', ') || '—'}
      </td>
    </>
  )
}

function IngressRow({ ing }: { ing: KubeIngress }) {
  const hosts = (ing.spec.rules ?? []).map(r => r.host ?? '*').join(', ')
  const lbIp = ing.status.loadBalancer?.ingress?.[0]?.ip ?? ing.status.loadBalancer?.ingress?.[0]?.hostname ?? '—'
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[200px]">{ing.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300 truncate max-w-[220px] font-medium">{hosts || '—'}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono font-bold">{lbIp}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{ing.spec.ingressClassName ?? '—'}</td>
    </>
  )
}

function ConfigMapRow({ cm }: { cm: KubeConfigMap }) {
  const keyCount = Object.keys(cm.data ?? {}).length
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{cm.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-medium">{keyCount} key{keyCount !== 1 ? 's' : ''}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(cm.metadata.creationTimestamp)}</td>
    </>
  )
}

function SecretRow({ sec }: { sec: KubeSecret }) {
  const keyCount = Object.keys(sec.data ?? {}).length
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{sec.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{sec.type ?? 'Opaque'}</td>
      <td className="px-6 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">{keyCount} key{keyCount !== 1 ? 's' : ''}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(sec.metadata.creationTimestamp)}</td>
    </>
  )
}

function NodeRow({ node }: { node: KubeNode }) {
  const ready = getNodeReady(node)
  const internalIP = (node.status.addresses ?? []).find(a => a.type === 'InternalIP')?.address ?? '—'
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{node.metadata.name}</td>
      <td className="px-6 py-3">
        <Badge
          text={ready ? 'Ready' : 'NotReady'}
          cls={ready ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 outline-emerald-500/20' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 outline-red-500/20'}
        />
      </td>
      <td className="px-6 py-3 text-xs text-slate-500 font-medium">{node.status.nodeInfo?.kubeletVersion ?? '—'}</td>
      <td className="px-6 py-3 text-xs font-bold text-slate-600 dark:text-slate-300 font-mono">{internalIP}</td>
    </>
  )
}

function NamespaceRow({ ns }: { ns: KubeNamespace }) {
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold">{ns.metadata.name}</td>
      <td className="px-6 py-3">
        <Badge
          text={ns.status.phase}
          cls={ns.status.phase === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 outline-emerald-500/20' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 outline-slate-500/20'}
        />
      </td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(ns.metadata.creationTimestamp)}</td>
    </>
  )
}

function CRDRow({ crd }: { crd: KubeCRD }) {
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[280px]">{crd.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{crd.spec.group}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-tighter font-bold">{crd.spec.scope}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(crd.metadata.creationTimestamp)}</td>
    </>
  )
}

function DaemonSetRow({ ds }: { ds: KubeDaemonSet }) {
  const desired = ds.status.desiredNumberScheduled
  const ready = ds.status.numberReady
  const ok = ready >= desired
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{ds.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono">{desired}</td>
      <td className="px-6 py-3 text-xs font-bold">
        <span className={ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{ready}</span>
      </td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono">{ds.status.numberAvailable ?? 0}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{ds.spec.updateStrategy?.type ?? 'RollingUpdate'}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(ds.metadata.creationTimestamp)}</td>
    </>
  )
}

function HPARow({ hpa }: { hpa: KubeHPA }) {
  const current = hpa.status.currentReplicas
  const desired = hpa.status.desiredReplicas
  const ok = current === desired
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[200px]">{hpa.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300 font-mono truncate max-w-[140px]">
        {hpa.spec.scaleTargetRef.kind}/{hpa.spec.scaleTargetRef.name}
      </td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{hpa.spec.minReplicas ?? 1}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{hpa.spec.maxReplicas}</td>
      <td className="px-6 py-3 text-xs font-bold">
        <span className={ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{current}/{desired}</span>
      </td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(hpa.metadata.creationTimestamp)}</td>
    </>
  )
}

function PDBRow({ pdb }: { pdb: KubePDB }) {
  const ok = pdb.status.disruptionsAllowed > 0
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{pdb.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{pdb.spec.minAvailable ?? '—'}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{pdb.spec.maxUnavailable ?? '—'}</td>
      <td className="px-6 py-3 text-xs font-bold">
        <span className={ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{pdb.status.currentHealthy}/{pdb.status.expectedPods}</span>
      </td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(pdb.metadata.creationTimestamp)}</td>
    </>
  )
}

function IngressClassRow({ ic }: { ic: KubeIngressClass }) {
  const isDefault = ic.metadata.annotations?.['ingressclass.kubernetes.io/is-default-class'] === 'true'
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{ic.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-[200px]">{ic.spec.controller ?? '—'}</td>
      <td className="px-6 py-3">
        {isDefault && <Badge text="default" cls="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 outline-blue-500/20" />}
      </td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(ic.metadata.creationTimestamp)}</td>
    </>
  )
}

function NetworkPolicyRow({ np }: { np: KubeNetworkPolicy }) {
  const selector = Object.entries(np.spec.podSelector.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`).join(', ') || '*'
  const types = (np.spec.policyTypes ?? []).join(', ') || '—'
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[200px]">{np.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-[180px]">{selector}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{types}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(np.metadata.creationTimestamp)}</td>
    </>
  )
}

function EndpointsRow({ ep }: { ep: KubeEndpoints }) {
  const addrCount = (ep.subsets ?? []).reduce((sum, s) => sum + (s.addresses?.length ?? 0), 0)
  const portStr = (ep.subsets ?? []).flatMap(s => s.ports ?? []).map(p => p.port).join(', ')
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{ep.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{addrCount} address{addrCount !== 1 ? 'es' : ''}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono">{portStr || '—'}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(ep.metadata.creationTimestamp)}</td>
    </>
  )
}

function PVCRow({ pvc }: { pvc: KubePVC }) {
  const phase = pvc.status.phase ?? 'Unknown'
  const capacity = Object.values(pvc.status.capacity ?? {})[0] ?? pvc.spec.resources?.requests?.storage ?? '—'
  const modes = (pvc.status.accessModes ?? pvc.spec.accessModes ?? []).join(', ')
  const phaseCls = phase === 'Bound' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 outline-emerald-500/20'
    : phase === 'Pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 outline-yellow-500/20'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 outline-red-500/20'
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[200px]">{pvc.metadata.name}</td>
      <td className="px-6 py-3"><Badge text={phase} cls={phaseCls} /></td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-bold">{capacity}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{modes || '—'}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{pvc.spec.storageClassName ?? '—'}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(pvc.metadata.creationTimestamp)}</td>
    </>
  )
}

function PVRow({ pv }: { pv: KubePV }) {
  const phase = pv.status.phase ?? 'Unknown'
  const capacity = Object.values(pv.spec.capacity ?? {})[0] as string ?? '—'
  const phaseCls = phase === 'Bound' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 outline-emerald-500/20'
    : phase === 'Available' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 outline-blue-500/20'
    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 outline-slate-500/20'
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[200px]">{pv.metadata.name}</td>
      <td className="px-6 py-3"><Badge text={phase} cls={phaseCls} /></td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-bold">{capacity}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{pv.spec.persistentVolumeReclaimPolicy ?? '—'}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{pv.spec.storageClassName ?? '—'}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(pv.metadata.creationTimestamp)}</td>
    </>
  )
}

function StorageClassRow({ sc }: { sc: KubeStorageClass }) {
  const isDefault = sc.metadata.annotations?.['storageclass.kubernetes.io/is-default-class'] === 'true'
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[200px]">{sc.metadata.name}{isDefault && <span className="ml-2 text-[10px] font-bold text-blue-500">(default)</span>}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-[180px]">{sc.provisioner}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{sc.reclaimPolicy ?? '—'}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{sc.volumeBindingMode ?? '—'}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(sc.metadata.creationTimestamp)}</td>
    </>
  )
}

function ServiceAccountRow({ sa }: { sa: KubeServiceAccount }) {
  const secretCount = (sa.secrets ?? []).length
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{sa.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{secretCount} secret{secretCount !== 1 ? 's' : ''}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(sa.metadata.creationTimestamp)}</td>
    </>
  )
}

function RoleRow({ role }: { role: KubeRole }) {
  const ruleCount = (role.rules ?? []).length
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[280px]">{role.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{ruleCount} rule{ruleCount !== 1 ? 's' : ''}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(role.metadata.creationTimestamp)}</td>
    </>
  )
}

function ClusterRoleRow({ role }: { role: KubeClusterRole }) {
  const ruleCount = (role.rules ?? []).length
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[280px]">{role.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{ruleCount} rule{ruleCount !== 1 ? 's' : ''}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(role.metadata.creationTimestamp)}</td>
    </>
  )
}

function RoleBindingRow({ rb }: { rb: KubeRoleBinding }) {
  const subjectCount = (rb.subjects ?? []).length
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[200px]">{rb.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-[160px]">{rb.roleRef.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{subjectCount} subject{subjectCount !== 1 ? 's' : ''}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(rb.metadata.creationTimestamp)}</td>
    </>
  )
}

function ClusterRoleBindingRow({ crb }: { crb: KubeClusterRoleBinding }) {
  const subjectCount = (crb.subjects ?? []).length
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[200px]">{crb.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-[160px]">{crb.roleRef.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{subjectCount} subject{subjectCount !== 1 ? 's' : ''}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(crb.metadata.creationTimestamp)}</td>
    </>
  )
}

// ─── Column headers ───────────────────────────────────────────────────────────

const COLUMNS: Record<string, string[]> = {
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
  nodes: ['Name', 'Status', 'Version', 'IP'],
  namespaces: ['Name', 'Status', 'Age'],
  crds: ['Name', 'Group', 'Scope', 'Age']
}

// ─── Row dispatcher ───────────────────────────────────────────────────────────

function ResourceRow({ resource, section }: { resource: AnyKubeResource; section: string }) {
  switch (section) {
    case 'pods': return <PodRow pod={resource as KubePod} />
    case 'deployments': return <DeploymentRow d={resource as KubeDeployment} />
    case 'daemonsets': return <DaemonSetRow ds={resource as KubeDaemonSet} />
    case 'statefulsets': return <StatefulSetRow s={resource as KubeStatefulSet} />
    case 'replicasets': return <ReplicaSetRow rs={resource as KubeReplicaSet} />
    case 'jobs': return <JobRow job={resource as KubeJob} />
    case 'cronjobs': return <CronJobRow cj={resource as KubeCronJob} />
    case 'hpas': return <HPARow hpa={resource as KubeHPA} />
    case 'pdbs': return <PDBRow pdb={resource as KubePDB} />
    case 'services': return <ServiceRow svc={resource as KubeService} />
    case 'ingresses': return <IngressRow ing={resource as KubeIngress} />
    case 'ingressclasses': return <IngressClassRow ic={resource as KubeIngressClass} />
    case 'networkpolicies': return <NetworkPolicyRow np={resource as KubeNetworkPolicy} />
    case 'endpoints': return <EndpointsRow ep={resource as KubeEndpoints} />
    case 'configmaps': return <ConfigMapRow cm={resource as KubeConfigMap} />
    case 'secrets': return <SecretRow sec={resource as KubeSecret} />
    case 'pvcs': return <PVCRow pvc={resource as KubePVC} />
    case 'pvs': return <PVRow pv={resource as KubePV} />
    case 'storageclasses': return <StorageClassRow sc={resource as KubeStorageClass} />
    case 'serviceaccounts': return <ServiceAccountRow sa={resource as KubeServiceAccount} />
    case 'roles': return <RoleRow role={resource as KubeRole} />
    case 'clusterroles': return <ClusterRoleRow role={resource as KubeClusterRole} />
    case 'rolebindings': return <RoleBindingRow rb={resource as KubeRoleBinding} />
    case 'clusterrolebindings': return <ClusterRoleBindingRow crb={resource as KubeClusterRoleBinding} />
    case 'nodes': return <NodeRow node={resource as KubeNode} />
    case 'namespaces': return <NamespaceRow ns={resource as KubeNamespace} />
    case 'crds': return <CRDRow crd={resource as KubeCRD} />
    default: return <td className="px-6 py-3 text-xs font-semibold">{resource.metadata.name}</td>
  }
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 transition-all ${cls}`}>
      {text}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResourceList(): JSX.Element {
  const { section, selectedResource, selectResource, loadingResources, refresh,
    selectedNamespace, deleteResource, getYAML, rolloutRestart, openExec } = useAppStore()
  const resources = useResources()
  const [search, setSearch] = useState('')
  const [scaleTarget, setScaleTarget] = useState<KubeDeployment | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AnyKubeResource | null>(null)
  const [yamlContent, setYamlContent] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; resource: AnyKubeResource } | null>(null)

  const clusterScoped = ['nodes', 'namespaces', 'crds', 'ingressclasses', 'pvs', 'storageclasses', 'clusterroles', 'clusterrolebindings'].includes(section)
  const showNsCol = selectedNamespace === '_all' && !clusterScoped
  const cols = COLUMNS[section] ?? ['Name']

  const filtered = useMemo(() =>
    resources.filter(r => r.metadata.name.toLowerCase().includes(search.toLowerCase())),
    [resources, search]
  )

  const handleContextMenu = (e: React.MouseEvent, resource: AnyKubeResource) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, resource })
  }

  const handleViewYAML = async (resource: AnyKubeResource) => {
    setContextMenu(null)
    setYamlContent(null)
    setYamlError(null)
    setYamlLoading(true)
    try {
      const kind = kindLabel(section)
      const yaml = await getYAML(kind, resource.metadata.name, clusterScoped, resource.metadata.namespace)
      setYamlContent(yaml)
    } catch (err) {
      setYamlError((err as Error).message ?? 'Failed to fetch YAML')
    } finally {
      setYamlLoading(false)
    }
  }

  const handleDelete = (resource: AnyKubeResource) => {
    setContextMenu(null)
    setDeleteTarget(resource)
  }

  const handleRestart = async (resource: AnyKubeResource) => {
    setContextMenu(null)
    const kind = section === 'deployments' ? 'deployment' : section === 'statefulsets' ? 'statefulset' : 'daemonset'
    await rolloutRestart(kind, resource.metadata.name, resource.metadata.namespace)
  }

  const handleExec = (resource: AnyKubeResource) => {
    setContextMenu(null)
    const pod = resource as KubePod
    const container = pod.spec.containers[0]?.name ?? ''
    openExec({ pod: pod.metadata.name, container, namespace: pod.metadata.namespace ?? selectedNamespace ?? '' })
  }

  const handleCopyName = (resource: AnyKubeResource) => {
    setContextMenu(null)
    navigator.clipboard.writeText(resource.metadata.name)
  }

  const handleCopyIP = (resource: AnyKubeResource) => {
    setContextMenu(null)
    let ip = ''
    if (section === 'services') {
      const svc = resource as KubeService
      ip = svc.spec.clusterIP ?? ''
    } else if (section === 'nodes') {
      const node = resource as KubeNode
      ip = (node.status.addresses ?? []).find(a => a.type === 'InternalIP')?.address ?? ''
    } else if (section === 'pods') {
      const pod = resource as KubePod
      ip = pod.status.podIP ?? ''
    }
    if (ip) navigator.clipboard.writeText(ip)
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-white dark:bg-slate-950 h-full transition-colors duration-200" onClick={() => setContextMenu(null)}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{SECTION_LABELS[section] ?? section}</h2>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
            {clusterScoped ? 'cluster-wide' : selectedNamespace === '_all' ? 'all namespaces' : (selectedNamespace ?? 'no namespace')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs rounded-lg px-3 py-2 pl-8
                         border border-transparent focus:border-blue-500/50 focus:outline-none focus:ring-4 focus:ring-blue-500/10 
                         w-48 transition-all placeholder-slate-400 dark:placeholder-slate-500"
            />
            <div className="absolute left-2.5 top-2.5 text-slate-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            </div>
          </div>

          <button
            onClick={refresh}
            disabled={loadingResources}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300
                       bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg shadow-sm
                       disabled:opacity-50 border border-slate-200 dark:border-slate-800 transition-all active:scale-95"
          >
            <span className={`transition-transform duration-500 ${loadingResources ? 'animate-spin' : ''}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6m12 6a9 9 0 0 1-15-6.7L3 16" /></svg>
            </span>
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loadingResources ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
            <div className="w-8 h-8 border-3 border-slate-100 dark:border-slate-800 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-xs font-bold tracking-widest uppercase">Syncing Cluster...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
              <span className="text-2xl">◻</span>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest">
              {resources.length === 0 ? `No ${SECTION_LABELS[section]?.toLowerCase() ?? 'resources'} found` : 'No matches'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md z-10">
              <tr className="border-b border-slate-100 dark:border-slate-800">
                {cols.map(col => (
                  <th key={col} className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    {col}
                  </th>
                ))}
                {showNsCol && (
                  <th className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Namespace
                  </th>
                )}
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
              {filtered.map(resource => {
                const uid = resource.metadata.uid
                const isSelected = selectedResource?.metadata.uid === uid
                return (
                  <tr
                    key={uid}
                    onClick={() => selectResource(isSelected ? null : resource)}
                    onContextMenu={e => handleContextMenu(e, resource)}
                    className={`group cursor-pointer transition-all duration-150 ${isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/10'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/30'
                      }`}
                  >
                    <ResourceRow resource={resource} section={section} />
                    {showNsCol && (
                      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500 font-mono font-medium">
                        {resource.metadata.namespace ?? '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); handleContextMenu(e, resource) }}
                        className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 opacity-0 group-hover:opacity-100 transition-all font-bold"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl py-1.5 min-w-[180px] animate-in fade-in zoom-in duration-100"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 200) }}
          onClick={e => e.stopPropagation()}
        >
          <MenuItem label="Copy Name" onClick={() => handleCopyName(contextMenu.resource)} icon="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          {['services', 'nodes', 'pods'].includes(section) && (
            <MenuItem label="Copy IP" onClick={() => handleCopyIP(contextMenu.resource)} icon="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" />
          )}
          <MenuItem label="View YAML" onClick={() => handleViewYAML(contextMenu.resource)} icon="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2v7h7" />
          {['deployments', 'statefulsets'].includes(section) && (
            <>
              {section === 'deployments' && (
                <MenuItem label="Scale…" onClick={() => { setScaleTarget(contextMenu.resource as KubeDeployment); setContextMenu(null) }} icon="M3 6h18M3 12h18M3 18h18" />
              )}
              <MenuItem label="Restart" onClick={() => handleRestart(contextMenu.resource)} icon="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </>
          )}
          {section === 'pods' && (
            <MenuItem label="Exec Shell" onClick={() => handleExec(contextMenu.resource)} icon="M4 17l6-6-6-6M12 19h8" />
          )}
          <div className="border-t border-slate-100 dark:border-slate-700 my-1.5" />
          <MenuItem label="Delete…" onClick={() => handleDelete(contextMenu.resource)} danger icon="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </div>
      )}

      {/* Dialogs */}
      {scaleTarget && (
        <ScaleDialog
          deployment={scaleTarget}
          onClose={() => setScaleTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          name={deleteTarget.metadata.name}
          kind={kindLabel(section)}
          onConfirm={async () => {
            await deleteResource(kindLabel(section), deleteTarget.metadata.name, clusterScoped, deleteTarget.metadata.namespace)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {(yamlLoading || yamlContent !== null || yamlError !== null) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                  {yamlLoading
                    ? <div className="w-4 h-4 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin" />
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-500"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2v7h7" /></svg>
                  }
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">
                  {yamlLoading ? 'Loading YAML…' : 'Resource YAML'}
                </h3>
              </div>
              <button
                onClick={() => { setYamlContent(null); setYamlError(null); setYamlLoading(false) }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 bg-slate-950">
              {yamlError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                  </div>
                  <p className="text-sm font-bold text-red-400 text-center">Failed to load YAML</p>
                  <pre className="text-xs text-slate-400 text-center max-w-lg break-words whitespace-pre-wrap">{yamlError}</pre>
                </div>
              ) : yamlLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : yamlContent !== null ? (
                <YAMLViewer content={yamlContent} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ label, onClick, danger, icon }: { label: string; onClick: () => void; danger?: boolean; icon?: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2 text-xs font-bold transition-all duration-150
        ${danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
    >
      {icon && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 opacity-70">
          <path d={icon} />
        </svg>
      )}
      {label}
    </button>
  )
}

function kindLabel(section: string): string {
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
