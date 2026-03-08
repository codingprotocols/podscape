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
import HelmPanel from './components/HelmPanel'
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
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 bg-white dark:bg-slate-950">
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

function DetailPanel({ resource, section }: { resource: AnyKubeResource; section: string }) {
  switch (section) {
    case 'pods':
      return <PodDetail pod={resource as KubePod} />
    case 'deployments':
      return <DeploymentDetail deployment={resource as KubeDeployment} />
    case 'statefulsets':
      return <StatefulSetDetail statefulSet={resource as KubeStatefulSet} />
    case 'jobs':
      return <JobDetail job={resource as KubeJob} />
    case 'cronjobs':
      return <CronJobDetail cronJob={resource as KubeCronJob} />
    case 'ingresses':
      return <IngressDetail ingress={resource as KubeIngress} />
    case 'daemonsets':
      return <DaemonSetDetail daemonSet={resource as KubeDaemonSet} />
    case 'services':
      return <ServiceDetail service={resource as KubeService} />
    case 'nodes':
      return <NodeDetail node={resource as KubeNode} />
    case 'configmaps':
      return <ConfigMapDetail configMap={resource as KubeConfigMap} />
    case 'secrets':
      return <SecretDetail secret={resource as KubeSecret} />
    case 'hpas':
      return <HPADetail hpa={resource as KubeHPA} />
    case 'pvcs':
      return <PVCDetail pvc={resource as KubePVC} />
    case 'replicasets':
      return <ReplicaSetDetail replicaSet={resource as KubeReplicaSet} />
    case 'rolebindings':
      return <RoleBindingDetail binding={resource as KubeRoleBinding} />
    case 'clusterrolebindings':
      return <RoleBindingDetail binding={resource as KubeClusterRoleBinding} />
    case 'roles':
      return <RoleDetail role={resource as KubeRole} clusterScoped={false} />
    case 'clusterroles':
      return <RoleDetail role={resource as KubeClusterRole} clusterScoped={true} />
    case 'namespaces':
      return <NamespaceDetail namespace={resource as KubeNamespace} />
    default:
      return <DefaultDetail resource={resource} />
  }
}

function DefaultDetail({ resource }: { resource: AnyKubeResource }) {
  const [yaml, setYaml] = React.useState<string | null>(null)
  const { getYAML, applyYAML, refresh, section } = useAppStore()
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
    <div className="flex flex-col w-[520px] min-w-[400px] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 h-full shadow-2xl transition-colors duration-200">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono truncate">{resource.metadata.name}</h3>
        {resource.metadata.namespace && (
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">{resource.metadata.namespace}</p>
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
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
            <div className="w-5 h-5 border-2 border-slate-200 dark:border-slate-800 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-xs font-medium">Fetching YAML...</span>
          </div>
        )}
      </div>
    </div>
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
  const { init, section, setSection, selectedResource, execTarget, closeExec, refresh } = useAppStore()

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
    <div className="flex h-screen overflow-hidden bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Left nav sidebar */}
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>

      {/* Main content */}
      <div className="flex flex-1 min-w-0 min-h-0 bg-slate-50 dark:bg-slate-950/50 transition-colors duration-200">
<<<<<<< HEAD
        {section === 'dashboard' ? (
          <Dashboard />
        ) : section === 'terminal' ? (
          <Terminal />
        ) : section === 'events' ? (
          <EventsView />
        ) : section === 'metrics' ? (
          <MetricsView />
        ) : section === 'grafana' ? (
          <GrafanaPanel />
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
=======
        <ErrorBoundary>
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
        </ErrorBoundary>
>>>>>>> 135ceb6 (fix)
      </div>

      {/* Exec overlay */}
      {execTarget && (
        <ExecPanel target={execTarget} onClose={closeExec} />
      )}
    </div>
  )
}
