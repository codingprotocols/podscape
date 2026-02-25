import React, { useState } from 'react'
import { useAppStore } from '../store'
import type {
  KubePod, KubeDeployment, KubeStatefulSet, KubeReplicaSet, KubeJob, KubeCronJob,
  KubeService, KubeIngress, KubeConfigMap, KubeSecret, KubeNode, KubeNamespace,
  KubeCRD, AnyKubeResource
} from '../types'
import { podPhaseBg, totalRestarts, formatAge, getNodeReady } from '../types'
import ScaleDialog from './ScaleDialog'
import DeleteConfirm from './DeleteConfirm'
import YAMLViewer from './YAMLViewer'

// ─── Section → resource selector ─────────────────────────────────────────────

function useResources() {
  const store = useAppStore()
  switch (store.section) {
    case 'pods':        return store.pods as AnyKubeResource[]
    case 'deployments': return store.deployments as AnyKubeResource[]
    case 'statefulsets':return store.statefulsets as AnyKubeResource[]
    case 'replicasets': return store.replicasets as AnyKubeResource[]
    case 'jobs':        return store.jobs as AnyKubeResource[]
    case 'cronjobs':    return store.cronjobs as AnyKubeResource[]
    case 'services':    return store.services as AnyKubeResource[]
    case 'ingresses':   return store.ingresses as AnyKubeResource[]
    case 'configmaps':  return store.configmaps as AnyKubeResource[]
    case 'secrets':     return store.secrets as AnyKubeResource[]
    case 'nodes':       return store.nodes as AnyKubeResource[]
    case 'namespaces':  return store.namespaces as AnyKubeResource[]
    case 'crds':        return store.crds as AnyKubeResource[]
    default:            return []
  }
}

const SECTION_LABELS: Record<string, string> = {
  pods: 'Pods', deployments: 'Deployments', statefulsets: 'StatefulSets',
  replicasets: 'ReplicaSets', jobs: 'Jobs', cronjobs: 'CronJobs',
  services: 'Services', ingresses: 'Ingresses', configmaps: 'ConfigMaps',
  secrets: 'Secrets', nodes: 'Nodes', namespaces: 'Namespaces', crds: 'CRDs'
}

// ─── Row renderers ────────────────────────────────────────────────────────────

function PodRow({ pod }: { pod: KubePod }) {
  const phase = pod.status.phase ?? 'Unknown'
  const restarts = totalRestarts(pod)
  return (
    <>
      <td className="px-4 py-2.5 font-mono text-xs text-white truncate max-w-[200px]">{pod.metadata.name}</td>
      <td className="px-4 py-2.5">
        <Badge text={phase} cls={podPhaseBg(phase)} />
      </td>
      <td className="px-4 py-2.5 text-xs">
        <span className={restarts > 0 ? 'text-orange-400 font-medium' : 'text-gray-500'}>{restarts}</span>
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono truncate max-w-[120px]">{pod.spec.nodeName ?? '—'}</td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{formatAge(pod.metadata.creationTimestamp)}</td>
    </>
  )
}

function DeploymentRow({ d }: { d: KubeDeployment }) {
  const desired = d.spec.replicas ?? 0
  const ready = d.status.readyReplicas ?? 0
  const ok = ready >= desired
  return (
    <>
      <td className="px-4 py-2.5 font-mono text-xs text-white truncate max-w-[200px]">{d.metadata.name}</td>
      <td className="px-4 py-2.5 text-xs">
        <span className={ok ? 'text-green-400' : 'text-yellow-400'}>{ready}/{desired}</span>
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-400">{d.spec.strategy?.type ?? 'RollingUpdate'}</td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{formatAge(d.metadata.creationTimestamp)}</td>
    </>
  )
}

function StatefulSetRow({ s }: { s: KubeStatefulSet }) {
  const desired = s.spec.replicas ?? 0
  const ready = s.status.readyReplicas ?? 0
  return (
    <>
      <td className="px-4 py-2.5 font-mono text-xs text-white truncate max-w-[200px]">{s.metadata.name}</td>
      <td className="px-4 py-2.5 text-xs">
        <span className={ready >= desired ? 'text-green-400' : 'text-yellow-400'}>{ready}/{desired}</span>
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{s.spec.serviceName}</td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{formatAge(s.metadata.creationTimestamp)}</td>
    </>
  )
}

function ReplicaSetRow({ rs }: { rs: KubeReplicaSet }) {
  const desired = rs.spec.replicas ?? 0
  const ready = rs.status.readyReplicas ?? 0
  return (
    <>
      <td className="px-4 py-2.5 font-mono text-xs text-white truncate max-w-[220px]">{rs.metadata.name}</td>
      <td className="px-4 py-2.5 text-xs">
        <span className={ready >= desired ? 'text-green-400' : 'text-yellow-400'}>{ready}/{desired}</span>
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{formatAge(rs.metadata.creationTimestamp)}</td>
    </>
  )
}

function JobRow({ job }: { job: KubeJob }) {
  const done = (job.status.succeeded ?? 0) > 0
  return (
    <>
      <td className="px-4 py-2.5 font-mono text-xs text-white truncate max-w-[220px]">{job.metadata.name}</td>
      <td className="px-4 py-2.5">
        <Badge text={done ? 'Complete' : 'Running'} cls={done ? 'bg-blue-500/20 text-blue-300 ring-blue-500/30' : 'bg-yellow-500/20 text-yellow-300 ring-yellow-500/30'} />
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-400">{job.status.succeeded ?? 0}/{job.spec.completions ?? '?'}</td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{formatAge(job.metadata.creationTimestamp)}</td>
    </>
  )
}

function CronJobRow({ cj }: { cj: KubeCronJob }) {
  return (
    <>
      <td className="px-4 py-2.5 font-mono text-xs text-white truncate max-w-[200px]">{cj.metadata.name}</td>
      <td className="px-4 py-2.5 text-xs text-gray-300 font-mono">{cj.spec.schedule}</td>
      <td className="px-4 py-2.5">
        <Badge text={cj.spec.suspend ? 'Suspended' : 'Active'} cls={cj.spec.suspend ? 'bg-gray-500/20 text-gray-300 ring-gray-500/30' : 'bg-green-500/20 text-green-300 ring-green-500/30'} />
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{formatAge(cj.metadata.creationTimestamp)}</td>
    </>
  )
}

function ServiceRow({ svc }: { svc: KubeService }) {
  const lbIp = svc.status.loadBalancer?.ingress?.[0]?.ip ?? svc.status.loadBalancer?.ingress?.[0]?.hostname ?? ''
  return (
    <>
      <td className="px-4 py-2.5 font-mono text-xs text-white truncate max-w-[180px]">{svc.metadata.name}</td>
      <td className="px-4 py-2.5 text-xs text-gray-300">{svc.spec.type ?? 'ClusterIP'}</td>
      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{svc.spec.clusterIP ?? '—'}</td>
      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{lbIp || '—'}</td>
      <td className="px-4 py-2.5 text-xs text-gray-500">
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
      <td className="px-4 py-2.5 font-mono text-xs text-white truncate max-w-[180px]">{ing.metadata.name}</td>
      <td className="px-4 py-2.5 text-xs text-gray-300 truncate max-w-[200px]">{hosts || '—'}</td>
      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{lbIp}</td>
      <td className="px-4 py-2.5 text-xs text-gray-400">{ing.spec.ingressClassName ?? '—'}</td>
    </>
  )
}

function ConfigMapRow({ cm }: { cm: KubeConfigMap }) {
  const keyCount = Object.keys(cm.data ?? {}).length
  return (
    <>
      <td className="px-4 py-2.5 font-mono text-xs text-white truncate max-w-[220px]">{cm.metadata.name}</td>
      <td className="px-4 py-2.5 text-xs text-gray-400">{keyCount} key{keyCount !== 1 ? 's' : ''}</td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{formatAge(cm.metadata.creationTimestamp)}</td>
    </>
  )
}

function SecretRow({ sec }: { sec: KubeSecret }) {
  const keyCount = Object.keys(sec.data ?? {}).length
  return (
    <>
      <td className="px-4 py-2.5 font-mono text-xs text-white truncate max-w-[200px]">{sec.metadata.name}</td>
      <td className="px-4 py-2.5 text-xs text-gray-400">{sec.type ?? 'Opaque'}</td>
      <td className="px-4 py-2.5 text-xs text-gray-400">{keyCount} key{keyCount !== 1 ? 's' : ''}</td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{formatAge(sec.metadata.creationTimestamp)}</td>
    </>
  )
}

function NodeRow({ node }: { node: KubeNode }) {
  const ready = getNodeReady(node)
  const internalIP = (node.status.addresses ?? []).find(a => a.type === 'InternalIP')?.address ?? '—'
  return (
    <>
      <td className="px-4 py-2.5 font-mono text-xs text-white truncate max-w-[200px]">{node.metadata.name}</td>
      <td className="px-4 py-2.5">
        <Badge text={ready ? 'Ready' : 'NotReady'} cls={ready ? 'bg-green-500/20 text-green-300 ring-green-500/30' : 'bg-red-500/20 text-red-300 ring-red-500/30'} />
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-400">{node.status.nodeInfo?.kubeletVersion ?? '—'}</td>
      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{internalIP}</td>
    </>
  )
}

function NamespaceRow({ ns }: { ns: KubeNamespace }) {
  return (
    <>
      <td className="px-4 py-2.5 font-mono text-xs text-white">{ns.metadata.name}</td>
      <td className="px-4 py-2.5">
        <Badge text={ns.status.phase} cls={ns.status.phase === 'Active' ? 'bg-green-500/20 text-green-300 ring-green-500/30' : 'bg-gray-500/20 text-gray-300 ring-gray-500/30'} />
      </td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{formatAge(ns.metadata.creationTimestamp)}</td>
    </>
  )
}

function CRDRow({ crd }: { crd: KubeCRD }) {
  return (
    <>
      <td className="px-4 py-2.5 font-mono text-xs text-white truncate max-w-[240px]">{crd.metadata.name}</td>
      <td className="px-4 py-2.5 text-xs text-gray-400">{crd.spec.group}</td>
      <td className="px-4 py-2.5 text-xs text-gray-400">{crd.spec.scope}</td>
      <td className="px-4 py-2.5 text-xs text-gray-500">{formatAge(crd.metadata.creationTimestamp)}</td>
    </>
  )
}

// ─── Column headers ───────────────────────────────────────────────────────────

const COLUMNS: Record<string, string[]> = {
  pods:        ['Name', 'Status', 'Restarts', 'Node', 'Age'],
  deployments: ['Name', 'Ready', 'Strategy', 'Age'],
  statefulsets:['Name', 'Ready', 'Service', 'Age'],
  replicasets: ['Name', 'Ready', 'Age'],
  jobs:        ['Name', 'Status', 'Completions', 'Age'],
  cronjobs:    ['Name', 'Schedule', 'Status', 'Age'],
  services:    ['Name', 'Type', 'Cluster IP', 'External IP', 'Ports'],
  ingresses:   ['Name', 'Hosts', 'Address', 'Class'],
  configmaps:  ['Name', 'Keys', 'Age'],
  secrets:     ['Name', 'Type', 'Keys', 'Age'],
  nodes:       ['Name', 'Status', 'Version', 'IP'],
  namespaces:  ['Name', 'Status', 'Age'],
  crds:        ['Name', 'Group', 'Scope', 'Age']
}

// ─── Row dispatcher ───────────────────────────────────────────────────────────

function ResourceRow({ resource, section }: { resource: AnyKubeResource; section: string }) {
  switch (section) {
    case 'pods':        return <PodRow pod={resource as KubePod} />
    case 'deployments': return <DeploymentRow d={resource as KubeDeployment} />
    case 'statefulsets':return <StatefulSetRow s={resource as KubeStatefulSet} />
    case 'replicasets': return <ReplicaSetRow rs={resource as KubeReplicaSet} />
    case 'jobs':        return <JobRow job={resource as KubeJob} />
    case 'cronjobs':    return <CronJobRow cj={resource as KubeCronJob} />
    case 'services':    return <ServiceRow svc={resource as KubeService} />
    case 'ingresses':   return <IngressRow ing={resource as KubeIngress} />
    case 'configmaps':  return <ConfigMapRow cm={resource as KubeConfigMap} />
    case 'secrets':     return <SecretRow sec={resource as KubeSecret} />
    case 'nodes':       return <NodeRow node={resource as KubeNode} />
    case 'namespaces':  return <NamespaceRow ns={resource as KubeNamespace} />
    case 'crds':        return <CRDRow crd={resource as KubeCRD} />
    default:            return <td className="px-4 py-2.5 text-xs text-white">{resource.metadata.name}</td>
  }
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${cls}`}>
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; resource: AnyKubeResource } | null>(null)

  const clusterScoped = ['nodes', 'namespaces', 'crds'].includes(section)
  const showNsCol = selectedNamespace === '_all' && !clusterScoped
  const cols = COLUMNS[section] ?? ['Name']

  const filtered = resources.filter(r =>
    r.metadata.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleContextMenu = (e: React.MouseEvent, resource: AnyKubeResource) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, resource })
  }

  const handleViewYAML = async (resource: AnyKubeResource) => {
    setContextMenu(null)
    const kind = kindLabel(section)
    const yaml = await getYAML(kind, resource.metadata.name, clusterScoped, resource.metadata.namespace)
    setYamlContent(yaml)
  }

  const handleDelete = (resource: AnyKubeResource) => {
    setContextMenu(null)
    setDeleteTarget(resource)
  }

  const handleRestart = async (resource: AnyKubeResource) => {
    setContextMenu(null)
    const kind = section === 'deployments' ? 'deployment' : section === 'statefulsets' ? 'statefulset' : 'daemonset'
    await rolloutRestart(kind, resource.metadata.name)
  }

  const handleExec = (resource: AnyKubeResource) => {
    setContextMenu(null)
    const pod = resource as KubePod
    const container = pod.spec.containers[0]?.name ?? ''
    openExec({ pod: pod.metadata.name, container, namespace: pod.metadata.namespace ?? selectedNamespace ?? '' })
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-gray-900/50 h-full" onClick={() => setContextMenu(null)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white">{SECTION_LABELS[section] ?? section}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {clusterScoped ? 'cluster-wide' : selectedNamespace === '_all' ? 'all namespaces' : (selectedNamespace ?? 'no namespace')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-gray-800 text-white text-xs rounded px-2.5 py-1.5 border border-white/10
                       focus:outline-none focus:ring-1 focus:ring-blue-500 w-36 placeholder-gray-600"
          />
          {resources.length > 0 && (
            <span className="text-xs text-gray-500">{filtered.length}/{resources.length}</span>
          )}
          <button
            onClick={refresh}
            disabled={loadingResources}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300
                       bg-white/5 hover:bg-white/10 rounded transition-colors
                       disabled:opacity-50 border border-white/10"
          >
            <span className={loadingResources ? 'animate-spin inline-block' : 'inline-block'}>↻</span>
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loadingResources ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
            <div className="w-6 h-6 border-2 border-gray-700 border-t-gray-400 rounded-full animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-500">
            <span className="text-3xl opacity-30">◻</span>
            <p className="text-sm">
              {resources.length === 0 ? `No ${SECTION_LABELS[section]?.toLowerCase() ?? 'resources'} found` : 'No matches'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-gray-900/95 backdrop-blur-sm z-10">
              <tr className="border-b border-white/10">
                {cols.map(col => (
                  <th key={col} className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {col}
                  </th>
                ))}
                {showNsCol && (
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Namespace
                  </th>
                )}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(resource => {
                const uid = resource.metadata.uid
                const isSelected = selectedResource?.metadata.uid === uid
                return (
                  <tr
                    key={uid}
                    onClick={() => selectResource(isSelected ? null : resource)}
                    onContextMenu={e => handleContextMenu(e, resource)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-600/15' : 'hover:bg-white/3'
                    }`}
                  >
                    <ResourceRow resource={resource} section={section} />
                    {showNsCol && (
                      <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">
                        {resource.metadata.namespace ?? '—'}
                      </td>
                    )}
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={e => { e.stopPropagation(); handleContextMenu(e, resource) }}
                        className="text-gray-600 hover:text-gray-300 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ⋯
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
          className="fixed z-50 bg-gray-800 border border-white/15 rounded-lg shadow-2xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <MenuItem label="View YAML" onClick={() => handleViewYAML(contextMenu.resource)} />
          {['deployments', 'statefulsets'].includes(section) && (
            <>
              {section === 'deployments' && (
                <MenuItem label="Scale…" onClick={() => { setScaleTarget(contextMenu.resource as KubeDeployment); setContextMenu(null) }} />
              )}
              <MenuItem label="Restart" onClick={() => handleRestart(contextMenu.resource)} />
            </>
          )}
          {section === 'pods' && (
            <MenuItem label="Exec Shell" onClick={() => handleExec(contextMenu.resource)} />
          )}
          <div className="border-t border-white/10 my-1" />
          <MenuItem label="Delete…" onClick={() => handleDelete(contextMenu.resource)} danger />
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
      {yamlContent !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8">
          <div className="bg-gray-900 rounded-xl border border-white/15 w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white">YAML</h3>
              <button onClick={() => setYamlContent(null)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="flex-1 min-h-0">
              <YAMLViewer content={yamlContent} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 text-xs hover:bg-white/8 transition-colors
        ${danger ? 'text-red-400 hover:text-red-300' : 'text-gray-200'}`}
    >
      {label}
    </button>
  )
}

function kindLabel(section: string): string {
  const map: Record<string, string> = {
    pods: 'pod', deployments: 'deployment', statefulsets: 'statefulset',
    replicasets: 'replicaset', jobs: 'job', cronjobs: 'cronjob',
    services: 'service', ingresses: 'ingress', configmaps: 'configmap',
    secrets: 'secret', nodes: 'node', namespaces: 'namespace', crds: 'crd'
  }
  return map[section] ?? section
}
