const warn = (path: string) => (err: unknown) =>
  console.warn(`[prefetch] failed to load ${path}:`, err)

export function prefetchPanels() {
  import('../components/panels/HelmPanel').catch(warn('HelmPanel'))
  import('../components/panels/UnifiedLogs').catch(warn('UnifiedLogs'))
  import('../components/advanced/SecurityHub').catch(warn('SecurityHub'))
  import('../components/panels/TLSCertDashboard').catch(warn('TLSCertDashboard'))
  import('../components/panels/GitOpsPanel').catch(warn('GitOpsPanel'))
  import('../components/panels/NetworkPanel').catch(warn('NetworkPanel'))
  import('../components/advanced/ConnectivityTester').catch(warn('ConnectivityTester'))
  import('../components/advanced/DebugPodLauncher').catch(warn('DebugPodLauncher'))
  import('../components/panels/ProviderResourcePanel').catch(warn('ProviderResourcePanel'))
  import('../components/panels/CostPanel').catch(warn('CostPanel'))
}

