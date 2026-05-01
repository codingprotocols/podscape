import React, { Suspense, useState, useCallback } from 'react'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import { Search, Terminal } from 'lucide-react'
import { RefreshButton } from '../common'
import { LIST_SECTIONS, CLUSTER_SCOPED_SECTIONS, SECTION_LABELS, PROVIDER_SECTIONS } from '../../config'
import { KubeCRD, ResourceKind } from '../../types'
import type { CreatableKind } from '../common/CreateResourceModal'
import { canVerb } from '../../store/slices/clusterSlice'
import { useAutoRefresh } from '../../hooks/useAutoRefresh'

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
const KrewPanel = React.lazy(() => import('../panels/KrewPanel'))

const CREATABLE_SECTIONS: Partial<Record<string, CreatableKind>> = {
  deployments: 'deployment',
  services: 'service',
  configmaps: 'configmap',
  secrets: 'secret',
  namespaces: 'namespace',
}

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
  krew: KrewPanel,
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
    execSessions,
    allowedVerbs,
    openCreate,
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
    execSessions: s.execSessions,
    allowedVerbs: s.allowedVerbs,
    openCreate: s.openCreate,
  })))

  useAutoRefresh(LIST_SECTIONS.includes(section), refresh)

  // Local refreshing flag so the RefreshButton spins for the duration of the
  // async fetch without setting loadingResources (which would replace the list
  // with a full-screen spinner and cause a flicker).
  const [refreshing, setRefreshing] = useState(false)
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try { await refresh() } finally { setRefreshing(false) }
  }, [refresh])

  if (!kubeconfigOk) {
    return <KubeConfigOnboarding />
  }

  const creatableKind = CREATABLE_SECTIONS[section]

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
              {execSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600">
                  <Terminal size={32} className="opacity-30" />
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">No active sessions</p>
                  <p className="text-[11px] text-slate-600 text-center max-w-xs">
                    Open any pod detail panel and click <span className="font-bold text-slate-500">Open Shell</span> to start a terminal session here.
                  </p>
                </div>
              ) : (
                <ExecPanel embedded />
              )}
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

              <RefreshButton
                onClick={handleRefresh}
                loading={refreshing || loadingResources}
                title="Refresh"
              />

              {creatableKind && canVerb(allowedVerbs, section, 'create') && (
                <button
                  type="button"
                  onClick={() => openCreate(creatableKind)}
                  className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold rounded-xl
                             bg-blue-600 hover:bg-blue-500 text-white transition-colors
                             shadow-sm shadow-blue-500/30"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M5 1v8M1 5h8" />
                  </svg>
                  New
                </button>
              )}
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
