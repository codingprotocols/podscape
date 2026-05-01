import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import { ICONS, Icon } from './Icons'
import { ResourceKind, AnyKubeResource } from '../../types'
import { isMac } from '../../utils/platform'

// Section navigation shortcuts — ordered by frequency of use
const SECTION_SHORTCUTS: Array<{ label: string; section: ResourceKind; icon: string; keywords: string[] }> = [
  { label: 'Dashboard', section: 'dashboard', icon: ICONS.dashboard, keywords: ['home', 'overview'] },
  { label: 'Pods', section: 'pods', icon: ICONS.pod, keywords: ['workload'] },
  { label: 'Deployments', section: 'deployments', icon: ICONS.deploy, keywords: ['workload'] },
  { label: 'DaemonSets', section: 'daemonsets', icon: ICONS.daemonset, keywords: ['workload'] },
  { label: 'StatefulSets', section: 'statefulsets', icon: ICONS.sts, keywords: ['workload'] },
  { label: 'ReplicaSets', section: 'replicasets', icon: ICONS.rs, keywords: ['workload'] },
  { label: 'Jobs', section: 'jobs', icon: ICONS.job, keywords: ['workload', 'batch'] },
  { label: 'CronJobs', section: 'cronjobs', icon: ICONS.cron, keywords: ['workload', 'batch', 'schedule'] },
  { label: 'HPAs', section: 'hpas', icon: ICONS.hpa, keywords: ['autoscaling', 'scale'] },
  { label: 'PodDisruptionBudgets', section: 'pdbs', icon: ICONS.pdb, keywords: ['pdb', 'disruption'] },
  { label: 'Services', section: 'services', icon: ICONS.service, keywords: ['network', 'svc'] },
  { label: 'Ingresses', section: 'ingresses', icon: ICONS.ingress, keywords: ['network', 'routing'] },
  { label: 'Ingress Classes', section: 'ingressclasses', icon: ICONS.ingressclass, keywords: ['network'] },
  { label: 'Network Policies', section: 'networkpolicies', icon: ICONS.netpol, keywords: ['network', 'policy'] },
  { label: 'Endpoints', section: 'endpoints', icon: ICONS.endpoints, keywords: ['network'] },
  { label: 'ConfigMaps', section: 'configmaps', icon: ICONS.configmap, keywords: ['config', 'cm'] },
  { label: 'Secrets', section: 'secrets', icon: ICONS.secret, keywords: ['config', 'credentials'] },
  { label: 'PVCs', section: 'pvcs', icon: ICONS.pvc, keywords: ['storage', 'volume', 'persistent'] },
  { label: 'PVs', section: 'pvs', icon: ICONS.pv, keywords: ['storage', 'volume', 'persistent'] },
  { label: 'Storage Classes', section: 'storageclasses', icon: ICONS.storageclass, keywords: ['storage'] },
  { label: 'Service Accounts', section: 'serviceaccounts', icon: ICONS.sa, keywords: ['rbac', 'auth'] },
  { label: 'Roles', section: 'roles', icon: ICONS.role, keywords: ['rbac', 'auth', 'permission'] },
  { label: 'Cluster Roles', section: 'clusterroles', icon: ICONS.clusterrole, keywords: ['rbac', 'auth'] },
  { label: 'Role Bindings', section: 'rolebindings', icon: ICONS.rolebinding, keywords: ['rbac', 'auth'] },
  { label: 'Cluster Role Bindings', section: 'clusterrolebindings', icon: ICONS.rolebinding, keywords: ['rbac', 'auth'] },
  { label: 'Nodes', section: 'nodes', icon: ICONS.node, keywords: ['cluster', 'infrastructure'] },
  { label: 'Namespaces', section: 'namespaces', icon: ICONS.namespace, keywords: ['cluster'] },
  { label: 'CRDs', section: 'crds', icon: ICONS.crd, keywords: ['cluster', 'custom', 'resources'] },
  { label: 'Events', section: 'events', icon: ICONS.event, keywords: ['observe', 'logs', 'warning'] },
  { label: 'Metrics', section: 'metrics', icon: ICONS.metrics, keywords: ['observe', 'cpu', 'memory', 'usage'] },
  { label: 'Unified Logs', section: 'unifiedlogs', icon: ICONS.terminal, keywords: ['observe', 'logs', 'stream'] },
  { label: 'Port Forwards', section: 'portforwards', icon: ICONS.portforward, keywords: ['network', 'tunnel', 'forward'] },
  { label: 'Network Map', section: 'network', icon: ICONS.network, keywords: ['topology', 'visualize'] },
  { label: 'Connectivity', section: 'connectivity', icon: ICONS.connectivity, keywords: ['test', 'ping', 'curl'] },
  { label: 'Debug Pods', section: 'debugpod', icon: ICONS.debugpod, keywords: ['debug', 'shell', 'exec'] },
  { label: 'Security Hub', section: 'security', icon: ICONS.secret, keywords: ['scan', 'trivy', 'kubesec', 'vulnerability'] },
  { label: 'TLS Certificates', section: 'tls', icon: ICONS.secret, keywords: ['cert', 'ssl', 'x509', 'expiry'] },
  { label: 'GitOps', section: 'gitops', icon: ICONS.deploy, keywords: ['flux', 'argo', 'argocd', 'kustomize', 'gitops'] },
  { label: 'Helm Charts', section: 'helm', icon: ICONS.helm, keywords: ['helm', 'releases', 'charts', 'package'] },
  { label: 'Settings', section: 'settings', icon: ICONS.settings, keywords: ['config', 'preferences', 'theme'] },
]


type ResourceResult = AnyKubeResource & { _kind: ResourceKind; _icon: string }
type ShortcutResult = { _type: 'shortcut'; label: string; section: ResourceKind; icon: string }
type Result = ResourceResult | ShortcutResult

export default function CommandPalette() {
  const {
    isSearchOpen, setSearchOpen,
    searchQuery, setSearchQuery,
    setSection, selectNamespace, selectResource,
    pods, deployments, daemonsets, statefulsets, replicasets,
    jobs, cronjobs, hpas, pdbs,
    services, ingresses, ingressclasses, networkpolicies, endpoints,
    configmaps, secrets,
    pvcs, pvs, storageclasses,
    serviceaccounts, roles, clusterroles, rolebindings, clusterrolebindings,
    nodes, namespaces, crds,
  } = useAppStore(useShallow(s => ({
    isSearchOpen: s.isSearchOpen,
    setSearchOpen: s.setSearchOpen,
    searchQuery: s.searchQuery,
    setSearchQuery: s.setSearchQuery,
    setSection: s.setSection,
    selectNamespace: s.selectNamespace,
    selectResource: s.selectResource,
    pods: s.pods,
    deployments: s.deployments,
    daemonsets: s.daemonsets,
    statefulsets: s.statefulsets,
    replicasets: s.replicasets,
    jobs: s.jobs,
    cronjobs: s.cronjobs,
    hpas: s.hpas,
    pdbs: s.pdbs,
    services: s.services,
    ingresses: s.ingresses,
    ingressclasses: s.ingressclasses,
    networkpolicies: s.networkpolicies,
    endpoints: s.endpoints,
    configmaps: s.configmaps,
    secrets: s.secrets,
    pvcs: s.pvcs,
    pvs: s.pvs,
    storageclasses: s.storageclasses,
    serviceaccounts: s.serviceaccounts,
    roles: s.roles,
    clusterroles: s.clusterroles,
    rolebindings: s.rolebindings,
    clusterrolebindings: s.clusterrolebindings,
    nodes: s.nodes,
    namespaces: s.namespaces,
    crds: s.crds,
  })))

  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  useEffect(() => {
    if (isSearchOpen) setTimeout(() => inputRef.current?.focus(), 50)
  }, [isSearchOpen])

  const close = () => {
    setSearchOpen(false)
    setSearchQuery('')
    setSelectedIndex(0)
  }

  const selectResult = (result: Result) => {
    if ('_type' in result) {
      setSection(result.section)
    } else {
      selectNamespace(result.metadata.namespace ?? '_all')
      setSection(result._kind)
      selectResource(result as AnyKubeResource)
    }
    close()
  }

  const q = searchQuery.toLowerCase().trim()

  const results = useMemo((): Result[] => {
    // Skip all work while the palette is closed — re-runs are triggered by
    // resource array updates and this guard prevents the expensive spread+filter
    // from executing on every background poll when the user has the palette shut.
    if (!isSearchOpen || !q) return []

    // Section shortcuts — match on label + keywords
    const shortcuts: ShortcutResult[] = SECTION_SHORTCUTS
      .filter(s =>
        s.label.toLowerCase().includes(q) ||
        s.keywords.some(k => k.includes(q)) ||
        s.section.includes(q)
      )
      .slice(0, 5)
      .map(s => ({ _type: 'shortcut' as const, label: s.label, section: s.section, icon: s.icon }))

    // Resource results across all 27 resource types
    const allResources: ResourceResult[] = [
      ...pods.map(r => ({ ...r, _kind: 'pods' as ResourceKind, _icon: ICONS.pod })),
      ...deployments.map(r => ({ ...r, _kind: 'deployments' as ResourceKind, _icon: ICONS.deploy })),
      ...daemonsets.map(r => ({ ...r, _kind: 'daemonsets' as ResourceKind, _icon: ICONS.daemonset })),
      ...statefulsets.map(r => ({ ...r, _kind: 'statefulsets' as ResourceKind, _icon: ICONS.sts })),
      ...replicasets.map(r => ({ ...r, _kind: 'replicasets' as ResourceKind, _icon: ICONS.rs })),
      ...jobs.map(r => ({ ...r, _kind: 'jobs' as ResourceKind, _icon: ICONS.job })),
      ...cronjobs.map(r => ({ ...r, _kind: 'cronjobs' as ResourceKind, _icon: ICONS.cron })),
      ...hpas.map(r => ({ ...r, _kind: 'hpas' as ResourceKind, _icon: ICONS.hpa })),
      ...pdbs.map(r => ({ ...r, _kind: 'pdbs' as ResourceKind, _icon: ICONS.pdb })),
      ...services.map(r => ({ ...r, _kind: 'services' as ResourceKind, _icon: ICONS.service })),
      ...ingresses.map(r => ({ ...r, _kind: 'ingresses' as ResourceKind, _icon: ICONS.ingress })),
      ...ingressclasses.map(r => ({ ...r, _kind: 'ingressclasses' as ResourceKind, _icon: ICONS.ingressclass })),
      ...networkpolicies.map(r => ({ ...r, _kind: 'networkpolicies' as ResourceKind, _icon: ICONS.netpol })),
      ...endpoints.map(r => ({ ...r, _kind: 'endpoints' as ResourceKind, _icon: ICONS.endpoints })),
      ...configmaps.map(r => ({ ...r, _kind: 'configmaps' as ResourceKind, _icon: ICONS.configmap })),
      ...secrets.map(r => ({ ...r, _kind: 'secrets' as ResourceKind, _icon: ICONS.secret })),
      ...pvcs.map(r => ({ ...r, _kind: 'pvcs' as ResourceKind, _icon: ICONS.pvc })),
      ...pvs.map(r => ({ ...r, _kind: 'pvs' as ResourceKind, _icon: ICONS.pv })),
      ...storageclasses.map(r => ({ ...r, _kind: 'storageclasses' as ResourceKind, _icon: ICONS.storageclass })),
      ...serviceaccounts.map(r => ({ ...r, _kind: 'serviceaccounts' as ResourceKind, _icon: ICONS.sa })),
      ...roles.map(r => ({ ...r, _kind: 'roles' as ResourceKind, _icon: ICONS.role })),
      ...clusterroles.map(r => ({ ...r, _kind: 'clusterroles' as ResourceKind, _icon: ICONS.clusterrole })),
      ...rolebindings.map(r => ({ ...r, _kind: 'rolebindings' as ResourceKind, _icon: ICONS.rolebinding })),
      ...clusterrolebindings.map(r => ({ ...r, _kind: 'clusterrolebindings' as ResourceKind, _icon: ICONS.rolebinding })),
      ...nodes.map(r => ({ ...r, _kind: 'nodes' as ResourceKind, _icon: ICONS.node })),
      ...namespaces.map(r => ({ ...r, _kind: 'namespaces' as ResourceKind, _icon: ICONS.namespace })),
      ...crds.map(r => ({ ...r, _kind: 'crds' as ResourceKind, _icon: ICONS.crd })),
    ]

    const matchedResources = allResources
      .filter(r => r.metadata.name.toLowerCase().includes(q))
      .slice(0, 12)

    return [...shortcuts, ...matchedResources]
  }, [
    isSearchOpen,
    pods, deployments, daemonsets, statefulsets, replicasets,
    jobs, cronjobs, hpas, pdbs,
    services, ingresses, ingressclasses, networkpolicies, endpoints,
    configmaps, secrets, pvcs, pvs, storageclasses,
    serviceaccounts, roles, clusterroles, rolebindings, clusterrolebindings,
    nodes, namespaces, crds,
    q
  ])

  useEffect(() => { setSelectedIndex(0) }, [searchQuery])

  useEffect(() => {
    const handleOpen = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (isSearchOpen) close()
        else setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleOpen)
    return () => window.removeEventListener('keydown', handleOpen)
  }, [isSearchOpen])

  useEffect(() => {
    const handleEvents = (e: KeyboardEvent) => {
      if (!isSearchOpen) return
      if (e.key === 'Escape') {
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (results.length > 0) setSelectedIndex(prev => (prev + 1) % results.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (results.length > 0) setSelectedIndex(prev => (prev - 1 + results.length) % results.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (results[selectedIndex]) selectResult(results[selectedIndex])
      }
    }
    window.addEventListener('keydown', handleEvents)
    return () => window.removeEventListener('keydown', handleEvents)
  }, [isSearchOpen, results, selectedIndex])

  if (!isSearchOpen) return null

  const shortcuts = results.filter((r): r is ShortcutResult => '_type' in r)
  const resources = results.filter((r): r is ResourceResult => !('_type' in r))
  const shortcutOffset = 0
  const resourceOffset = shortcuts.length

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4 pointer-events-auto"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={close}
      />

      {/* Palette Container */}
      <div
        ref={overlayRef}
        className="relative w-full max-w-[640px] bg-slate-900/90 backdrop-blur-2xl border border-white/10
                   rounded-2xl shadow-[0_32px_128px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col
                   animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Search Input */}
        <div className="relative group border-b border-white/5">
          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search resources or jump to a section..."
            className="w-full bg-transparent text-slate-100 text-[16px] font-medium
                       pl-14 pr-16 py-5 focus:outline-none placeholder:text-slate-600"
          />
          <div className="absolute right-5 top-1/2 -translate-y-1/2">
            <kbd className="bg-white/5 text-slate-500 text-[10px] font-black px-1.5 py-0.5 rounded border border-white/10">ESC</kbd>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 max-h-[440px] overflow-y-auto py-2 scrollbar-hide">
          {!q ? (
            <div className="px-5 py-8 text-center">
              <p className="text-slate-500 text-sm font-medium">
                Type to search resources or navigate to a section
              </p>
              <div className="flex items-center justify-center gap-4 mt-4">
                <div className="flex items-center gap-1.5">
                  <kbd className="bg-white/5 text-slate-400 font-black px-1.5 py-0.5 rounded border border-white/10 text-[10px]">↵</kbd>
                  <span className="text-[10px] text-slate-600">select</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="bg-white/5 text-slate-400 font-black px-1.5 py-0.5 rounded border border-white/10 text-[10px]">↑↓</kbd>
                  <span className="text-[10px] text-slate-600">navigate</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="bg-white/5 text-slate-400 font-black px-1 py-0.5 rounded border border-white/10 text-[10px]">{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
                  <span className="text-[10px] text-slate-600">toggle</span>
                </div>
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-slate-400 text-sm font-bold">No results for "{searchQuery}"</p>
            </div>
          ) : (
            <div className="px-2 space-y-1">
              {/* Section shortcuts */}
              {shortcuts.length > 0 && (
                <>
                  <p className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Sections
                  </p>
                  {shortcuts.map((r, i) => {
                    const idx = shortcutOffset + i
                    return (
                      <button
                        ref={el => itemRefs.current[idx] = el}
                        key={r.section}
                        onClick={() => selectResult(r)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex items-center gap-4 w-full px-4 py-3 text-[14px] font-bold transition-all group rounded-xl text-left
                                   ${idx === selectedIndex ? 'bg-blue-500/10 text-slate-100 ring-1 ring-blue-500/20' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]'}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${idx === selectedIndex ? 'bg-blue-500/20' : 'bg-white/5 group-hover:bg-blue-500/10'}`}>
                          <Icon path={r.icon} size={16} className={idx === selectedIndex ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`truncate leading-none ${idx === selectedIndex ? 'text-white' : 'text-slate-200'}`}>{r.label}</p>
                          <p className={`text-[10px] font-semibold mt-1 uppercase tracking-widest ${idx === selectedIndex ? 'text-blue-400/80' : 'text-slate-600'}`}>
                            Navigate to section
                          </p>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          className={`transition-opacity ${idx === selectedIndex ? 'opacity-100 text-blue-500' : 'opacity-0 group-hover:opacity-50'}`}>
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      </button>
                    )
                  })}
                </>
              )}

              {/* Resource results */}
              {resources.length > 0 && (
                <>
                  <p className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mt-1">
                    Resources ({resources.length})
                  </p>
                  {resources.map((r, i) => {
                    const idx = resourceOffset + i
                    const kindLabel = r._kind.replace(/s$/, '')
                    return (
                      <button
                        ref={el => itemRefs.current[idx] = el}
                        key={`${r._kind}-${r.metadata.uid}`}
                        onClick={() => selectResult(r)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`flex items-center gap-4 w-full px-4 py-3.5 text-[14px] font-bold transition-all group rounded-xl text-left
                                   ${idx === selectedIndex ? 'bg-blue-500/10 text-slate-100 ring-1 ring-blue-500/20' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]'}`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${idx === selectedIndex ? 'bg-blue-500/20' : 'bg-white/5 group-hover:bg-blue-500/10'}`}>
                          <Icon path={r._icon} size={18} className={idx === selectedIndex ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`truncate leading-none mb-1.5 ${idx === selectedIndex ? 'text-white' : 'text-slate-200'}`}>{r.metadata.name}</p>
                          <p className={`text-[11px] font-semibold truncate uppercase tracking-widest ${idx === selectedIndex ? 'text-blue-400/80' : 'text-slate-500'}`}>
                            {kindLabel} • {r.metadata.namespace ?? 'cluster'}
                          </p>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                          className={`transition-opacity text-blue-500 ${idx === selectedIndex ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                      </button>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <kbd className="bg-white/5 text-slate-400 font-black px-1 py-0.5 rounded border border-white/10 text-[9px]">↵</kbd>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">select</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="bg-white/5 text-slate-400 font-black px-1 py-0.5 rounded border border-white/10 text-[9px]">↑↓</kbd>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">navigate</span>
            </div>
          </div>
          <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.2em]">{isMac ? '⌘K' : 'Ctrl+K'} Quick Find</p>
        </div>
      </div>
    </div>
  )
}
