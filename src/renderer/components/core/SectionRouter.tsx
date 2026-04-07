import React, { Suspense } from 'react'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import { Search, RefreshCw } from 'lucide-react'
import { LIST_SECTIONS, CLUSTER_SCOPED_SECTIONS, SECTION_LABELS, PROVIDER_SECTIONS } from '../../config'
import { KubeCRD, ResourceKind } from '../../types'

import Dashboard from './Dashboard'
import ResourceList from './ResourceList'
import DetailPanel from './DetailPanel'
import CRDDetail from '../resource-details/cluster/CRDDetail'
import PortForwardPanel from '../panels/PortForwardPanel'
import EventsView from '../panels/EventsView'
import MetricsView from '../panels/MetricsView'
import SettingsPanel from '../panels/SettingsPanel'
import PageHeader from './PageHeader'
import KubeConfigOnboarding from './KubeConfigOnboarding'
import ExecPanel from '../panels/ExecPanel'
import ErrorBoundary from './ErrorBoundary'

// Lazy-loaded heavy panels
const HelmPanel = React.lazy(() => import('../panels/HelmPanel'))
const UnifiedLogs = React.lazy(() => import('../panels/UnifiedLogs'))
const SecurityHub = React.lazy(() => import('../advanced/SecurityHub'))
const TLSCertDashboard = React.lazy(() => import('../panels/TLSCertDashboard'))
const GitOpsPanel = React.lazy(() => import('../panels/GitOpsPanel'))
const NetworkPanel = React.lazy(() => import('../panels/NetworkPanel'))
const ConnectivityTester = React.lazy(() => import('../advanced/ConnectivityTester'))
const DebugPodLauncher = React.lazy(() => import('../advanced/DebugPodLauncher'))
const ProviderResourcePanel = React.lazy(() => import('../panels/ProviderResourcePanel'))
const CostPanel = React.lazy(() => import('../panels/CostPanel'))

// Sections that render directly (no Suspense needed)
const DIRECT_PANELS: Partial<Record<ResourceKind, React.ComponentType>> = {
  dashboard: Dashboard,
  events: EventsView,
  metrics: MetricsView,
  settings: SettingsPanel,
  portforwards: PortForwardPanel,
}

// Sections that are code-split and need Suspense
const LAZY_PANELS: Partial<Record<ResourceKind, React.LazyExoticComponent<React.ComponentType>>> = {
  unifiedlogs: UnifiedLogs,
  network: NetworkPanel,
  helm: HelmPanel,
  security: SecurityHub,
  tls: TLSCertDashboard,
  gitops: GitOpsPanel,
  connectivity: ConnectivityTester,
  debugpod: DebugPodLauncher,
  cost: CostPanel,
}


export default function SectionRouter(): JSX.Element {
  const {
    section,
    selectedNamespace,
    selectedResource,
    searchQuery,
    setSearchQuery,
    loadingResources,
    refresh,
    kubeconfigOk,
    selectResource,
  } = useAppStore(useShallow(s => ({
    section: s.section,
    selectedNamespace: s.selectedNamespace,
    selectedResource: s.selectedResource,
    searchQuery: s.searchQuery,
    setSearchQuery: s.setSearchQuery,
    loadingResources: s.loadingResources,
    refresh: s.refresh,
    kubeconfigOk: s.kubeconfigOk,
    selectResource: s.selectResource,
  })))

  if (!kubeconfigOk) {
    return <KubeConfigOnboarding />
  }

  const DirectPanel = DIRECT_PANELS[section]
  const LazyPanel = LAZY_PANELS[section]
  const isProviderSection = PROVIDER_SECTIONS.has(section)

  return (
    <ErrorBoundary resetKey={section}>
      {DirectPanel ? (
        <DirectPanel />
      ) : LazyPanel ? (
        <Suspense fallback={null}><LazyPanel /></Suspense>
      ) : section === 'multi-terminal' ? (
        <div className="flex flex-col flex-1 h-full animate-in fade-in duration-500">
          <PageHeader title="Multi-Terminal" subtitle="Manage multiple sessions" />
          <div className="flex-1 min-h-0 bg-[#0a0c10] p-6">
            <div className="h-full w-full rounded-3xl overflow-hidden border border-white/5 shadow-2xl relative">
              <ExecPanel embedded />
            </div>
          </div>
        </div>
      ) : isProviderSection ? (
        <Suspense fallback={null}><ProviderResourcePanel section={section} /></Suspense>
      ) : section === 'crds' && selectedResource ? (
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden animate-in fade-in duration-200">
          <CRDDetail crd={selectedResource as KubeCRD} onBack={() => selectResource(null)} />
        </div>
      ) : LIST_SECTIONS.includes(section) ? (
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          <PageHeader
            title={SECTION_LABELS[section] ?? section}
            subtitle={
                CLUSTER_SCOPED_SECTIONS.has(section)
                ? 'cluster-wide'
                : selectedNamespace === '_all' ? 'all namespaces' : (selectedNamespace ?? 'no namespace')
            }
          >
            <div className="flex items-center gap-3">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="text"
                  placeholder="Filter resources..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 text-[11px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl
                             focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-48"
                />
              </div>

              <button
                onClick={refresh}
                disabled={loadingResources}
                className="flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300
                           glass-panel hover:bg-white/10 dark:hover:bg-white/5 rounded-xl shadow-sm
                           disabled:opacity-50 active:scale-95 border border-slate-200 dark:border-white/5"
              >
                <RefreshCw className={`w-4 h-4 transition-transform duration-700 ${loadingResources ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </PageHeader>

          <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden relative">
            <ResourceList />
            {selectedResource && (
                <ErrorBoundary key={selectedResource.metadata.uid}>
                    <DetailPanel resource={selectedResource} section={section} />
                </ErrorBoundary>
            )}
          </div>

        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-slate-400">
          Section not implemented: {section}
        </div>
      )}
    </ErrorBoundary>
  )
}
