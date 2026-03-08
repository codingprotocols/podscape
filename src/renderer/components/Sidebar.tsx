import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import type { ResourceKind } from '../types'

// ─── SVG Icon ─────────────────────────────────────────────────────────────────

const Icon = ({ path, size = 15, className = '' }: { path: string; size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={path} />
  </svg>
)

// ─── Icon paths ───────────────────────────────────────────────────────────────

const ICONS = {
  pod:            'M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5',
  deploy:         'M4 17l6-5-6-5M12 19h8',
  daemonset:      'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2',
  sts:            'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z',
  rs:             'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  job:            'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  cron:           'M12 2a10 10 0 100 20A10 10 0 0012 2zm0 6v6l3 3',
  hpa:            'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10',
  pdb:            'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  service:        'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
  ingress:        'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9',
  ingressclass:   'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3M8 12a4 4 0 108 0 4 4 0 00-8 0z',
  netpol:         'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM4.93 7l3.54 3.54M15.54 7l-3.54 3.54M7 15.07l3.54-3.54M17.07 15.07l-3.54-3.54',
  endpoints:      'M15 12a3 3 0 11-6 0 3 3 0 016 0zM5 12H3m18 0h-2M12 5V3m0 18v-2',
  portforward:    'M5 12h14M12 5l7 7-7 7',
  configmap:      'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  secret:         'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  pvc:            'M2 20h20M4 20V8m16 12V8M8 20v-6h8v6M12 8V4M4 8h16',
  pv:             'M22 12H2M22 12l-4-4M22 12l-4 4M2 12l4 4M2 12l4-4',
  storageclass:   'M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.58 4 8 4s8-1.79 8-4M4 7c0-2.21 3.58-4 8-4s8 1.79 8 4',
  sa:             'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  role:           'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  clusterrole:    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  rolebinding:    'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  node:           'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  namespace:      'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  crd:            'M12 2a5 5 0 100 10A5 5 0 0012 2zm-7 14a7 7 0 0114 0',
  event:          'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  metrics:        'M3 3v18h18M18.5 8l-5.5 5.5-3-3L7 14',
  terminal:       'M4 17l6-6-6-6M12 19h8',
  extension:      'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z',
  settings:       'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z',
  network:        'M12 5a2 2 0 100-4 2 2 0 000 4zm-7 7a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4zm-7 7a2 2 0 100-4 2 2 0 000 4zM5 12H2m10-7V2m7 10h3M12 17v3M7.05 7.05L5 5m9.95 2.05L17 5M7.05 16.95L5 19m9.95-2.05L17 19',
  helm:           'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM12 22.08V12M3.27 6.96L12 12.01l8.73-5.05',
  dashboard:      'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  grafana:        'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z',
  chevronDown:    'M6 9l6 6 6-6',
  chevronRight:   'M9 18l6-6-6-6',
  star:           'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
}

// ─── Colour palette for cluster avatars ───────────────────────────────────────

const AVATAR_COLORS = [
  'from-blue-500 to-blue-700',
  'from-violet-500 to-violet-700',
  'from-emerald-500 to-emerald-700',
  'from-amber-500 to-amber-700',
  'from-rose-500 to-rose-700',
  'from-cyan-500 to-cyan-700',
  'from-fuchsia-500 to-fuchsia-700',
  'from-orange-500 to-orange-700',
]

function clusterColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function clusterInitials(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, ' ').split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('') || name.slice(0, 2).toUpperCase()
}

// ─── Collapsible nav group ────────────────────────────────────────────────────

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const storageKey = `podscape:nav:${title}`
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) !== 'false')

  useEffect(() => {
    localStorage.setItem(storageKey, String(open))
  }, [open, storageKey])

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center w-full px-3 py-1.5 gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em]
                   text-slate-500 hover:text-slate-300 transition-colors duration-150 select-none"
      >
        <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor"
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}>
          <path d="M1 3l3.5 3.5L8 3H1z" />
        </svg>
        <span className="leading-none">{title}</span>
      </button>
      {open && (
        <div className="mb-1">{children}</div>
      )}
    </div>
  )
}

// ─── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({
  label, section, icon, badge
}: { label: string; section: ResourceKind; icon?: string; badge?: number }) {
  const { section: active, setSection } = useAppStore()
  const isActive = active === section

  return (
    <button
      onClick={() => setSection(section)}
      className={`relative flex items-center gap-2.5 w-full pl-3 pr-2.5 py-[5px] text-[12px] font-medium
                  transition-colors duration-100 group rounded-none
        ${isActive
          ? 'bg-blue-600/15 text-blue-300'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
        }`}
    >
      {isActive && (
        <span className="absolute left-0 top-0.5 bottom-0.5 w-[3px] bg-blue-400 rounded-r-full" />
      )}
      {icon && (
        <Icon
          path={icon}
          size={13}
          className={`shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`}
        />
      )}
      <span className="flex-1 text-left truncate leading-none">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-bold leading-none
          ${isActive
            ? 'bg-blue-500/30 text-blue-300'
            : 'bg-white/10 text-slate-400 group-hover:bg-white/15'}`}>
          {badge > 999 ? '999+' : badge}
        </span>
      )}
    </button>
  )
}

// ─── Rail icon button ─────────────────────────────────────────────────────────

function RailBtn({
  icon, label, active = false, onClick
}: { icon: string; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        title={label}
        className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150
          ${active
            ? 'bg-blue-600/25 text-blue-400'
            : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.07]'
          }`}
      >
        <Icon path={icon} size={16} />
        {active && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-blue-400 rounded-r-full" />
        )}
      </button>
      {/* Tooltip */}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50
                      opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <div className="bg-slate-800 text-slate-100 text-[11px] font-medium px-2.5 py-1.5 rounded-lg
                        shadow-xl border border-slate-700 whitespace-nowrap">
          {label}
        </div>
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
      </div>
    </div>
  )
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export default function Sidebar(): JSX.Element {
  const {
    contexts, selectedContext, hotbarContexts, toggleHotbarContext,
    namespaces, selectedNamespace,
    loadingContexts, loadingNamespaces,
    selectContext, selectNamespace, error, clearError,
    section, setSection,
    pods, deployments, events
  } = useAppStore()

  const contextNames = new Set(contexts.map(c => c.name))
  const hotbarValid = hotbarContexts.filter(c => contextNames.has(c))
  // Contexts not already visible in the rail (not hotbarred and not the current active)
  const otherContexts = contexts.filter(c =>
    !hotbarContexts.includes(c.name) && c.name !== selectedContext
  )

  return (
    <div className="flex h-full shrink-0 select-none">

      {/* ── Icon Rail ──────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col items-center w-14 shrink-0 bg-[#0d1117] border-r border-white/[0.06] h-full"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Spacer for macOS traffic lights (hiddenInset titlebar) */}
        <div className="h-8 w-full shrink-0" />

        {/* Logo */}
        <div className="flex items-center justify-center w-full h-10 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700
                          flex items-center justify-center shadow-lg shadow-blue-900/50">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONS.pod} />
            </svg>
          </div>
        </div>

        {/* Separator */}
        <div className="w-6 h-px bg-white/[0.08] mb-3 shrink-0" />

        {/* Hotbar cluster avatars */}
        <div
          className="flex flex-col items-center gap-2 flex-1 overflow-y-auto w-full px-2 py-1 scrollbar-hide"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {loadingContexts ? (
            <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mt-2" />
          ) : (
            <>
              {/* Always show selected context if not in hotbar */}
              {selectedContext && !hotbarContexts.includes(selectedContext) && (
                <ClusterAvatar
                  name={selectedContext}
                  active={true}
                  onClick={() => selectContext(selectedContext)}
                  onTogglePin={() => toggleHotbarContext(selectedContext)}
                  pinned={false}
                />
              )}
              {/* Hotbar clusters */}
              {hotbarValid.map(name => (
                <ClusterAvatar
                  key={name}
                  name={name}
                  active={selectedContext === name}
                  onClick={() => selectContext(name)}
                  onTogglePin={() => toggleHotbarContext(name)}
                  pinned={true}
                />
              ))}
              {/* Add cluster to hotbar */}
              {otherContexts.length > 0 && (
                <AddClusterButton
                  contexts={otherContexts}
                  onSelect={name => {
                    toggleHotbarContext(name)  // pin it
                    selectContext(name)        // and switch to it
                  }}
                />
              )}
            </>
          )}
        </div>

        {/* Bottom pinned nav icons */}
        <div
          className="flex flex-col items-center gap-1 pb-3 shrink-0 w-full px-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="w-6 h-px bg-white/[0.08] mb-2" />
          <RailBtn icon={ICONS.terminal}  label="Terminal"   active={section === 'terminal'}   onClick={() => setSection('terminal')} />
          <RailBtn icon={ICONS.extension} label="Extensions" active={section === 'extensions'} onClick={() => setSection('extensions')} />
          <RailBtn icon={ICONS.settings}  label="Settings"   active={section === 'settings'}   onClick={() => setSection('settings')} />
        </div>
      </div>

      {/* ── Nav Panel ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col w-[188px] shrink-0 bg-[#111820] border-r border-white/[0.06] h-full">

        {/* Spacer for macOS traffic lights */}
        <div className="h-8 w-full shrink-0" />

        {/* Cluster header */}
        <div className="px-3 pt-2 pb-3 shrink-0 border-b border-white/[0.06]"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          {selectedContext ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 shrink-0 animate-pulse" />
              <span className="text-[12px] font-semibold text-slate-200 truncate leading-none">
                {selectedContext}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-slate-500 font-medium">No cluster selected</span>
          )}
        </div>

        {/* Namespace selector */}
        <div
          className="px-3 py-2.5 shrink-0 border-b border-white/[0.06]"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {loadingNamespaces ? (
            <div className="flex items-center gap-2 text-slate-500 text-[10px] py-1">
              <div className="w-3 h-3 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
              <span>Loading...</span>
            </div>
          ) : (
            <div className="relative">
              <select
                value={selectedNamespace ?? ''}
                onChange={e => selectNamespace(e.target.value)}
                className="w-full bg-white/[0.06] text-slate-300 text-[11px] font-medium
                           rounded-lg px-2.5 py-1.5 pr-6 border border-white/[0.08]
                           focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/40
                           appearance-none cursor-pointer transition-colors
                           hover:bg-white/[0.09] hover:border-white/[0.12]"
              >
                {!selectedContext && <option value="" disabled>Select cluster first</option>}
                {selectedContext && namespaces.length === 0 && <option value="" disabled>No namespaces</option>}
                {namespaces.length > 0 && <option value="_all">All Namespaces</option>}
                {namespaces.map(ns => (
                  <option key={ns.metadata.name} value={ns.metadata.name}>{ns.metadata.name}</option>
                ))}
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                <Icon path={ICONS.chevronDown} size={10} />
              </div>
            </div>
          )}
        </div>

        {/* Navigation tree */}
        <nav
          className="flex-1 overflow-y-auto py-2 scrollbar-hide"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Dashboard */}
          <div className="mb-1 px-1">
            <NavItem label="Dashboard" section="dashboard" icon={ICONS.dashboard} />
          </div>

          <NavGroup title="Workloads">
            <NavItem label="Pods"         section="pods"         icon={ICONS.pod}       badge={pods.length || undefined} />
            <NavItem label="Deployments"  section="deployments"  icon={ICONS.deploy}    badge={deployments.length || undefined} />
            <NavItem label="DaemonSets"   section="daemonsets"   icon={ICONS.daemonset} />
            <NavItem label="StatefulSets" section="statefulsets" icon={ICONS.sts} />
            <NavItem label="ReplicaSets"  section="replicasets"  icon={ICONS.rs} />
            <NavItem label="Jobs"         section="jobs"         icon={ICONS.job} />
            <NavItem label="CronJobs"     section="cronjobs"     icon={ICONS.cron} />
          </NavGroup>

          <NavGroup title="Autoscaling">
            <NavItem label="HPA"                    section="hpas" icon={ICONS.hpa} />
            <NavItem label="Pod Disruption Budgets" section="pdbs" icon={ICONS.pdb} />
          </NavGroup>

          <NavGroup title="Network">
            <NavItem label="Services"        section="services"        icon={ICONS.service} />
            <NavItem label="Ingresses"       section="ingresses"       icon={ICONS.ingress} />
            <NavItem label="Ingress Classes" section="ingressclasses"  icon={ICONS.ingressclass} />
            <NavItem label="Network Policies" section="networkpolicies" icon={ICONS.netpol} />
            <NavItem label="Endpoints"       section="endpoints"       icon={ICONS.endpoints} />
            <NavItem label="Port Forwards"   section="portforwards"    icon={ICONS.portforward} />
            <NavItem label="Network Map"     section="network"         icon={ICONS.network} />
          </NavGroup>

          <NavGroup title="Config">
            <NavItem label="ConfigMaps" section="configmaps" icon={ICONS.configmap} />
            <NavItem label="Secrets"    section="secrets"    icon={ICONS.secret} />
          </NavGroup>

          <NavGroup title="Storage">
            <NavItem label="PVCs"            section="pvcs"          icon={ICONS.pvc} />
            <NavItem label="PVs"             section="pvs"           icon={ICONS.pv} />
            <NavItem label="Storage Classes" section="storageclasses" icon={ICONS.storageclass} />
          </NavGroup>

          <NavGroup title="RBAC">
            <NavItem label="Service Accounts"       section="serviceaccounts"      icon={ICONS.sa} />
            <NavItem label="Roles"                  section="roles"                icon={ICONS.role} />
            <NavItem label="Cluster Roles"          section="clusterroles"         icon={ICONS.clusterrole} />
            <NavItem label="Role Bindings"          section="rolebindings"         icon={ICONS.rolebinding} />
            <NavItem label="Cluster Role Bindings"  section="clusterrolebindings"  icon={ICONS.rolebinding} />
          </NavGroup>

          <NavGroup title="Cluster">
            <NavItem label="Nodes"      section="nodes"      icon={ICONS.node} />
            <NavItem label="Namespaces" section="namespaces" icon={ICONS.namespace} />
            <NavItem label="CRDs"       section="crds"       icon={ICONS.crd} />
          </NavGroup>

          <NavGroup title="Observe">
            <NavItem label="Events"  section="events"  icon={ICONS.event}   badge={events.filter(e => e.type === 'Warning').length || undefined} />
            <NavItem label="Metrics" section="metrics" icon={ICONS.metrics} />
          </NavGroup>

          <NavGroup title="Tools">
            <NavItem label="Helm Charts" section="helm" icon={ICONS.helm} />
          </NavGroup>
        </nav>

        {/* Error banner */}
        {error && (
          <div className="mx-2 mb-3 px-2.5 py-2 bg-red-500/10 border border-red-500/25 rounded-lg shrink-0"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-red-400 text-[10px] font-medium leading-relaxed">{error}</p>
              <button onClick={clearError} className="text-red-500 hover:text-red-300 text-xs shrink-0 mt-px">✕</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Cluster Avatar ───────────────────────────────────────────────────────────

function ClusterAvatar({
  name, active, onClick, onTogglePin, pinned
}: {
  name: string
  active: boolean
  onClick: () => void
  onTogglePin: () => void
  pinned: boolean
}) {
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setMenu(m => m ? null : { top: r.top, left: r.right + 8 })
    }
  }

  const showMenu = menu !== null

  return (
    <div className="relative group w-full flex justify-center">
      {/* Active indicator */}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-blue-400 rounded-r-full" />
      )}

      <button
        onClick={onClick}
        title={name}
        className={`w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold
                    bg-gradient-to-br ${clusterColor(name)} text-white
                    transition-all duration-150 shadow-md
                    ${active
                      ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-[#0d1117] scale-105'
                      : 'opacity-70 hover:opacity-100 hover:scale-105'
                    }`}
      >
        {clusterInitials(name)}
      </button>

      {/* Context menu trigger */}
      <button
        ref={btnRef}
        onClick={openMenu}
        className="absolute -right-1 -top-1 w-4 h-4 rounded-full bg-slate-700 border border-slate-600
                   items-center justify-center hidden group-hover:flex transition-all hover:bg-slate-600"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-slate-300">
          <path d="M1 3l3 3 3-3H1z" />
        </svg>
      </button>

      {/* Tooltip */}
      {!showMenu && (
        <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50
                        opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <div className="bg-slate-800 text-slate-100 text-[11px] font-medium px-2.5 py-1.5 rounded-lg
                          shadow-xl border border-slate-700 whitespace-nowrap max-w-[160px] truncate">
            {name}
          </div>
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
        </div>
      )}

      {/* Dropdown menu — fixed to escape overflow-clip */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} />
          <div className="fixed z-50 bg-slate-800 border border-slate-700
                          rounded-xl shadow-2xl overflow-hidden min-w-[140px]"
            style={{ top: menu.top, left: menu.left, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="px-3 py-2 border-b border-slate-700">
              <p className="text-[11px] font-semibold text-slate-200 truncate max-w-[130px]">{name}</p>
            </div>
            <button
              onClick={() => { onTogglePin(); setMenu(null) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-[11px] text-slate-300
                         hover:bg-white/[0.07] hover:text-white transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'}
                stroke="currentColor" strokeWidth="2" className={pinned ? 'text-amber-400' : 'text-slate-400'}>
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              {pinned ? 'Unpin from hotbar' : 'Pin to hotbar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Add cluster button ───────────────────────────────────────────────────────

function AddClusterButton({
  contexts, onSelect
}: { contexts: { name: string }[]; onSelect: (name: string) => void }) {
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const toggle = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setMenu(m => m ? null : { top: r.top, left: r.right + 8 })
    }
  }

  return (
    <div className="relative group w-full flex justify-center">
      <button
        ref={btnRef}
        onClick={toggle}
        title="Add cluster to hotbar"
        className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600
                   border-2 border-dashed border-slate-700 hover:border-slate-500
                   hover:text-slate-400 transition-all duration-150"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {/* Tooltip */}
      {!menu && (
        <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50
                        opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <div className="bg-slate-800 text-slate-100 text-[11px] font-medium px-2.5 py-1.5 rounded-lg
                          shadow-xl border border-slate-700 whitespace-nowrap">
            Switch cluster
          </div>
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
        </div>
      )}

      {/* Dropdown — fixed to escape overflow-clip */}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} />
          <div className="fixed z-50 bg-slate-800 border border-slate-700
                          rounded-xl shadow-2xl overflow-hidden min-w-[180px] max-h-64 overflow-y-auto"
            style={{ top: menu.top, left: menu.left, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="px-3 py-2 border-b border-slate-700">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Clusters</p>
            </div>
            {contexts.map(ctx => (
              <button
                key={ctx.name}
                onClick={() => { onSelect(ctx.name); setMenu(null) }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-[11px] text-slate-300
                           hover:bg-white/[0.07] hover:text-white transition-colors"
              >
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold
                                  text-white bg-gradient-to-br ${clusterColor(ctx.name)} shrink-0`}>
                  {clusterInitials(ctx.name)}
                </span>
                <span className="truncate">{ctx.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
