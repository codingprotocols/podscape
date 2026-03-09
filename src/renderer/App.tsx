import React, { useEffect } from 'react'
import { useAppStore } from './store'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import ResourceList from './components/ResourceList'
import PodDetail from './components/PodDetail'
import DeploymentDetail from './components/DeploymentDetail'
import StatefulSetDetail from './components/StatefulSetDetail'
import JobDetail from './components/JobDetail'
import CronJobDetail from './components/CronJobDetail'
import IngressDetail from './components/IngressDetail'
import ServiceDetail from './components/ServiceDetail'
import NodeDetail from './components/NodeDetail'
import ConfigMapDetail from './components/ConfigMapDetail'
import SecretDetail from './components/SecretDetail'
import DaemonSetDetail from './components/DaemonSetDetail'
import HPADetail from './components/HPADetail'
import PVCDetail from './components/PVCDetail'
import RoleBindingDetail from './components/RoleBindingDetail'
import RoleDetail from './components/RoleDetail'
import ReplicaSetDetail from './components/ReplicaSetDetail'
import NamespaceDetail from './components/NamespaceDetail'
import HelmPanel from './components/HelmPanel'
import PortForwardPanel from './components/PortForwardPanel'
import EventsView from './components/EventsView'
import MetricsView from './components/MetricsView'
import Terminal from './components/Terminal'
import ExtensionsPanel from './components/ExtensionsPanel'
import SettingsPanel from './components/SettingsPanel'
import NetworkPanel from './components/NetworkPanel'
import ExecPanel from './components/ExecPanel'
import YAMLViewer from './components/YAMLViewer'
import type {
  KubePod, KubeDeployment, KubeDaemonSet, KubeStatefulSet, KubeJob, KubeCronJob,
  KubeService, KubeIngress, KubeNode,
  KubeConfigMap, KubeSecret, KubeHPA, KubePVC, KubeRoleBinding, KubeClusterRoleBinding,
  KubeRole, KubeClusterRole, KubeReplicaSet, KubeNamespace,
  AnyKubeResource
} from './types'

// ─── Error boundary ───────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 bg-white dark:bg-[hsl(var(--bg-dark))]">
          <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">Panel crashed</p>
          <pre className="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm text-center break-words whitespace-pre-wrap">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Sections that show a list + detail panel
const LIST_SECTIONS = [
  'pods', 'deployments', 'daemonsets', 'statefulsets', 'replicasets',
  'jobs', 'cronjobs', 'hpas', 'pdbs',
  'services', 'ingresses', 'ingressclasses', 'networkpolicies', 'endpoints',
  'configmaps', 'secrets',
  'pvcs', 'pvs', 'storageclasses',
  'serviceaccounts', 'roles', 'clusterroles', 'rolebindings', 'clusterrolebindings',
  'nodes', 'namespaces', 'crds'
]

function DetailPanelContainer({ children }: { children: React.ReactNode }) {
  const { detailWidth, setDetailWidth } = useAppStore()
  const [isResizing, setIsResizing] = React.useState(false)

  React.useEffect(() => {
    if (!isResizing) return

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(380, Math.min(window.innerWidth - 300, window.innerWidth - e.clientX))
      setDetailWidth(newWidth)
    }

    const onMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = 'default'
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'

    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = 'default'
    }
  }, [isResizing, setDetailWidth])

  return (
    <div
      className="relative flex flex-col border-l border-slate-200 dark:border-white/5 glass-heavy h-full shadow-2xl animate-in slide-in-from-right-4 z-50"
      style={{ width: `${detailWidth}px` }}
    >
      <div
        onMouseDown={() => setIsResizing(true)}
        className="resize-handle-v left-0"
      />
      {children}
    </div>
  )
}

function DetailPanel({ resource, section }: { resource: AnyKubeResource; section: string }) {
  let content: React.ReactNode

  switch (section) {
    case 'pods':
      content = <PodDetail pod={resource as KubePod} />
      break
    case 'deployments':
      content = <DeploymentDetail deployment={resource as KubeDeployment} />
      break
    case 'statefulsets':
      content = <StatefulSetDetail statefulSet={resource as KubeStatefulSet} />
      break
    case 'jobs':
      content = <JobDetail job={resource as KubeJob} />
      break
    case 'cronjobs':
      content = <CronJobDetail cronJob={resource as KubeCronJob} />
      break
    case 'ingresses':
      content = <IngressDetail ingress={resource as KubeIngress} />
      break
    case 'daemonsets':
      content = <DaemonSetDetail daemonSet={resource as KubeDaemonSet} />
      break
    case 'services':
      content = <ServiceDetail service={resource as KubeService} />
      break
    case 'nodes':
      content = <NodeDetail node={resource as KubeNode} />
      break
    case 'configmaps':
      content = <ConfigMapDetail configMap={resource as KubeConfigMap} />
      break
    case 'secrets':
      content = <SecretDetail secret={resource as KubeSecret} />
      break
    case 'hpas':
      content = <HPADetail hpa={resource as KubeHPA} />
      break
    case 'pvcs':
      content = <PVCDetail pvc={resource as KubePVC} />
      break
    case 'replicasets':
      content = <ReplicaSetDetail replicaSet={resource as KubeReplicaSet} />
      break
    case 'rolebindings':
      content = <RoleBindingDetail binding={resource as KubeRoleBinding} />
      break
    case 'clusterrolebindings':
      content = <RoleBindingDetail binding={resource as KubeClusterRoleBinding} />
      break
    case 'roles':
      content = <RoleDetail role={resource as KubeRole} clusterScoped={false} />
      break
    case 'clusterroles':
      content = <RoleDetail role={resource as KubeClusterRole} clusterScoped={true} />
      break
    case 'namespaces':
      content = <NamespaceDetail namespace={resource as KubeNamespace} />
      break
    default:
      content = <DefaultDetail resource={resource} section={section} />
  }

  return <DetailPanelContainer>{content}</DetailPanelContainer>
}

function DefaultDetail({ resource, section }: { resource: AnyKubeResource; section: string }) {
  const [yaml, setYaml] = React.useState<string | null>(null)
  const { getYAML, applyYAML, refresh } = useAppStore()

  const clusterScoped = ['nodes', 'namespaces', 'crds', 'ingressclasses', 'pvs', 'storageclasses', 'clusterroles', 'clusterrolebindings'].includes(section)

  useEffect(() => {
    getYAML(
      kindForSection(section),
      resource.metadata.name,
      clusterScoped,
      resource.metadata.namespace
    ).then(setYaml).catch(() => setYaml('# Unable to fetch YAML'))
  }, [resource.metadata.uid, section])

  return (
    <>
      <div className="px-8 py-6 border-b border-slate-200 dark:border-white/5 shrink-0 bg-white/5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
          <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono truncate tracking-tight">{resource.metadata.name}</h3>
        </div>
        {resource.metadata.namespace && (
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] ml-5">{resource.metadata.namespace}</p>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {yaml !== null ? (
          yaml.startsWith('#') ? (
            <YAMLViewer content={yaml} />
          ) : (
            <YAMLViewer
              content={yaml}
              editable
              onSave={async (updatedYaml) => {
                await applyYAML(updatedYaml)
                refresh()
                const next = await getYAML(kindForSection(section), resource.metadata.name, clusterScoped, resource.metadata.namespace)
                setYaml(next)
              }}
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
            <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-800 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">Retrieving Manifest...</span>
          </div>
        )}
      </div>
    </>
  )
}

function kindForSection(section: string): string {
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

export default function App(): JSX.Element {
  const { init, section, setSection, selectedResource, execTarget, closeExec, refresh, error, clearError } = useAppStore()

  useEffect(() => { init() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault()
        refresh()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        setSection('terminal')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [refresh, setSection])

  const showListView = LIST_SECTIONS.includes(section)

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-[hsl(var(--bg-dark))] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Left nav sidebar */}
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>

      {/* Main content */}
      <div className="flex flex-1 min-w-0 min-h-0 bg-slate-50 dark:bg-[hsl(var(--bg-dark))]">
        {section === 'dashboard' ? (
          <Dashboard />
        ) : section === 'terminal' ? (
          <Terminal />
        ) : section === 'events' ? (
          <EventsView />
        ) : section === 'metrics' ? (
          <MetricsView />
        ) : section === 'extensions' ? (
          <ExtensionsPanel />
        ) : section === 'settings' ? (
          <SettingsPanel />
        ) : section === 'network' ? (
          <NetworkPanel />
        ) : section === 'portforwards' ? (
          <PortForwardPanel />
        ) : section === 'helm' ? (
          <HelmPanel />
        ) : showListView ? (
          <>
            <ResourceList />
            {selectedResource && (
              <ErrorBoundary key={selectedResource.metadata.uid}>
                <DetailPanel resource={selectedResource} section={section} />
              </ErrorBoundary>
            )}
          </>
        ) : null}
      </div>

      {/* Exec overlay */}
      {execTarget && (
        <ExecPanel target={execTarget} onClose={closeExec} />
      )}
      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 right-4 z-[9999] animate-in slide-in-from-top duration-300">
          <div className="bg-red-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 max-w-md border border-red-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-widest mb-1 opacity-80">Resource Error</p>
              <p className="text-sm font-bold leading-snug">{error}</p>
            </div>
            <button onClick={clearError} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
