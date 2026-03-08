import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { ResourceKind } from '../types'

// ─── Icon components (inline SVG to avoid extra deps issues) ──────────────────

const Icon = ({ path, size = 16, className = "" }: { path: string; size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={path} />
  </svg>
)

// Nav section group
function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const storageKey = `podscape:nav:${title}`
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    return saved !== null ? saved === 'true' : true
  })

  useEffect(() => {
    localStorage.setItem(storageKey, String(open))
  }, [open, storageKey])

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full px-4 py-2 text-[10px] font-bold
                   text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        <span className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
            <path d="M0 2l4 4 4-4H0z" />
          </svg>
        </span>
        {title}
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  )
}

// Individual nav item
function NavItem({
  label, section, icon, badge
}: { label: string; section: ResourceKind; icon?: string; badge?: number }) {
  const { section: active, setSection } = useAppStore()
  const isActive = active === section
  return (
    <button
      onClick={() => setSection(section)}
      className={`flex items-center gap-3 w-full px-4 py-2 text-sm font-medium
                  transition-all duration-200 group relative
        ${isActive
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50'
        }`}
    >
      {isActive && (
        <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-blue-600 dark:bg-blue-500 rounded-r-full" />
      )}
      {icon && <Icon path={icon} size={16} className={isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'} />}
      <span className="flex-1 text-left">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold
          ${isActive
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
          {badge > 999 ? '999+' : badge}
        </span>
      )}
    </button>
  )
}

// ─── Icons paths ──────────────────────────────────────────────────────────────
const ICONS = {
  pod: 'M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5',
  deploy: 'M4 17l6-5-6-5M12 19h8',
  daemonset: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2',
  sts: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z',
  rs: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  job: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  cron: 'M12 2a10 10 0 100 20A10 10 0 0012 2zm0 6v6l3 3',
  hpa: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10',
  pdb: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  service: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
  ingress: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9',
  ingressclass: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3M8 12a4 4 0 108 0 4 4 0 00-8 0z',
  netpol: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM4.93 7l3.54 3.54M15.54 7l-3.54 3.54M7 15.07l3.54-3.54M17.07 15.07l-3.54-3.54',
  endpoints: 'M15 12a3 3 0 11-6 0 3 3 0 016 0zM5 12H3m18 0h-2M12 5V3m0 18v-2',
  portforward: 'M5 12h14M12 5l7 7-7 7',
  configmap: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  secret: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  pvc: 'M2 20h20M4 20V8m16 12V8M8 20v-6h8v6M12 8V4M4 8h16',
  pv: 'M22 12H2M22 12l-4-4M22 12l-4 4M2 12l4 4M2 12l4-4',
  storageclass: 'M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.58 4 8 4s8-1.79 8-4M4 7c0-2.21 3.58-4 8-4s8 1.79 8 4',
  sa: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  role: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  clusterrole: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  rolebinding: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  node: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  namespace: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  crd: 'M12 2a5 5 0 100 10A5 5 0 0012 2zm-7 14a7 7 0 0114 0',
  event: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  metrics: 'M3 3v18h18M18.5 8l-5.5 5.5-3-3L7 14',
  grafana: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  terminal: 'M4 17l6-6-6-6M12 19h8',
  extension: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z',
  network: 'M12 5a2 2 0 100-4 2 2 0 000 4zm-7 7a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4zm-7 7a2 2 0 100-4 2 2 0 000 4zM5 12H2m10-7V2m7 10h3M12 17v3M7.05 7.05L5 5m9.95 2.05L17 5M7.05 16.95L5 19m9.95-2.05L17 19',
  helm: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM12 22.08V12M3.27 6.96L12 12.01l8.73-5.05'
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export default function Sidebar(): JSX.Element {
  const {
    contexts, selectedContext, namespaces, selectedNamespace,
    loadingContexts, loadingNamespaces,
    selectContext, selectNamespace, error, clearError,
    pods, deployments, events
  } = useAppStore()

  return (
    <div className="flex flex-col w-64 border-r bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 h-full shrink-0 transition-colors duration-200">
      {/* App header */}
      <div className="px-6 py-8 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Icon path={ICONS.pod} size={16} className="text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Podscape</span>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-4">
        {/* Context selector */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-2">
            Cluster
          </label>
          {loadingContexts ? (
            <Spinner text="Loading..." />
          ) : (
            <div className="relative group">
              <select
                className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs rounded-lg px-3 py-2
                           border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2
                           focus:ring-blue-500/40 appearance-none cursor-pointer transition-all"
                value={selectedContext ?? ''}
                onChange={e => selectContext(e.target.value)}
              >
                {contexts.length === 0 && <option value="" disabled>No clusters</option>}
                {contexts.map(ctx => (
                  <option key={ctx.name} value={ctx.name}>{ctx.name}</option>
                ))}
              </select>
              <div className="absolute right-3 top-2.5 pointer-events-none text-slate-400">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2.5 4l2.5 2.5L7.5 4H2.5z" /></svg>
              </div>
            </div>
          )}
        </div>

        {/* Namespace selector */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-2">
            Namespace
          </label>
          {loadingNamespaces ? (
            <Spinner text="Loading..." />
          ) : (
            <div className="relative">
              <select
                className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs rounded-lg px-3 py-2
                           border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2
                           focus:ring-blue-500/40 appearance-none cursor-pointer transition-all"
                value={selectedNamespace ?? ''}
                onChange={e => selectNamespace(e.target.value)}
              >
                {!selectedContext && <option value="" disabled>Select cluster</option>}
                {selectedContext && namespaces.length === 0 && <option value="" disabled>No namespaces</option>}
                {namespaces.length > 0 && <option value="_all">All Namespaces</option>}
                {namespaces.map(ns => (
                  <option key={ns.metadata.name} value={ns.metadata.name}>{ns.metadata.name}</option>
                ))}
              </select>
              <div className="absolute right-3 top-2.5 pointer-events-none text-slate-400">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2.5 4l2.5 2.5L7.5 4H2.5z" /></svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation tree */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-hide">
        <div className="px-2 mb-4">
          <NavItem
            label="Dashboard"
            section="dashboard"
            icon="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </div>

        <NavGroup title="Workloads">
          <NavItem label="Pods" section="pods" icon={ICONS.pod} badge={pods.length || undefined} />
          <NavItem label="Deployments" section="deployments" icon={ICONS.deploy} badge={deployments.length || undefined} />
          <NavItem label="DaemonSets" section="daemonsets" icon={ICONS.daemonset} />
          <NavItem label="StatefulSets" section="statefulsets" icon={ICONS.sts} />
          <NavItem label="ReplicaSets" section="replicasets" icon={ICONS.rs} />
          <NavItem label="Jobs" section="jobs" icon={ICONS.job} />
          <NavItem label="CronJobs" section="cronjobs" icon={ICONS.cron} />
        </NavGroup>

        <NavGroup title="Autoscaling">
          <NavItem label="HPA" section="hpas" icon={ICONS.hpa} />
          <NavItem label="Pod Disruption Budgets" section="pdbs" icon={ICONS.pdb} />
        </NavGroup>

        <NavGroup title="Network">
          <NavItem label="Services" section="services" icon={ICONS.service} />
          <NavItem label="Ingresses" section="ingresses" icon={ICONS.ingress} />
          <NavItem label="Ingress Classes" section="ingressclasses" icon={ICONS.ingressclass} />
          <NavItem label="Network Policies" section="networkpolicies" icon={ICONS.netpol} />
          <NavItem label="Endpoints" section="endpoints" icon={ICONS.endpoints} />
          <NavItem label="Port Forwards" section="portforwards" icon={ICONS.portforward} />
          <NavItem label="Network Map" section="network" icon={ICONS.network} />
        </NavGroup>

        <NavGroup title="Config">
          <NavItem label="ConfigMaps" section="configmaps" icon={ICONS.configmap} />
          <NavItem label="Secrets" section="secrets" icon={ICONS.secret} />
        </NavGroup>

        <NavGroup title="Storage">
          <NavItem label="PVCs" section="pvcs" icon={ICONS.pvc} />
          <NavItem label="PVs" section="pvs" icon={ICONS.pv} />
          <NavItem label="Storage Classes" section="storageclasses" icon={ICONS.storageclass} />
        </NavGroup>

        <NavGroup title="RBAC">
          <NavItem label="Service Accounts" section="serviceaccounts" icon={ICONS.sa} />
          <NavItem label="Roles" section="roles" icon={ICONS.role} />
          <NavItem label="Cluster Roles" section="clusterroles" icon={ICONS.clusterrole} />
          <NavItem label="Role Bindings" section="rolebindings" icon={ICONS.rolebinding} />
          <NavItem label="Cluster Role Bindings" section="clusterrolebindings" icon={ICONS.rolebinding} />
        </NavGroup>

        <NavGroup title="Cluster">
          <NavItem label="Nodes" section="nodes" icon={ICONS.node} />
          <NavItem label="Namespaces" section="namespaces" icon={ICONS.namespace} />
          <NavItem label="CRDs" section="crds" icon={ICONS.crd} />
        </NavGroup>

        <NavGroup title="Observe">
          <NavItem label="Events" section="events" icon={ICONS.event} badge={events.filter(e => e.type === 'Warning').length || undefined} />
          <NavItem label="Metrics" section="metrics" icon={ICONS.metrics} />
          <NavItem label="Grafana" section="grafana" icon={ICONS.grafana} />
        </NavGroup>

        <NavGroup title="Tools">
          <NavItem label="Helm Charts" section="helm" icon={ICONS.helm} />
          <NavItem label="Terminal" section="terminal" icon={ICONS.terminal} />
          <NavItem label="Extensions" section="extensions" icon={ICONS.extension} />
          <NavItem label="Settings" section="settings" icon={ICONS.settings} />
        </NavGroup>
      </nav>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-4 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-lg shrink-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-red-700 dark:text-red-300 text-[10px] font-medium leading-relaxed">{error}</p>
            <button onClick={clearError} className="text-red-500 hover:text-red-700 dark:hover:text-red-200 text-xs shrink-0">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Spinner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-medium py-1 px-2">
      <div className="w-3 h-3 border-2 border-slate-200 dark:border-slate-700 border-t-blue-500 rounded-full animate-spin shrink-0" />
      <span>{text}</span>
    </div>
  )
}
