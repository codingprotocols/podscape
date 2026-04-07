import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import { SECTION_CONFIG } from '../../store/slices/resourceSlice'
import LoadingAnimation from './LoadingAnimation'
import type {
  KubePod, KubeDeployment, KubeDaemonSet, KubeStatefulSet, KubeReplicaSet, KubeJob, KubeCronJob,
  KubeHPA, KubePDB, KubeService, KubeIngress, KubeIngressClass, KubeNetworkPolicy, KubeEndpoints,
  KubeConfigMap, KubeSecret, KubePVC, KubePV, KubeStorageClass,
  KubeServiceAccount, KubeRole, KubeClusterRole, KubeRoleBinding, KubeClusterRoleBinding,
  KubeNode, KubeNamespace, KubeCRD, AnyKubeResource, ResourceKind
} from '../../types'
import { podPhaseBg, totalRestarts, formatAge, getNodeReady, parseCpuMillicores, parseMemoryMiB } from '../../types'
import ScaleDialog from '../common/ScaleDialog'
import DeleteConfirm from '../common/DeleteConfirm'
import YAMLViewer from '../common/YAMLViewer'
import { kindLabel } from '../../store/slices/resourceSlice'
import { Layers, ShieldOff } from 'lucide-react'
import { SECTION_LABELS, COLUMNS, CLUSTER_SCOPED_SECTIONS } from '../../config'




// ─── Section → resource selector ─────────────────────────────────────────────
// Derived from SECTION_CONFIG so adding a new resource type only requires one
// change (in resourceSlice.ts) instead of two.

function useResources(): AnyKubeResource[] {
  return useAppStore(s => {
    const key = SECTION_CONFIG[s.section as ResourceKind]?.stateKey
    return key ? (s[key as keyof typeof s] as AnyKubeResource[]) ?? [] : []
  })
}



// ─── Row renderers ────────────────────────────────────────────────────────────

function RestartBadge({ count, onNavigateToDebug }: { count: number; onNavigateToDebug: () => void }) {
  const cls =
    count === 0
      ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
      : count < 5
        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 cursor-pointer hover:opacity-80'
        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 animate-pulse cursor-pointer hover:opacity-80'

  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-black font-mono ${cls}`}
      onClick={count > 0 ? (e) => { e.stopPropagation(); onNavigateToDebug() } : undefined}
      title={count > 0 ? 'View in Debug Pod / Restart Analyzer' : undefined}
    >
      {count}
    </span>
  )
}

const PodRow = React.memo(function PodRow({ pod }: { pod: KubePod }) {
  const phase = pod.metadata.deletionTimestamp ? 'Terminating' : (pod.status.phase ?? 'Unknown')
  const restarts = totalRestarts(pod)
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">
        {pod.metadata.name}
      </td>
      <td className="px-6 py-3">
        <Badge text={phase} cls={podPhaseBg(phase)} />
      </td>
      <td className="px-6 py-3 text-xs">
        <RestartBadge count={restarts} onNavigateToDebug={() => useAppStore.getState().setSection('debugpod')} />
      </td>
      <td className="px-6 py-3 text-xs text-slate-500 font-mono truncate max-w-[140px]">{pod.spec.nodeName ?? '—'}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(pod.metadata.creationTimestamp)}</td>
    </>
  )
})

const DeploymentRow = React.memo(function DeploymentRow({ d }: { d: KubeDeployment }) {
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
})

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
          cls={done ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 outline-blue-500/20' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 outline-amber-500/20'}
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
          cls={cj.spec.suspend ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 outline-slate-500/20' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 outline-emerald-500/20'}
        />
      </td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(cj.metadata.creationTimestamp)}</td>
    </>
  )
}

const ServiceRow = React.memo(function ServiceRow({ svc }: { svc: KubeService }) {
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
})

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

const ConfigMapRow = React.memo(function ConfigMapRow({ cm }: { cm: KubeConfigMap }) {
  const keyCount = Object.keys(cm.data ?? {}).length
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{cm.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-medium">{keyCount} key{keyCount !== 1 ? 's' : ''}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(cm.metadata.creationTimestamp)}</td>
    </>
  )
})

const SecretRow = React.memo(function SecretRow({ sec }: { sec: KubeSecret }) {
  const keyCount = Object.keys(sec.data ?? {}).length
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[240px]">{sec.metadata.name}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">{sec.type ?? 'Opaque'}</td>
      <td className="px-6 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">{keyCount} key{keyCount !== 1 ? 's' : ''}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(sec.metadata.creationTimestamp)}</td>
    </>
  )
})


function getInstanceType(node: KubeNode): string {
  const labels = node.metadata.labels ?? {}
  return labels['node.kubernetes.io/instance-type'] ?? labels['beta.kubernetes.io/instance-type'] ?? '—'
}

function getNodePool(node: KubeNode): string {
  const labels = node.metadata.labels ?? {}
  return labels['karpenter.sh/nodepool'] ?? labels['karpenter.k8s.aws/nodepool'] ?? '—'
}

function getCapacityType(node: KubeNode): string {
  const labels = node.metadata.labels ?? {}
  return labels['karpenter.sh/capacity-type'] ?? '—'
}

const NodeRow = React.memo(function NodeRow({ node }: { node: KubeNode }) {
  const ready = getNodeReady(node)
  const cordoned = !!node.spec.unschedulable
  const internalIP = (node.status.addresses ?? []).find(a => a.type === 'InternalIP')?.address ?? '—'

  const cpuAlloc = parseCpuMillicores(node.status.allocatable?.cpu ?? '0')
  const cpuCap = parseCpuMillicores(node.status.capacity?.cpu ?? '0')
  const memAllocMiB = parseMemoryMiB(node.status.allocatable?.memory ?? '0Ki')
  const memCapMiB = parseMemoryMiB(node.status.capacity?.memory ?? '0Ki')

  const fmtCpu = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)}` : `${m}m`
  const fmtMem = (mib: number) => mib >= 1024 ? `${(mib / 1024).toFixed(0)}Gi` : `${Math.round(mib)}Mi`

  const instanceType = getInstanceType(node)
  const nodePool = getNodePool(node)
  const capacityType = getCapacityType(node)

  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold truncate max-w-[260px]" title={node.metadata.name}>{node.metadata.name}</td>
      <td className="px-6 py-3">
        <div className="flex items-center gap-1.5">
          <Badge
            text={ready ? 'Ready' : 'NotReady'}
            cls={ready ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 outline-emerald-500/20' : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 outline-red-500/20'}
          />
          {cordoned && (
            <Badge text="Cordoned" cls="bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 outline-amber-500/20" />
          )}
        </div>
      </td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono">{instanceType}</td>
      <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-medium">{nodePool}</td>
      <td className="px-6 py-3">
        {capacityType !== '—' ? (
          <Badge
            text={capacityType}
            cls={capacityType === 'spot'
              ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400 outline-violet-500/20'
              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 outline-blue-500/20'}
          />
        ) : <span className="text-xs text-slate-400 dark:text-slate-600">—</span>}
      </td>
      <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300 font-mono whitespace-nowrap">
        {cpuAlloc > 0 ? `${fmtCpu(cpuAlloc)} / ${fmtCpu(cpuCap)}` : '—'}
      </td>
      <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300 font-mono whitespace-nowrap">
        {memAllocMiB > 0 ? `${fmtMem(memAllocMiB)} / ${fmtMem(memCapMiB)}` : '—'}
      </td>
      <td className="px-6 py-3 text-xs font-bold text-slate-600 dark:text-slate-300 font-mono">{internalIP}</td>
      <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">{formatAge(node.metadata.creationTimestamp)}</td>
    </>
  )
})

function NamespaceRow({ ns }: { ns: KubeNamespace }) {
  return (
    <>
      <td className="px-6 py-3 font-mono text-xs font-semibold">{ns.metadata.name}</td>
      <td className="px-6 py-3">
        <Badge
          text={ns.status.phase}
          cls={ns.status.phase === 'Active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 outline-emerald-500/20' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 outline-slate-500/20'}
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
        {isDefault && <Badge text="default" cls="bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 outline-blue-500/20" />}
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
  const phaseCls = phase === 'Bound' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 outline-emerald-500/20'
    : phase === 'Pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 outline-yellow-500/20'
      : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 outline-red-500/20'
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
  const phaseCls = phase === 'Bound' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 outline-emerald-500/20'
    : phase === 'Available' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 outline-blue-500/20'
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
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider outline outline-1 outline-offset-[-1px] shadow-sm transition-all ${cls}`}>
      {text}
    </span>
  )
}

// ─── Custom Checkbox ────────────────────────────────────────────────────────
function CustomCheckbox({ checked, onChange, partiallyChecked = false }: { checked: boolean, onChange: () => void, partiallyChecked?: boolean }) {
  return (
    <div 
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`
        relative w-4 h-4 rounded-md border flex items-center justify-center cursor-pointer transition-all duration-200
        ${checked || partiallyChecked
          ? 'bg-blue-500 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' 
          : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'
        }
      `}
    >
      <svg 
        className={`w-3 h-3 text-white absolute transition-all duration-200 ${checked && !partiallyChecked ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="3.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      {partiallyChecked && !checked && (
        <div className="w-2 h-0.5 bg-white rounded-full"></div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResourceList(): JSX.Element {
  // Data fields — subscribed via shallow equality so any change triggers a re-render.
  const { section, selectedResource, loadingResources, selectedNamespace, selectedContext, searchQuery, deniedSections } =
    useAppStore(useShallow(s => ({
      section: s.section,
      selectedResource: s.selectedResource,
      loadingResources: s.loadingResources,
      selectedNamespace: s.selectedNamespace,
      selectedContext: s.selectedContext,
      searchQuery: s.searchQuery,
      deniedSections: s.deniedSections,
    })))

  // Action functions — stable refs created once; read directly from the store
  // without subscribing so they never cause re-renders.
  const {
    selectResource, refresh, deleteResource, getYAML, applyYAML,
    rolloutRestart, openExec, scaleStatefulSet, startPortForward,
  } = useAppStore.getState()
  const resources = useResources()
  const [scaleTarget, setScaleTarget] = useState<KubeDeployment | null>(null)
  const [stsScaleTarget, setStsScaleTarget] = useState<KubeStatefulSet | null>(null)
  const [stsScaleVal, setStsScaleVal] = useState('')
  const [stsScaleLoading, setStsScaleLoading] = useState(false)
  
  // Single delete target
  const [deleteTarget, setDeleteTarget] = useState<AnyKubeResource | null>(null)
  
  // Multi-delete target confirmation
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false)
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set())

  const [yamlContent, setYamlContent] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; resource: AnyKubeResource } | null>(null)
  const [pfTarget, setPfTarget] = useState<AnyKubeResource | null>(null)
  const [pfLocalPort, setPfLocalPort] = useState('')
  const [pfRemotePort, setPfRemotePort] = useState('')
  const [pfLoading, setPfLoading] = useState(false)
  const [restartError, setRestartError] = useState<string | null>(null)
  const restartErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setRestartErrorWithTimeout = useCallback((msg: string) => {
    if (restartErrorTimer.current) clearTimeout(restartErrorTimer.current)
    setRestartError(msg)
    restartErrorTimer.current = setTimeout(() => setRestartError(null), 5000)
  }, [])

  useEffect(() => {
    return () => {
      if (restartErrorTimer.current) clearTimeout(restartErrorTimer.current)
    }
  }, [])

  const clusterScoped = CLUSTER_SCOPED_SECTIONS.has(section)

  const showNsCol = selectedNamespace === '_all' && !clusterScoped
  const cols = COLUMNS[section] ?? ['Name']

  const [sortCol, setSortCol] = useState<string | null>('Name')
  const [sortAsc, setSortAsc] = useState(true)

  const handleSort = useCallback((col: string) => {
    if (sortCol === col) {
      setSortAsc(prev => !prev)
    } else {
      setSortCol(col)
      setSortAsc(true)
    }
  }, [sortCol])

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase()
    let result = resources.filter(r => r.metadata.name.toLowerCase().includes(q))

    if (sortCol) {
      result = [...result].sort((a, b) => {
        const valA = getSortValue(a, section, sortCol)
        const valB = getSortValue(b, section, sortCol)

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortAsc ? valA - valB : valB - valA
        }

        const strA = String(valA).toLowerCase()
        const strB = String(valB).toLowerCase()
        return sortAsc ? strA.localeCompare(strB) : strB.localeCompare(strA)
      })
    }
    return result
    // `section` is intentionally excluded: when section changes, `resources`
    // is replaced wholesale by useResources(), which already invalidates this memo.
    // Including `section` would trigger a redundant sort on the old array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, searchQuery, sortCol, sortAsc])

  // Clear selection and sorting if section changes
  useEffect(() => {
    setSelectedUids(new Set())
    setSortCol('Name')
    setSortAsc(true)
  }, [section])

  // ── Virtualization ────────────────────────────────────────────────────────
  // Renders only the visible rows (overscan: 5 above/below) via padding <tr>
  // spacers so the native <table> structure and all <td> row renderers remain
  // unchanged. Row height is estimated at 45 px; the virtualizer measures
  // actual heights after mount via measureElement.

  const tableContainerRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 45,
    overscan: 5,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom = virtualItems.length > 0
    ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0

  const allSelected = filtered.length > 0 && selectedUids.size === filtered.length
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedUids(new Set())
    } else {
      setSelectedUids(new Set(filtered.map(r => r.metadata.uid)))
    }
  }

  const toggleSelect = (uid: string) => {
    const next = new Set(selectedUids)
    if (next.has(uid)) {
      next.delete(uid)
    } else {
      next.add(uid)
    }
    setSelectedUids(next)
  }

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
    try {
      await rolloutRestart(kind, resource.metadata.name, resource.metadata.namespace)
      refresh()
    } catch (err) {
      setRestartErrorWithTimeout((err as Error).message ?? 'Restart failed')
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleteLoading(true)
    const targets = resources.filter(r => selectedUids.has(r.metadata.uid))
    let firstError: string | null = null

    for (const res of targets) {
      try {
        await deleteResource(kindLabel(section), res.metadata.name, clusterScoped, res.metadata.namespace)
      } catch (err: any) {
        if (!firstError) firstError = err.message
      }
    }

    setBulkDeleteLoading(false)
    setBulkDeleteConfirmOpen(false)
    setSelectedUids(new Set())
    
    if (firstError) {
      setRestartErrorWithTimeout(`Bulk delete error: ${firstError}`)
    }
    refresh()
  }

  const handleExec = (resource: AnyKubeResource) => {
    setContextMenu(null)
    const pod = resource as KubePod
    const isDebugPod = pod.metadata.name.startsWith('podscape-debug-')
    const container = isDebugPod ? 'debug' : (pod.spec.containers[0]?.name ?? '')
    openExec({ pod: pod.metadata.name, container, namespace: pod.metadata.namespace ?? selectedNamespace ?? '' })
  }

  const handleCopyName = (resource: AnyKubeResource) => {
    setContextMenu(null)
    navigator.clipboard.writeText(resource.metadata.name)
  }

  const handleOpenPortForward = (resource: AnyKubeResource) => {
    setContextMenu(null)
    // Pre-fill remote port for services
    if (section === 'services') {
      const svc = resource as KubeService
      const firstPort = svc.spec.ports?.[0]
      if (firstPort) {
        setPfRemotePort(String(firstPort.port))
        setPfLocalPort(String(firstPort.port))
      } else {
        setPfRemotePort('')
        setPfLocalPort('')
      }
    } else {
      setPfRemotePort('')
      setPfLocalPort('')
    }
    setPfTarget(resource)
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (e.key === 'Escape') {
        if (contextMenu) setContextMenu(null)
        else if (yamlContent !== null || yamlLoading || yamlError) {
          setYamlContent(null)
          setYamlError(null)
          setYamlLoading(false)
        } else if (deleteTarget) {
          setDeleteTarget(null)
        } else if (bulkDeleteConfirmOpen) {
          setBulkDeleteConfirmOpen(false)
        } else if (pfTarget) {
          setPfTarget(null)
        } else if (scaleTarget) {
          setScaleTarget(null)
        } else if (stsScaleTarget) {
          setStsScaleTarget(null)
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedUids.size > 0) {
          setBulkDeleteConfirmOpen(true)
        } else if (selectedResource) {
          setDeleteTarget(selectedResource)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [contextMenu, yamlContent, yamlLoading, yamlError, selectedUids, selectedResource, deleteTarget, bulkDeleteConfirmOpen, pfTarget, scaleTarget, stsScaleTarget])

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-white dark:bg-[hsl(var(--bg-dark))] h-full transition-colors duration-200" onClick={() => setContextMenu(null)}>
      {restartError && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 shrink-0">
          <p className="text-xs font-medium text-red-600 dark:text-red-400">{restartError}</p>
          <button onClick={() => setRestartError(null)} className="text-red-500 hover:text-red-700 dark:hover:text-red-300 text-xs shrink-0">✕</button>
        </div>
      )}
      {/* Header */}


      {/* Table */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        {loadingResources ? (
          <div className="flex items-center justify-center py-24">
            <LoadingAnimation />
          </div>
        ) : deniedSections.has(section as ResourceKind) ? (
          <div className="flex flex-col items-center justify-center py-32 gap-6 animate-in fade-in duration-700">
            <div className="w-20 h-20 rounded-[28px] bg-amber-500/5 border border-dashed border-amber-500/20 flex items-center justify-center text-amber-500/40 shadow-inner">
              <ShieldOff size={32} />
            </div>
            <div className="text-center space-y-2">
              <p className="text-[11px] font-black uppercase tracking-[0.4em] text-amber-500/70">
                Access denied
              </p>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">
                Your RBAC role does not allow listing {SECTION_LABELS[section]?.toLowerCase() ?? 'this resource'}
              </p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-6 animate-in fade-in duration-700">
            <div className="w-20 h-20 rounded-[28px] bg-slate-50 dark:bg-white/[0.03] border border-dashed border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-200 dark:text-slate-800 shadow-inner">
               <Layers size={32} />
            </div>
            <div className="text-center space-y-2">
              <p className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 dark:text-slate-600">
                {resources.length === 0 ? `No ${SECTION_LABELS[section]?.toLowerCase() ?? 'resources'} found` : 'No matches found'}
              </p>
              <p className="text-[10px] font-bold text-slate-300 dark:text-slate-700 uppercase tracking-widest">Check filters or selected namespace</p>
            </div>
          </div>
        ) : (
          <>
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-white/80 dark:bg-[hsl(var(--bg-dark),_0.8)] backdrop-blur-xl z-20">
              <tr className="border-b border-slate-100 dark:border-white/5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <th className="w-16 px-6 py-6 text-center">
                  <CustomCheckbox 
                    checked={allSelected} 
                    partiallyChecked={selectedUids.size > 0 && !allSelected}
                    onChange={toggleSelectAll} 
                  />
                </th>
                {cols.map(col => (
                  <th 
                    key={col} 
                    onClick={() => handleSort(col)}
                    className="text-left pl-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 transition-colors select-none group"
                  >
                    <div className="flex items-center gap-1.5">
                      {col}
                      <span className={`transition-opacity duration-200 ${sortCol === col ? 'opacity-100 text-blue-500' : 'opacity-0 group-hover:opacity-50'}`}>
                        {sortCol === col && !sortAsc ? '↓' : '↑'}
                      </span>
                    </div>
                  </th>
                ))}
                {showNsCol && (
                  <th 
                    onClick={() => handleSort('Namespace')}
                    className="text-left pl-8 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 transition-colors select-none group"
                  >
                    <div className="flex items-center gap-1.5">
                      Namespace
                      <span className={`transition-opacity duration-200 ${sortCol === 'Namespace' ? 'opacity-100 text-blue-500' : 'opacity-0 group-hover:opacity-50'}`}>
                        {sortCol === 'Namespace' && !sortAsc ? '↓' : '↑'}
                      </span>
                    </div>
                  </th>
                )}
                <th className="w-14" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
              {/* Top spacer — represents rows scrolled above the viewport */}
              {paddingTop > 0 && (
                <tr><td style={{ height: paddingTop }} colSpan={cols.length + 3} /></tr>
              )}
              {virtualItems.map(virtualRow => {
                const resource = filtered[virtualRow.index]
                const uid = resource.metadata.uid
                const isSelected = selectedResource?.metadata.uid === uid
                return (
                  <tr
                    key={uid}
                    onClick={() => selectResource(isSelected ? null : resource)}
                    onContextMenu={e => handleContextMenu(e, resource)}
                    className={`group cursor-pointer transition-colors duration-200 relative ${isSelected
                      ? 'bg-blue-600/10 border-l-[3px] border-blue-500 shadow-[inset_4px_0_12px_-4px_rgba(59,130,246,0.3)]'
                      : 'hover:bg-slate-100/50 dark:hover:bg-white/5 border-l-[3px] border-transparent'
                      }`}
                  >
                    <td className="px-6 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <div className={`transition-all duration-200 ${selectedUids.has(uid) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <CustomCheckbox
                          checked={selectedUids.has(uid)}
                          onChange={() => toggleSelect(uid)}
                        />
                      </div>
                    </td>
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
              {/* Bottom spacer — represents rows below the viewport */}
              {paddingBottom > 0 && (
                <tr><td style={{ height: paddingBottom }} colSpan={cols.length + 3} /></tr>
              )}
            </tbody>
          </table>
          </>
        )}
      </div>

      {/* Context menu */}
      {
        contextMenu && (
          <div
            className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl py-1.5 min-w-[180px] animate-in fade-in zoom-in duration-100"
            style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 200) }}
            onClick={e => e.stopPropagation()}
          >
            <MenuItem label="Copy Name" onClick={() => handleCopyName(contextMenu.resource)} icon="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            {['services', 'nodes', 'pods'].includes(section) && (
              <MenuItem label="Copy IP" onClick={() => handleCopyIP(contextMenu.resource)} icon="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" />
            )}
            <MenuItem label="View / Edit YAML" onClick={() => handleViewYAML(contextMenu.resource)} icon="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2v7h7" />
            {['deployments', 'statefulsets'].includes(section) && (
              <>
                {section === 'deployments' && (
                  <MenuItem label="Scale…" onClick={() => { setScaleTarget(contextMenu.resource as KubeDeployment); setContextMenu(null) }} icon="M3 6h18M3 12h18M3 18h18" />
                )}
                {section === 'statefulsets' && (
                  <MenuItem label="Scale…" onClick={() => {
                    const sts = contextMenu.resource as KubeStatefulSet
                    setStsScaleTarget(sts)
                    setStsScaleVal(String(sts.spec.replicas ?? 1))
                    setContextMenu(null)
                  }} icon="M3 6h18M3 12h18M3 18h18" />
                )}
                <MenuItem label="Restart" onClick={() => handleRestart(contextMenu.resource)} icon="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </>
            )}
            {section === 'pods' && (
              <MenuItem label="Exec Shell" onClick={() => handleExec(contextMenu.resource)} icon="M4 17l6-6-6-6M12 19h8" />
            )}
            {['pods', 'services'].includes(section) && (
              <MenuItem label="Port Forward…" onClick={() => handleOpenPortForward(contextMenu.resource)} icon="M5 12h14M12 5l7 7-7 7" />
            )}
            <div className="border-t border-slate-100 dark:border-slate-700 my-1.5" />
            <MenuItem label="Delete…" onClick={() => handleDelete(contextMenu.resource)} danger icon="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </div>
        )
      }

      {/* Floating Action Bar for Bulk Select */}
      {selectedUids.size > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-slate-200 dark:border-slate-700 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] rounded-full px-6 py-3.5 flex items-center gap-6">
            <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest whitespace-nowrap">
              <span className="text-blue-500 px-2 py-0.5 bg-blue-500/10 rounded-md mr-2">{selectedUids.size}</span>
              Selected
            </span>

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700"></div>

            <button
              onClick={(e) => {
                e.stopPropagation()
                setBulkDeleteConfirmOpen(true)
              }}
              disabled={bulkDeleteLoading}
              className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-red-500 hover:text-red-600 dark:hover:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 px-4 py-2 rounded-full transition-colors active:scale-95 disabled:opacity-50"
            >
              {bulkDeleteLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" /></svg>
              )}
              {bulkDeleteLoading ? 'Deleting...' : 'Delete All'}
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSelectedUids(new Set())
              }}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
              title="Clear Selection"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      {
        deleteTarget && (
          <DeleteConfirm
            name={deleteTarget.metadata.name}
            kind={kindLabel(section)}
            onConfirm={async () => {
              await deleteResource(kindLabel(section), deleteTarget.metadata.name, clusterScoped, deleteTarget.metadata.namespace)
              setDeleteTarget(null)
              refresh()
            }}
            onCancel={() => setDeleteTarget(null)}
          />
        )
      }
      {
        bulkDeleteConfirmOpen && (
          <DeleteConfirm
            name={`${selectedUids.size} items`}
            kind={`Multiple ${kindLabel(section)} Items`}
            onConfirm={handleBulkDelete}
            onCancel={() => setBulkDeleteConfirmOpen(false)}
          />
        )
      }
      {
        (yamlLoading || yamlContent !== null || yamlError !== null) && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="yaml-modal-title">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl h-full max-h-[85vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                    {yamlLoading
                      ? <div className="w-4 h-4 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin" />
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-500"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2v7h7" /></svg>
                    }
                  </div>
                  <h3 id="yaml-modal-title" className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">
                    {yamlLoading ? 'Loading YAML…' : 'View / Edit YAML'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => { setYamlContent(null); setYamlError(null); setYamlLoading(false) }}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                  aria-label="Close"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 min-h-0 bg-slate-950">
                {yamlError ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                    <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                    </div>
                    <p className="text-sm font-bold text-red-400 text-center">Failed to load YAML</p>
                    <div className="text-xs text-slate-600 dark:text-slate-400 max-w-[500px] break-words whitespace-pre-wrap font-mono relative pr-8 max-h-32 overflow-y-auto w-full">
                      {yamlError}
                    </div>
                  </div>
                ) : yamlLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                  </div>
                ) : yamlContent !== null ? (
                  <YAMLViewer
                    content={yamlContent}
                    editable
                    onSave={async (updatedYaml) => {
                      await applyYAML(updatedYaml)
                      setYamlContent(null)
                      setYamlError(null)
                      refresh()
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        )
      }
      {
        scaleTarget && (
          <ScaleDialog
            deployment={scaleTarget}
            onClose={() => setScaleTarget(null)}
          />
        )
      }
      {
        stsScaleTarget && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8" onClick={() => setStsScaleTarget(null)}>
            <div className="bg-gray-900 border border-white/15 rounded-xl w-full max-w-sm shadow-2xl p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-white mb-1">Scale StatefulSet</h3>
              <p className="text-xs text-gray-400 font-mono mb-4">{stsScaleTarget.metadata.name}</p>
              <label className="block text-xs font-medium text-gray-400 mb-2">Replicas</label>
              <input type="number" min={0} value={stsScaleVal} onChange={e => setStsScaleVal(e.target.value)}
                className="w-full bg-gray-800 text-white text-sm rounded px-3 py-2 border border-white/10 focus:outline-none focus:ring-1 focus:ring-blue-500 mb-4"
              />
              <div className="flex gap-2">
                <button onClick={() => setStsScaleTarget(null)}
                  className="flex-1 py-2 text-sm text-gray-300 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors">
                  Cancel
                </button>
                <button onClick={async () => {
                  const reps = parseInt(stsScaleVal)
                  if (isNaN(reps) || reps < 0) return
                  setStsScaleLoading(true)
                  try {
                    await scaleStatefulSet(stsScaleTarget.metadata.name, reps, stsScaleTarget.metadata.namespace)
                    setStsScaleTarget(null)
                  } catch { /* error handled by store */ }
                  setStsScaleLoading(false)
                }} disabled={stsScaleLoading}
                  className="flex-1 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
                  {stsScaleLoading ? 'Scaling…' : 'Scale'}
                </button>
              </div>
            </div>
          </div>
        )
      }
      {
        pfTarget && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPfTarget(null)}>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Port Forward</h3>
              <p className="text-xs font-mono text-slate-400 dark:text-slate-500 mb-4">{pfTarget.metadata.name}</p>
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Local Port</label>
                  <input type="number" min={1} max={65535} value={pfLocalPort}
                    onChange={e => setPfLocalPort(e.target.value)}
                    placeholder="8080"
                    className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Remote Port</label>
                  <input type="number" min={1} max={65535} value={pfRemotePort}
                    onChange={e => setPfRemotePort(e.target.value)}
                    placeholder="8080"
                    className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPfTarget(null)}
                  className="flex-1 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
                  Cancel
                </button>
                <button
                  disabled={pfLoading || !pfLocalPort || !pfRemotePort || !selectedContext}
                  onClick={async () => {
                    if (!selectedContext || !pfLocalPort || !pfRemotePort) return
                    setPfLoading(true)
                    try {
                      const id = crypto.randomUUID()
                      const type = section === 'services' ? 'service' : 'pod'
                      startPortForward({
                        id,
                        type,
                        namespace: pfTarget.metadata.namespace ?? selectedNamespace ?? 'default',
                        name: pfTarget.metadata.name,
                        localPort: parseInt(pfLocalPort),
                        remotePort: parseInt(pfRemotePort),
                        status: 'starting'
                      })
                      setPfTarget(null)
                    } finally {
                      setPfLoading(false)
                    }
                  }}
                  className="flex-1 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-40">
                  {pfLoading ? 'Starting…' : 'Start Forward'}
                </button>
              </div>
            </div>
          </div>
        )
      }
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

// ─── Sorting Helper ───────────────────────────────────────────────────────────

function getSortValue(resource: any, section: string, col: string): string | number {
  if (col === 'Name') return resource.metadata.name
  if (col === 'Namespace') return resource.metadata.namespace ?? ''
  
  if (col === 'Age') {
    return new Date(resource.metadata.creationTimestamp).getTime()
  }

  if (col === 'Status') {
    if (section === 'namespaces') return resource.status?.phase ?? ''
    if (section === 'pods') return resource.status?.phase ?? ''
    if (section === 'jobs') return (resource.status?.succeeded ?? 0) > 0 ? 'Complete' : 'Running'
    if (section === 'cronjobs') return resource.spec?.suspend ? 'Suspended' : 'Active'
    if (section === 'nodes') return getNodeReady(resource) ? 'Ready' : 'NotReady'
  }

  if (section === 'pods') {
    if (col === 'Restarts') return totalRestarts(resource)
    if (col === 'Node') return resource.spec?.nodeName ?? ''
  }

  if (section === 'deployments' || section === 'statefulsets' || section === 'replicasets') {
    if (col === 'Ready') return resource.status?.readyReplicas ?? 0
    if (section === 'deployments' && col === 'Strategy') return resource.spec?.strategy?.type ?? ''
    if (section === 'statefulsets' && col === 'Service') return resource.spec?.serviceName ?? ''
  }

  if (section === 'daemonsets') {
    if (col === 'Desired') return resource.status?.desiredNumberScheduled ?? 0
    if (col === 'Ready') return resource.status?.numberReady ?? 0
    if (col === 'Available') return resource.status?.numberAvailable ?? 0
    if (col === 'Update Strategy') return resource.spec?.updateStrategy?.type ?? ''
  }

  if (section === 'jobs' && col === 'Completions') return resource.status?.succeeded ?? 0
  if (section === 'cronjobs' && col === 'Schedule') return resource.spec?.schedule ?? ''

  if (section === 'hpas') {
    if (col === 'Target') return `${resource.spec.scaleTargetRef.kind}/${resource.spec.scaleTargetRef.name}`
    if (col === 'Min') return resource.spec?.minReplicas ?? 0
    if (col === 'Max') return resource.spec?.maxReplicas ?? 0
    if (col === 'Current/Desired') return resource.status?.currentReplicas ?? 0
  }

  if (section === 'pdbs') {
    if (col === 'Min Available') return resource.spec?.minAvailable ?? ''
    if (col === 'Max Unavailable') return resource.spec?.maxUnavailable ?? ''
    if (col === 'Healthy/Expected') return resource.status?.currentHealthy ?? 0
  }

  if (section === 'services') {
    if (col === 'Type') return resource.spec?.type ?? ''
    if (col === 'Cluster IP') return resource.spec?.clusterIP ?? ''
    if (col === 'External IP') return resource.status?.loadBalancer?.ingress?.[0]?.ip ?? resource.status?.loadBalancer?.ingress?.[0]?.hostname ?? ''
    if (col === 'Ports') return (resource.spec?.ports ?? []).map((p: any) => p.port).join(', ')
  }

  if (section === 'ingresses') {
    if (col === 'Hosts') return (resource.spec?.rules ?? []).map((r: any) => r.host ?? '*').join(', ')
    if (col === 'Address') return resource.status?.loadBalancer?.ingress?.[0]?.ip ?? ''
    if (col === 'Class') return resource.spec?.ingressClassName ?? ''
  }

  if (section === 'ingressclasses') {
    if (col === 'Controller') return resource.spec?.controller ?? ''
    if (col === 'Default') return resource.metadata?.annotations?.['ingressclass.kubernetes.io/is-default-class'] === 'true' ? '1' : '0'
  }

  if (section === 'networkpolicies') {
    if (col === 'Pod Selector') return Object.keys(resource.spec?.podSelector?.matchLabels ?? {}).length
    if (col === 'Policy Types') return (resource.spec?.policyTypes ?? []).join(', ')
  }

  if (section === 'endpoints') {
    if (col === 'Addresses') return (resource.subsets ?? []).reduce((sum: number, s: any) => sum + (s.addresses?.length ?? 0), 0)
    if (col === 'Ports') return (resource.subsets ?? []).flatMap((s: any) => s.ports ?? []).map((p: any) => p.port).join(', ')
  }

  if (section === 'configmaps' || section === 'secrets') {
    if (col === 'Keys') return Object.keys(resource.data ?? {}).length
    if (section === 'secrets' && col === 'Type') return resource.type ?? ''
  }

  if (section === 'pvcs' || section === 'pvs') {
    if (col === 'Phase') return resource.status?.phase ?? ''
    if (col === 'Capacity') {
      const cap = section === 'pvcs' ? resource.status?.capacity : resource.spec?.capacity
      return cap ? (Object.values(cap)[0] as string) : ''
    }
    if (section === 'pvcs' && col === 'Access Modes') return (resource.status?.accessModes ?? []).join(', ')
    if (section === 'pvs' && col === 'Reclaim Policy') return resource.spec?.persistentVolumeReclaimPolicy ?? ''
    if (col === 'Storage Class') return resource.spec?.storageClassName ?? ''
  }

  if (section === 'storageclasses') {
    if (col === 'Provisioner') return resource.provisioner ?? ''
    if (col === 'Reclaim Policy') return resource.reclaimPolicy ?? ''
    if (col === 'Binding Mode') return resource.volumeBindingMode ?? ''
  }

  if (section === 'serviceaccounts') {
    if (col === 'Secrets') return (resource.secrets ?? []).length
  }

  if (section === 'roles' || section === 'clusterroles') {
    if (col === 'Rules') return (resource.rules ?? []).length
  }

  if (section === 'rolebindings' || section === 'clusterrolebindings') {
    if (col === 'Role') return resource.roleRef?.name ?? ''
    if (col === 'Subjects') return (resource.subjects ?? []).length
  }

  if (section === 'nodes') {
    if (col === 'IP') return (resource.status?.addresses ?? []).find((a: any) => a.type === 'InternalIP')?.address ?? ''
    if (col === 'Instance Type') return getInstanceType(resource as KubeNode)
    if (col === 'Node Pool') return getNodePool(resource as KubeNode)
    if (col === 'Capacity') return getCapacityType(resource as KubeNode)
    if (col === 'CPU') return parseCpuMillicores(resource.status?.allocatable?.cpu ?? '0')
    if (col === 'Memory') return parseMemoryMiB(resource.status?.allocatable?.memory ?? '0Ki')
  }

  if (section === 'crds') {
    if (col === 'Group') return resource.spec?.group ?? ''
    if (col === 'Scope') return resource.spec?.scope ?? ''
  }

  return ''
}
