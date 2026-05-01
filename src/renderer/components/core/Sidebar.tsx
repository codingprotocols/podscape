import React, { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import { ICONS, Icon } from './Icons'
import type { ResourceKind } from '../../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const openExternal = (url: string) =>
  (window as unknown as { electron: { shell: { openExternal: (u: string) => void } } })
    .electron.shell.openExternal(url)

// ─── SVG Icon ─────────────────────────────────────────────────────────────────


// ─── Icon paths ───────────────────────────────────────────────────────────────


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
  // Extract cluster name if it's an ARN or has hierarchical structure
  const clusterName = name.split('/').pop() || name

  // Treat - and _ as word separators
  const words = clusterName.replace(/[-_]/g, ' ').split(' ').filter(Boolean)
  if (words.length > 1) {
    return words.map(w => w[0].toUpperCase()).join('')
  }
  return clusterName.slice(0, 2).toUpperCase()
}

// ─── Collapsible nav group ────────────────────────────────────────────────────

const NavGroup = React.memo(function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const storageKey = `podscape:nav:${title}`
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) !== 'false')

  useEffect(() => {
    localStorage.setItem(storageKey, String(open))
  }, [open, storageKey])

  return (
    <div className="mb-1.5 px-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center w-full px-2 py-2 gap-2 text-[10px] font-extrabold uppercase tracking-[0.12em]
                   text-slate-500 hover:text-slate-300 transition-all duration-200 select-none group"
      >
        <svg width="8" height="8" viewBox="0 0 9 9" fill="currentColor"
          className={`shrink-0 transition-transform duration-300 ${open ? 'rotate-0 text-slate-400' : '-rotate-90 text-slate-600'}`}>
          <path d="M1 3l3.5 3.5L8 3H1z" />
        </svg>
        <span className="leading-none group-hover:translate-x-0.5 transition-transform">{title}</span>
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">{children}</div>
      )}
    </div>
  )
})

// ─── Nav item ─────────────────────────────────────────────────────────────────

const NavItem = React.memo(function NavItem({
  label, section, icon, badge, dot
}: { label: string; section: ResourceKind; icon?: string; badge?: number; dot?: boolean }) {
  const { active, setSection, isDenied } = useAppStore(useShallow(s => ({
    active: s.section,
    setSection: s.setSection,
    isDenied: s.deniedSections.has(section),
  })))
  const isActive = active === section

  return (
    <button
      onClick={() => setSection(section)}
      title={isDenied ? 'Access denied — insufficient RBAC permissions' : undefined}
      className={`relative flex items-center gap-2.5 w-full px-2.5 py-2 text-[12px] font-semibold
                  transition-all duration-200 rounded-xl group
        ${isActive
          ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400'
          : isDenied
            ? 'text-slate-500/60 hover:text-slate-500/80 hover:bg-slate-50 dark:hover:bg-white/[0.02]'
            : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
        }`}
    >
      {isActive && (
        <span className="absolute left-[-4px] top-2 bottom-2 w-[4px] bg-blue-600 dark:bg-blue-500 rounded-r-full shadow-[0_0_8px_#3b82f6]" />
      )}
      {icon && (
        <Icon
          path={icon}
          size={14}
          className={`shrink-0 transition-colors duration-200 ${
            isActive
              ? 'text-blue-600 dark:text-blue-400'
              : isDenied
                ? 'text-slate-500/50'
                : 'text-slate-500 dark:text-slate-500 group-hover:text-slate-900 dark:group-hover:text-slate-300'
          }`}
        />
      )}
      <span className="flex-1 text-left truncate leading-none">{label}</span>
      {isDenied && (
        <Lock size={10} className="shrink-0 text-slate-500/50" />
      )}
      {!isDenied && dot && (
        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-500" title="Not installed" />
      )}
      {!isDenied && badge !== undefined && badge > 0 && (
        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-md font-extrabold leading-none
          ${isActive
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/50'
            : 'bg-slate-100 dark:bg-white/10 text-slate-500 group-hover:bg-slate-200 dark:group-hover:bg-white/15 group-hover:text-slate-700 dark:group-hover:text-slate-400'}`}>
          {badge > 999 ? '999+' : badge}
        </span>
      )}
    </button>
  )
})

// ─── Rail icon button ─────────────────────────────────────────────────────────

function RailBtn({
  icon, label, active = false, onClick, className = ''
}: { icon: string; label: string; active?: boolean; onClick?: () => void; className?: string }) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        title={label}
        className={`w-11 h-11 flex items-center justify-center rounded-2xl transition-all duration-300
          ${active
            ? 'bg-blue-600/20 text-blue-400 active-glow'
            : className || 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.07]'
          }`}
      >
        <Icon path={icon} size={18} />
        {active && (
          <span className="absolute left-[-8px] top-2.5 bottom-2.5 w-[4px] bg-blue-500 rounded-r-full shadow-[0_0_10px_#3b82f6]" />
        )}
      </button>
      {/* Tooltip */}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-4 z-50
                      opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-[-10px] group-hover:translate-x-0">
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md text-slate-900 dark:text-slate-100 text-[11px] font-bold px-3 py-2 rounded-xl
                        shadow-2xl border border-slate-200 dark:border-white/10 whitespace-nowrap">
          {label}
        </div>
      </div>
    </div>
  )
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
export default function Sidebar(): JSX.Element {
  const {
    contexts, selectedContext, starredContext, setStarredContext,
    namespaces, selectedNamespace,
    loadingContexts, loadingNamespaces,
    selectContext, selectNamespace,
    section, setSection,
    podCount, deploymentCount, warningEventCount,
    navWidth, setNavWidth,
    prodContexts, setProdContexts,
    contextSwitchStatus,
    providers,
    pluginsEnabled,
    gitopsEnabled,
    networkEnabled,
  } = useAppStore(useShallow(s => ({
    contexts: s.contexts,
    selectedContext: s.selectedContext,
    starredContext: s.starredContext,
    setStarredContext: s.setStarredContext,
    namespaces: s.namespaces,
    selectedNamespace: s.selectedNamespace,
    loadingContexts: s.loadingContexts,
    loadingNamespaces: s.loadingNamespaces,
    selectContext: s.selectContext,
    selectNamespace: s.selectNamespace,
    section: s.section,
    setSection: s.setSection,
    podCount: s.pods.length,
    deploymentCount: s.deployments.length,
    warningEventCount: s.events.filter(e => e.type === 'Warning').length,
    navWidth: s.navWidth,
    setNavWidth: s.setNavWidth,
    prodContexts: s.prodContexts,
    setProdContexts: s.setProdContexts,
    contextSwitchStatus: s.contextSwitchStatus,
    providers: s.providers,
    pluginsEnabled: s.pluginsEnabled,
    gitopsEnabled: s.gitopsEnabled,
    networkEnabled: s.networkEnabled,
  })))

  const [isResizing, setIsResizing] = useState(false)

  useEffect(() => {
    if (!isResizing) return

    const onMouseMove = (e: MouseEvent) => {
      // The Sidebar is positioned at 0. Icon Rail is 72px.
      // So newWidth = e.clientX - 72
      const newWidth = Math.max(180, Math.min(480, e.clientX - 72))
      setNavWidth(newWidth)
    }

    const onMouseUp = () => {
      setIsResizing(false)
      document.body.style.cursor = 'default'
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'

    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = 'default'
    }
  }, [isResizing, setNavWidth])


  return (
    <div className="flex h-full shrink-0 select-none">

      {/* ── Icon Rail ──────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col items-center w-[72px] shrink-0 bg-slate-100 dark:surface-elevated border-r border-slate-200 dark:border-white/5 h-full shadow-2xl z-20"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Spacer for macOS traffic lights (hiddenInset titlebar) */}
        <div className="h-10 w-full shrink-0" />

        {/* Logo */}
        <div className="flex items-center justify-center w-full pb-6 shrink-0">
          <div className="w-11 h-11 rounded-[1.2rem] premium-gradient
                          flex items-center justify-center shadow-xl shadow-blue-900/20 active-glow">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONS.pod} />
            </svg>
          </div>
        </div>

        {/* Separator */}
        <div className="w-8 h-[1px] bg-slate-200 dark:bg-white/5 mb-6 shrink-0" />

        {/* Hotbar cluster avatars */}
        <div
          className="flex flex-col items-center gap-4 flex-1 overflow-y-auto w-full px-2 py-1 scrollbar-hide"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {loadingContexts ? (
            <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin mt-2" />
          ) : (
            <>
              {/* All clusters from kubeconfig */}
              {contexts.map(ctx => (
                <ClusterAvatar
                  key={ctx.name}
                  name={ctx.name}
                  active={selectedContext === ctx.name}
                  starred={starredContext === ctx.name}
                  isProd={prodContexts.includes(ctx.name)}
                  onClick={() => selectContext(ctx.name)}
                  onToggleStar={() => setStarredContext(starredContext === ctx.name ? null : ctx.name)}
                  onToggleProd={() => {
                    const next = prodContexts.includes(ctx.name)
                      ? prodContexts.filter(c => c !== ctx.name)
                      : [...prodContexts, ctx.name]
                    setProdContexts(next)
                  }}
                />
              ))}
            </>
          )}
        </div>

        <div
          className="flex flex-col items-center gap-3 pb-6 shrink-0 w-full px-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="w-8 h-[1px] bg-white/5 mb-3" />

          <RailBtn
            icon={ICONS.help}
            label="Ask a Question"
            onClick={() => openExternal('https://github.com/codingprotocols/podscape/discussions/new?category=q-a')}
          />
          <RailBtn
            icon={ICONS.heart}
            label="Support Our Work"
            className="text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
            onClick={() => openExternal('https://github.com/sponsors/codingprotocols')}
          />
          <RailBtn icon={ICONS.settings} label="Settings" active={section === 'settings'} onClick={() => setSection('settings')} />
        </div>
      </div>

      {/* ── Nav Panel ─────────────────────────────────────────────────────── */}
      <div
        className="relative flex flex-col shrink-0 bg-white dark:bg-[hsl(var(--sidebar-dark),_0.8)] border-r border-slate-200 dark:border-white/5 h-full z-10"
        style={{ width: `${navWidth}px` }}
      >
        {/* Resize Handle */}
        <div
          onMouseDown={() => setIsResizing(true)}
          className="resize-handle-v right-0"
        />

        {/* Spacer for macOS traffic lights */}
        <div className="h-10 w-full shrink-0" />

        {/* Cluster header */}
        <div className="px-5 pt-2 pb-5 shrink-0 border-b border-slate-100 dark:border-white/5"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Connected</p>
          {selectedContext ? (
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${contextSwitchStatus ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)] animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse'}`} />
                <span className="text-[13px] font-bold text-slate-700 dark:text-slate-100 truncate leading-none">
                  {selectedContext}
                </span>
              </div>
              {contextSwitchStatus && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400/80 font-medium mt-1 ml-4.5 truncate">{contextSwitchStatus}</p>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-slate-500 font-bold italic">Offline</span>
          )}
        </div>


        {/* Namespace selector */}
        <div
          className="px-4 py-4 shrink-0 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.01]"
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
                className="w-full bg-slate-100/50 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 text-[11px] font-medium
                           rounded-lg px-2.5 py-1.5 pr-6 border border-slate-200 dark:border-white/[0.08]
                           focus:outline-none focus:ring-1 focus:ring-blue-500/40 focus:border-blue-500/40
                           appearance-none cursor-pointer transition-colors
                           hover:bg-slate-200/50 dark:hover:bg-white/[0.09] hover:border-slate-300 dark:hover:border-white/[0.12]"
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

        {/* Navigation tree / Search Results */}
        <nav
          className="flex-1 overflow-y-auto py-2 scrollbar-hide"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Dashboard */}
          <div className="mb-1 px-1">
            <NavItem label="Dashboard" section="dashboard" icon={ICONS.dashboard} />
          </div>



          <NavGroup title="Cluster">
            <NavItem label="Nodes" section="nodes" icon={ICONS.node} />
            <NavItem label="Namespaces" section="namespaces" icon={ICONS.namespace} />
            <NavItem label="CRDs" section="crds" icon={ICONS.crd} />
          </NavGroup>

          <NavGroup title="Workloads">
            <NavItem label="Pods" section="pods" icon={ICONS.pod} badge={podCount || undefined} />
            <NavItem label="Deployments" section="deployments" icon={ICONS.deploy} badge={deploymentCount || undefined} />
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
            {networkEnabled && <NavItem label="Network Map" section="network" icon={ICONS.network} />}
            {networkEnabled && <NavItem label="Connectivity" section="connectivity" icon={ICONS.connectivity} />}
            <NavItem label="Debug Pods" section="debugpod" icon={ICONS.debugpod} />
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

          <NavGroup title="Observe">
            <NavItem label="Events" section="events" icon={ICONS.event} badge={warningEventCount || undefined} />
            <NavItem label="Metrics" section="metrics" icon={ICONS.metrics} />
            <NavItem label="Unified Logs" section="unifiedlogs" icon={ICONS.terminal} />
            <NavItem label="Security Hub" section="security" icon={ICONS.secret} />
            <NavItem label="TLS Certificates" section="tls" icon={ICONS.secret} />
          </NavGroup>

          <NavGroup title="Tools">
            <NavItem label="Helm Charts" section="helm" icon={ICONS.helm} />
            {gitopsEnabled && <NavItem label="GitOps" section="gitops" icon={ICONS.deploy} />}
            {pluginsEnabled && <NavItem label="Plugins" section="krew" icon={ICONS.crd} />}
          </NavGroup>

          {providers.istio && (
            <NavGroup title="Service Mesh">
              <NavItem label="Virtual Services" section="istio-virtualservices" icon={ICONS.route} />
              <NavItem label="Destination Rules" section="istio-destinationrules" icon={ICONS.netpol} />
              <NavItem label="Gateways" section="istio-gateways" icon={ICONS.ingress} />
              <NavItem label="Service Entries" section="istio-serviceentries" icon={ICONS.endpoints} />
              <NavItem label="Peer Auth" section="istio-peerauth" icon={ICONS.pdb} />
              <NavItem label="Authorization Policies" section="istio-authpolicies" icon={ICONS.role} />
              <NavItem label="Request Auth" section="istio-requestauth" icon={ICONS.secret} />
            </NavGroup>
          )}

          {providers.traefik && (
            <NavGroup title="Traefik">
              <NavItem label="Ingress Routes" section="traefik-ingressroutes" icon={ICONS.ingress} />
              <NavItem label="Ingress Routes TCP" section="traefik-ingressroutestcp" icon={ICONS.portforward} />
              <NavItem label="Ingress Routes UDP" section="traefik-ingressroutesudp" icon={ICONS.portforward} />
              <NavItem label="Middlewares" section="traefik-middlewares" icon={ICONS.middleware} />
              <NavItem label="Middlewares TCP" section="traefik-middlewaretcps" icon={ICONS.middleware} />
              <NavItem label="Traefik Services" section="traefik-services" icon={ICONS.service} />
              <NavItem label="TLS Options" section="traefik-tlsoptions" icon={ICONS.secret} />
              <NavItem label="TLS Stores" section="traefik-tlsstores" icon={ICONS.secret} />
              <NavItem label="Servers Transports TCP" section="traefik-serverstransporttcps" icon={ICONS.portforward} />
            </NavGroup>
          )}

          {providers.nginxInc && (
            <NavGroup title="NGINX">
              <NavItem label="Virtual Servers" section="nginx-virtualservers" icon={ICONS.ingress} />
              <NavItem label="Virtual Server Routes" section="nginx-virtualserverroutes" icon={ICONS.route} />
              <NavItem label="Policies" section="nginx-policies" icon={ICONS.netpol} />
              <NavItem label="Transport Servers" section="nginx-transportservers" icon={ICONS.portforward} />
            </NavGroup>
          )}

          {providers.keda && (
            <NavGroup title="KEDA">
              <NavItem label="Scaled Objects"                  section="keda-scaledobjects"                icon={ICONS.hpa} />
              <NavItem label="Scaled Jobs"                     section="keda-scaledjobs"                   icon={ICONS.job} />
              <NavItem label="Trigger Authentications"         section="keda-triggerauthentications"        icon={ICONS.secret} />
              <NavItem label="Cluster Trigger Authentications" section="keda-clustertriggerauthentications" icon={ICONS.secret} />
            </NavGroup>
          )}

        </nav>

      </div>
    </div>
  )
}

// ─── Cluster Avatar ───────────────────────────────────────────────────────────

function ClusterAvatar({
  name, active, starred, isProd, onClick, onToggleStar, onToggleProd
}: {
  name: string
  active: boolean
  starred: boolean
  isProd: boolean
  onClick: () => void
  onToggleStar: () => void
  onToggleProd: () => void
}) {
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setMenu(m => m ? null : { top: r.top, left: r.right + 12 })
    }
  }

  const showMenu = menu !== null

  return (
    <div className="relative group w-full flex justify-center py-1">
      {/* Active marker on the far left */}
      {active && (
        <span className="absolute left-[-10px] top-1/2 -translate-y-1/2 w-[4px] h-8 bg-blue-500 rounded-r-full shadow-[0_0_12px_#3b82f6]" />
      )}

      <button
        onClick={onClick}
        title={name}
        className={`relative w-[46px] h-[46px] rounded-[1.2rem] flex items-center justify-center text-[13px] font-black
                    bg-gradient-to-br ${clusterColor(name)} text-white
                    transition-all duration-500 shadow-xl
                    ${active
            ? 'ring-[2.5px] ring-blue-500 ring-offset-[3px] ring-offset-[#020617] scale-105 rotate-[-2deg]'
            : 'opacity-60 grayscale-[30%] hover:opacity-100 hover:grayscale-0 hover:scale-110 hover:rotate-[2deg]'
          }`}
      >
        {clusterInitials(name)}
        {starred && (
          <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-blue-500 border-2 border-[#020617] flex items-center justify-center shadow-lg z-10 animate-in fade-in scale-in duration-300">
            <svg width="7" height="7" viewBox="0 0 24 24" fill="white"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
          </div>
        )}
        {isProd && (
          <div className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-rose-500 border-2 border-[#020617] flex items-center justify-center shadow-lg z-10 animate-in fade-in scale-in duration-300">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d={ICONS.secret} /></svg>
          </div>
        )}
      </button>

      {/* Context menu trigger */}
      <button
        ref={btnRef}
        onClick={openMenu}
        className="absolute -right-2 -top-1 w-5 h-5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10
                   items-center justify-center hidden group-hover:flex transition-all hover:bg-slate-50 dark:hover:bg-slate-700 hover:scale-110 z-10 shadow-lg"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-300">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Tooltip */}
      {!showMenu && (
        <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-5 z-50
                        opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-[-10px] group-hover:translate-x-0">
          <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md text-slate-900 dark:text-white text-[11px] font-black px-3.5 py-2.5 rounded-xl
                          shadow-2xl border border-slate-200 dark:border-white/10 whitespace-nowrap max-w-[180px] truncate leading-none">
            {name}
          </div>
        </div>
      )}

      {/* Dropdown menu */}
      {menu && (
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setMenu(null)}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} />
          <div className="fixed z-[101] bg-slate-900/90 backdrop-blur-xl border border-white/10
                          rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden min-w-[170px]"
            style={{ top: menu.top, left: menu.left, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="px-4 py-3 border-b border-white/5 bg-white/5">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Cluster</p>
              <p className="text-[12px] font-bold text-slate-100 truncate">{name}</p>
            </div>
            <button
              onClick={() => { onToggleStar(); setMenu(null) }}
              className="flex items-center gap-3 w-full px-4 py-3 text-[12px] text-slate-300
                         hover:bg-white/10 hover:text-white transition-all font-semibold"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'}
                stroke="currentColor" strokeWidth="2.5" className={starred ? 'text-blue-400' : 'text-slate-400'}>
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              {starred ? 'Remove Default' : 'Set as Default'}
            </button>
            <button
              onClick={() => { onToggleProd(); setMenu(null) }}
              className="flex items-center gap-3 w-full px-4 py-3 text-[12px] text-slate-300
                         hover:bg-white/10 hover:text-white transition-all font-semibold"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={isProd ? 'currentColor' : 'none'}
                stroke="currentColor" strokeWidth="2.5" className={isProd ? 'text-rose-500' : 'text-slate-400'}>
                <path d={ICONS.secret} />
              </svg>
              {isProd ? 'Unmark Production' : 'Mark as Production'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}


