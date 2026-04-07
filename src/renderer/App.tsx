import React, { useEffect, useState, Suspense } from 'react'
import { useAppStore } from './store'
import { useShallow } from 'zustand/react/shallow'
import Sidebar from './components/core/Sidebar'
import Dashboard from './components/core/Dashboard'
import ResourceList, { SECTION_LABELS } from './components/core/ResourceList'
import DetailPanel from './components/core/DetailPanel'
import CRDDetail from './components/resource-details/cluster/CRDDetail'
import { KubeCRD } from './types'
import PortForwardPanel from './components/panels/PortForwardPanel'
import EventsView from './components/panels/EventsView'
import MetricsView from './components/panels/MetricsView'
import SettingsPanel from './components/panels/SettingsPanel'
import PageHeader from './components/core/PageHeader'
import { Search, RefreshCw, ShieldCheck } from 'lucide-react'
import KubeConfigOnboarding from './components/core/KubeConfigOnboarding'
import ExecPanel from './components/panels/ExecPanel'
import CommandPalette from './components/core/CommandPalette'
import UpdateBanner from './components/core/UpdateBanner'
import TourOverlay from './components/core/TourOverlay'

// Heavy panels — split into separate chunks but prefetched eagerly after mount
const HelmPanel = React.lazy(() => import('./components/panels/HelmPanel'))
const UnifiedLogs = React.lazy(() => import('./components/panels/UnifiedLogs'))
const SecurityHub = React.lazy(() => import('./components/advanced/SecurityHub'))
const TLSCertDashboard = React.lazy(() => import('./components/panels/TLSCertDashboard'))
const GitOpsPanel = React.lazy(() => import('./components/panels/GitOpsPanel'))
const NetworkPanel = React.lazy(() => import('./components/panels/NetworkPanel'))
const ConnectivityTester = React.lazy(() => import('./components/advanced/ConnectivityTester'))
const DebugPodLauncher = React.lazy(() => import('./components/advanced/DebugPodLauncher'))
const ProviderResourcePanel = React.lazy(() => import('./components/panels/ProviderResourcePanel'))
const CostPanel = React.lazy(() => import('./components/panels/CostPanel'))

// Kick off background prefetch after the initial render so chunks are cached
// before the user clicks — eliminates the per-panel loading delay
function prefetchPanels() {
  import('./components/panels/HelmPanel')
  import('./components/panels/UnifiedLogs')
  import('./components/advanced/SecurityHub')
  import('./components/panels/TLSCertDashboard')
  import('./components/panels/GitOpsPanel')
  import('./components/panels/NetworkPanel')
  import('./components/advanced/ConnectivityTester')
  import('./components/advanced/DebugPodLauncher')
  import('./components/panels/ProviderResourcePanel')
  import('./components/panels/CostPanel')
}

// Error boundary for individual sections to prevent one failing fetch from crashing the entire app
class ErrorBoundary extends React.Component<{ children: React.ReactNode; resetKey?: string }, { error: Error | null }> {
  constructor(props: any) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidUpdate(prevProps: any) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in duration-500">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6 text-red-500">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
          </div>
          <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2 tracking-tight">Something went wrong</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-sm leading-relaxed">
            There was an error loading this section. This usually happens if the resource type is not supported by your cluster version.
          </p>
          <pre className="text-[10px] font-mono bg-red-500/5 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6 max-w-lg overflow-auto border border-red-500/10">
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

// Cluster-scoped sections (show "cluster-wide" subtitle instead of namespace)
const CLUSTER_SCOPED_SECTIONS = new Set([
  'nodes', 'namespaces', 'crds', 'pvs', 'storageclasses',
  'clusterroles', 'clusterrolebindings', 'ingressclasses',
])

export default function App(): JSX.Element {
  const {
    init,
    section,
    selectedNamespace,
    selectedResource,
    searchQuery,
    setSearchQuery,
    loadingResources,
    refresh,
    error,
    clearError,
    kubeconfigOk,
    selectedContext,
    execSessions,
    isProduction,
    securityScanning,
    scanInBackground,
    setSection,
    selectResource,
  } = useAppStore(useShallow(s => ({
    init: s.init,
    section: s.section,
    selectedNamespace: s.selectedNamespace,
    selectedResource: s.selectedResource,
    searchQuery: s.searchQuery,
    setSearchQuery: s.setSearchQuery,
    loadingResources: s.loadingResources,
    refresh: s.refresh,
    error: s.error,
    clearError: s.clearError,
    kubeconfigOk: s.kubeconfigOk,
    selectedContext: s.selectedContext,
    execSessions: s.execSessions,
    isProduction: s.isProduction,
    securityScanning: s.securityScanning,
    scanInBackground: s.scanInBackground,
    setSection: s.setSection,
    selectResource: s.selectResource,
  })))

  const [sidecarCrashed, setSidecarCrashed] = useState(false)
  const [sidecarRestarting, setSidecarRestarting] = useState(false)
  const [showTour, setShowTour] = useState(false)

  useEffect(() => { init() }, [])

  // Prefetch all lazy panel chunks in the background after initial render
  useEffect(() => { prefetchPanels() }, [])

  useEffect(() => {
    if (!kubeconfigOk) return
    window.settings.get().then(s => {
      if (!s.tourCompleted) setShowTour(true)
    }).catch(() => { /* ignore */ })
  }, [kubeconfigOk])

  const handleTourDone = async () => {
    setShowTour(false)
    try {
      const s = await window.settings.get()
      await window.settings.set({ ...s, tourCompleted: true })
    } catch (err) {
      console.error('Failed to save tour status:', err)
    }
  }

  useEffect(() => {
    const unlisten = (window as any).sidecar?.onCrashed(() => {
      setSidecarCrashed(true)
    })
    return () => { if (unlisten) unlisten() }
  }, [])

  const handleSidecarRestart = async () => {
    setSidecarRestarting(true)
    try {
      await (window as any).sidecar?.restart()
      setSidecarCrashed(false)
      window.location.reload()
    } catch (err) {
      console.error('Failed to restart sidecar:', err)
    } finally {
      setSidecarRestarting(false)
    }
  }

  return (
    <div className={`flex h-screen overflow-hidden bg-white dark:bg-[hsl(var(--bg-dark))] text-slate-900 dark:text-slate-100 transition-all duration-300 ${isProduction ? 'ring-inset ring-4 ring-red-500/50' : ''}`}>
      <UpdateBanner />
      {securityScanning && scanInBackground && section !== 'security' && (
        <button
          onClick={() => setSection('security')}
          className="fixed bottom-5 right-5 z-[9999] flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-900 dark:bg-slate-800 border border-emerald-500/30 shadow-2xl shadow-black/40 text-white text-[11px] font-bold hover:border-emerald-400/50 transition-all"
        >
          <div className="w-3.5 h-3.5 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin shrink-0" />
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          Security scan running…
          <span className="text-[10px] text-emerald-400 font-semibold">View →</span>
        </button>
      )}
      {sidecarCrashed && (
        <div className="fixed inset-x-0 top-0 z-[10001] flex items-center gap-3 px-4 py-2.5 bg-red-600 text-white text-xs font-medium shadow-lg">
          <span className="flex-1">Connection to cluster lost — the backend process exited unexpectedly.</span>
          <button
            onClick={handleSidecarRestart}
            disabled={sidecarRestarting}
            className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded font-bold transition-colors disabled:opacity-50"
          >
            {sidecarRestarting ? 'Reconnecting…' : 'Reconnect'}
          </button>
        </div>
      )}
      {isProduction && (
        <div className="fixed top-0 left-1/2 -translate-x-1/2 z-[10000] pointer-events-none">
          <div className="bg-red-600 text-[10px] font-black tracking-[0.2em] text-white px-6 py-1 rounded-b-xl shadow-2xl border-x border-b border-red-500/50 animate-in slide-in-from-top duration-500">
            PRODUCTION CONTEXT ACTIVE
          </div>
        </div>
      )}
      {/* Left nav sidebar */}
      {!kubeconfigOk ? null : (
        <ErrorBoundary>
          <Sidebar />
        </ErrorBoundary>
      )}

      {/* Main content */}
      <div className="flex flex-1 min-w-0 min-h-0 bg-slate-50 dark:bg-[hsl(var(--bg-dark))]">
        {!kubeconfigOk ? (
          <KubeConfigOnboarding />
        ) : (
          <ErrorBoundary resetKey={section}>
            {section === 'dashboard' ? (
              <Dashboard />
            ) : section === 'events' ? (
              <EventsView />
            ) : section === 'metrics' ? (
              <MetricsView />
            ) : section === 'unifiedlogs' ? (
              <Suspense fallback={null}><UnifiedLogs /></Suspense>
            ) : section === 'settings' ? (
              <SettingsPanel />
            ) : section === 'network' ? (
              <Suspense fallback={null}><NetworkPanel /></Suspense>
            ) : section === 'portforwards' ? (
              <PortForwardPanel />
            ) : section === 'multi-terminal' ? (
              <div className="flex flex-col flex-1 h-full animate-in fade-in duration-500">
                <PageHeader title="Multi-Terminal" subtitle="Manage multiple sessions" />
                <div className="flex-1 min-h-0 bg-[#0a0c10] p-6">
                   <div className="h-full w-full rounded-3xl overflow-hidden border border-white/5 shadow-2xl relative">
                      <ExecPanel embedded />
                   </div>
                </div>
              </div>
            ) : section === 'helm' ? (
              <Suspense fallback={null}><HelmPanel /></Suspense>
            ) : section === 'security' ? (
              <Suspense fallback={null}><SecurityHub /></Suspense>
            ) : section === 'tls' ? (
              <Suspense fallback={null}><TLSCertDashboard /></Suspense>
            ) : section === 'gitops' ? (
              <Suspense fallback={null}><GitOpsPanel /></Suspense>
            ) : section === 'connectivity' ? (
              <Suspense fallback={null}><ConnectivityTester /></Suspense>
            ) : section === 'debugpod' ? (
              <Suspense fallback={null}><DebugPodLauncher /></Suspense>
            ) : section === 'cost' ? (
              <Suspense fallback={null}><CostPanel /></Suspense>
            ) : (section as string).startsWith('istio-') || (section as string).startsWith('traefik-') || (section as string).startsWith('nginx-') ? (
              <Suspense fallback={null}><ProviderResourcePanel section={section} /></Suspense>
            ) : section === 'crds' && selectedResource ? (
              <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden animate-in fade-in duration-200">
                <CRDDetail crd={selectedResource as KubeCRD} onBack={() => selectResource(null)} />
              </div>
            ) : (LIST_SECTIONS as string[]).includes(section) ? (
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
                      Sync
                    </button>
                  </div>
                </PageHeader>

                <div className="flex flex-1 min-w-0 overflow-hidden">
                  <ResourceList />
                  {selectedResource && section !== 'crds' && (
                    <ErrorBoundary key={selectedResource.metadata.uid}>
                      <DetailPanel resource={selectedResource} section={section} />
                    </ErrorBoundary>
                  )}
                </div>
              </div>
            ) : null}
          </ErrorBoundary>
        )}
      </div>

      {/* Terminal Overlay */}
      {execSessions.length > 0 && (
        <ExecPanel />
      )}
      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 right-4 z-[9999] animate-in slide-in-from-top duration-300">
          <div className="bg-[#1e1e2e] text-white px-5 py-4 rounded-2xl shadow-2xl flex items-start gap-3 max-w-sm border border-red-500/40">
            <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-400 mb-1">Error</p>
              <p className="text-sm text-slate-200 leading-snug break-words">{error}</p>
              <button
                onClick={() => { clearError(); refresh() }}
                className="mt-2.5 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
              >
                Retry
              </button>
            </div>
            <button onClick={clearError} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors mt-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Command Palette Overlay */}
      <CommandPalette />
      {showTour && kubeconfigOk && <TourOverlay onDone={handleTourDone} />}
    </div>
  )
}
