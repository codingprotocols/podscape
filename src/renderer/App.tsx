import React, { useEffect } from 'react'
import { useAppStore } from './store'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import ResourceList from './components/ResourceList'
import PodDetail from './components/PodDetail'
import DeploymentDetail from './components/DeploymentDetail'
import ServiceDetail from './components/ServiceDetail'
import NodeDetail from './components/NodeDetail'
import ConfigMapDetail from './components/ConfigMapDetail'
import SecretDetail from './components/SecretDetail'
import EventsView from './components/EventsView'
import MetricsView from './components/MetricsView'
import Terminal from './components/Terminal'
import GrafanaPanel from './components/GrafanaPanel'
import ExtensionsPanel from './components/ExtensionsPanel'
import SettingsPanel from './components/SettingsPanel'
import ExecPanel from './components/ExecPanel'
import YAMLViewer from './components/YAMLViewer'
import type {
  KubePod, KubeDeployment, KubeService, KubeNode,
  KubeConfigMap, KubeSecret, AnyKubeResource
} from './types'

// Sections that show a list + detail panel
const LIST_SECTIONS = [
  'pods', 'deployments', 'statefulsets', 'replicasets',
  'jobs', 'cronjobs', 'services', 'ingresses',
  'configmaps', 'secrets', 'nodes', 'namespaces', 'crds'
]

function DetailPanel({ resource, section }: { resource: AnyKubeResource; section: string }) {
  switch (section) {
    case 'pods':
      return <PodDetail pod={resource as KubePod} />
    case 'deployments':
      return <DeploymentDetail deployment={resource as KubeDeployment} />
    case 'services':
      return <ServiceDetail service={resource as KubeService} />
    case 'nodes':
      return <NodeDetail node={resource as KubeNode} />
    case 'configmaps':
      return <ConfigMapDetail configMap={resource as KubeConfigMap} />
    case 'secrets':
      return <SecretDetail secret={resource as KubeSecret} />
    default:
      return <DefaultDetail resource={resource} />
  }
}

function DefaultDetail({ resource }: { resource: AnyKubeResource }) {
  const [yaml, setYaml] = React.useState<string | null>(null)
  const { getYAML, section } = useAppStore()
  const clusterScoped = ['nodes', 'namespaces', 'crds'].includes(section)

  useEffect(() => {
    getYAML(
      kindForSection(section),
      resource.metadata.name,
      clusterScoped
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
          <YAMLViewer content={yaml} />
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
    pods: 'pod', deployments: 'deployment', statefulsets: 'statefulset',
    replicasets: 'replicaset', jobs: 'job', cronjobs: 'cronjob',
    services: 'service', ingresses: 'ingress', configmaps: 'configmap',
    secrets: 'secret', nodes: 'node', namespaces: 'namespace', crds: 'crd'
  }
  return map[section] ?? section
}

export default function App(): JSX.Element {
  const { init, section, selectedResource, execTarget, closeExec } = useAppStore()

  useEffect(() => { init() }, [])

  const showListView = LIST_SECTIONS.includes(section)

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Left nav sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex flex-1 min-w-0 min-h-0 bg-slate-50 dark:bg-slate-950/50 transition-colors duration-200">
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
        ) : showListView ? (
          <>
            <ResourceList />
            {selectedResource && (
              <DetailPanel resource={selectedResource} section={section} />
            )}
          </>
        ) : null}
      </div>

      {/* Exec overlay */}
      {execTarget && (
        <ExecPanel target={execTarget} onClose={closeExec} />
      )}
    </div>
  )
}
