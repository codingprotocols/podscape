import React, { useEffect, useState } from 'react'
import { useAppStore } from './store'
import { useShallow } from 'zustand/react/shallow'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import ResourceList, { SECTION_LABELS } from './components/ResourceList'
import DetailPanel from './components/DetailPanel'
import HelmPanel from './components/HelmPanel'
import PortForwardPanel from './components/PortForwardPanel'
import EventsView from './components/EventsView'
import MetricsView from './components/MetricsView'
import SettingsPanel from './components/SettingsPanel'
import UnifiedLogs from './components/UnifiedLogs'
import PageHeader from './components/PageHeader'
import { Search, RefreshCw } from 'lucide-react'
import SecurityHub from './components/SecurityHub'
import TLSCertDashboard from './components/TLSCertDashboard'
import GitOpsPanel from './components/GitOpsPanel'
import NetworkPanel from './components/NetworkPanel'
import ConnectivityTester from './components/ConnectivityTester'
import DebugPodLauncher from './components/DebugPodLauncher'
import KubeConfigOnboarding from './components/KubeConfigOnboarding'
import ExecPanel from './components/ExecPanel'
import CommandPalette from './components/CommandPalette'
import ProviderResourcePanel from './components/ProviderResourcePanel'

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
    execTarget,
    closeExec,
    isProduction,
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
    execTarget: s.execTarget,
    closeExec: s.closeExec,
    isProduction: s.isProduction,
  })))

  const [sidecarCrashed, setSidecarCrashed] = useState(false)
  const [sidecarRestarting, setSidecarRestarting] = useState(false)

  useEffect(() => { init() }, [])

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
              <UnifiedLogs />
            ) : section === 'settings' ? (
              <SettingsPanel />
            ) : section === 'network' ? (
              <NetworkPanel />
            ) : section === 'portforwards' ? (
              <PortForwardPanel />
            ) : section === 'helm' ? (
              <HelmPanel />
            ) : section === 'security' ? (
              <SecurityHub />
            ) : section === 'tls' ? (
              <TLSCertDashboard />
            ) : section === 'gitops' ? (
              <GitOpsPanel />
            ) : section === 'connectivity' ? (
              <ConnectivityTester />
            ) : section === 'debugpod' ? (
              <DebugPodLauncher />
            ) : (section as string).startsWith('istio-') || (section as string).startsWith('traefik-') || (section as string).startsWith('nginx-') ? (
              <ProviderResourcePanel section={section} />
            ) : (LIST_SECTIONS as string[]).includes(section) ? (
              <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
                <PageHeader
                  title={SECTION_LABELS[section] ?? section}
                  subtitle={
                    (() => {
                      const clusterScoped = ['nodes', 'namespaces', 'crds', 'pvs', 'storageclasses', 'clusterroles', 'clusterrolebindings', 'ingressclasses'].includes(section)
                      if (clusterScoped) return 'cluster-wide'
                      return selectedNamespace === '_all' ? 'all namespaces' : (selectedNamespace ?? 'no namespace')
                    })()
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
                  {selectedResource && (
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

      {/* Exec overlay */}
      {execTarget && (
        <ExecPanel target={execTarget} onClose={closeExec} />
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
    </div>
  )
}
