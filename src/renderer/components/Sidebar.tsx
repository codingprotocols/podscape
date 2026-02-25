import React, { useState } from 'react'
import { useAppStore } from '../store'
import type { ResourceKind } from '../types'

// ─── Icon components (inline SVG to avoid extra deps issues) ──────────────────

const Icon = ({ path, size = 14 }: { path: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={path} />
  </svg>
)

// Nav section group
function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-semibold
                   text-gray-500 uppercase tracking-wider hover:text-gray-400 transition-colors"
      >
        <span className={`transition-transform duration-150 ${open ? '' : '-rotate-90'}`}>
          ▾
        </span>
        {title}
      </button>
      {open && <div>{children}</div>}
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
      className={`flex items-center gap-2.5 w-full px-3 py-1.5 rounded-md text-sm
                  transition-colors mx-1 my-0.5 text-left
        ${isActive
          ? 'bg-blue-600/25 text-blue-200'
          : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
        }`}
      style={{ width: 'calc(100% - 8px)' }}
    >
      {icon && <Icon path={icon} size={13} />}
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full leading-none">
          {badge > 999 ? '999+' : badge}
        </span>
      )}
    </button>
  )
}

// ─── Icons paths ──────────────────────────────────────────────────────────────
const ICONS = {
  pod:        'M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5',
  deploy:     'M4 17l6-5-6-5M12 19h8',
  sts:        'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z',
  rs:         'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  job:        'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  cron:       'M12 2a10 10 0 100 20A10 10 0 0012 2zm0 6v6l3 3',
  service:    'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
  ingress:    'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9',
  configmap:  'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  secret:     'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  node:       'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  namespace:  'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  crd:        'M12 2a5 5 0 100 10A5 5 0 0012 2zm-7 14a7 7 0 0114 0',
  event:      'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  metrics:    'M3 3v18h18M18.5 8l-5.5 5.5-3-3L7 14',
  grafana:    'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  terminal:   'M4 17l6-6-6-6M12 19h8',
  extension:  'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z'
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
    <div className="flex flex-col w-56 min-w-[200px] bg-gray-900/90 border-r border-white/8 h-full shrink-0">
      {/* App header */}
      <div className="px-4 py-3.5 border-b border-white/8 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2.5 mt-4">
          <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center shrink-0">
            <Icon path={ICONS.pod} size={10} />
          </div>
          <span className="text-sm font-bold text-white tracking-wide">Podscape</span>
        </div>
      </div>

      {/* Context selector */}
      <div className="px-3 py-2.5 border-b border-white/8 shrink-0">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
          Cluster
        </label>
        {loadingContexts ? (
          <Spinner text="Loading contexts…" />
        ) : (
          <select
            className="w-full bg-gray-800 text-white text-xs rounded px-2 py-1.5
                       border border-white/10 focus:outline-none focus:ring-1
                       focus:ring-blue-500 cursor-pointer"
            value={selectedContext ?? ''}
            onChange={e => selectContext(e.target.value)}
          >
            {contexts.length === 0 && (
              <option value="" disabled>No clusters found</option>
            )}
            {contexts.map(ctx => (
              <option key={ctx.name} value={ctx.name}>{ctx.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Namespace selector */}
      <div className="px-3 py-2.5 border-b border-white/8 shrink-0">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">
          Namespace
        </label>
        {loadingNamespaces ? (
          <Spinner text="Loading…" />
        ) : (
          <select
            className="w-full bg-gray-800 text-white text-xs rounded px-2 py-1.5
                       border border-white/10 focus:outline-none focus:ring-1
                       focus:ring-blue-500 cursor-pointer"
            value={selectedNamespace ?? ''}
            onChange={e => selectNamespace(e.target.value)}
          >
            {!selectedContext && (
              <option value="" disabled>Select cluster</option>
            )}
            {selectedContext && namespaces.length === 0 && (
              <option value="" disabled>No namespaces</option>
            )}
            {namespaces.length > 0 && (
              <option value="_all">All Namespaces</option>
            )}
            {namespaces.map(ns => (
              <option key={ns.metadata.name} value={ns.metadata.name}>{ns.metadata.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Navigation tree */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-hide">
        {/* Dashboard — pinned at the top, outside any collapsible group */}
        <div className="px-1 mb-1">
          <NavItem
            label="Dashboard"
            section="dashboard"
            icon="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </div>
        <div className="mx-3 mb-2 border-t border-white/8" />

        <NavGroup title="Workloads">
          <NavItem label="Pods" section="pods" icon={ICONS.pod} badge={pods.length || undefined} />
          <NavItem label="Deployments" section="deployments" icon={ICONS.deploy} badge={deployments.length || undefined} />
          <NavItem label="StatefulSets" section="statefulsets" icon={ICONS.sts} />
          <NavItem label="ReplicaSets" section="replicasets" icon={ICONS.rs} />
          <NavItem label="Jobs" section="jobs" icon={ICONS.job} />
          <NavItem label="CronJobs" section="cronjobs" icon={ICONS.cron} />
        </NavGroup>

        <NavGroup title="Network">
          <NavItem label="Services" section="services" icon={ICONS.service} />
          <NavItem label="Ingresses" section="ingresses" icon={ICONS.ingress} />
        </NavGroup>

        <NavGroup title="Config">
          <NavItem label="ConfigMaps" section="configmaps" icon={ICONS.configmap} />
          <NavItem label="Secrets" section="secrets" icon={ICONS.secret} />
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
          <NavItem label="Terminal" section="terminal" icon={ICONS.terminal} />
          <NavItem label="Extensions" section="extensions" icon={ICONS.extension} />
        </NavGroup>
      </nav>

      {/* Error banner */}
      {error && (
        <div className="mx-2 mb-2 px-3 py-2 bg-red-900/50 border border-red-500/30 rounded shrink-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-red-300 text-xs leading-relaxed">{error}</p>
            <button onClick={clearError} className="text-red-400 hover:text-red-200 text-xs shrink-0">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Spinner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-500 text-xs py-1">
      <div className="w-3 h-3 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin shrink-0" />
      <span>{text}</span>
    </div>
  )
}
