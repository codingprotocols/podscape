
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useAppStore } from '../store'
import {
  Activity, GitBranch, Box, Layers, ExternalLink, RefreshCw, Search, X, Info, Shield, AlertTriangle, CheckCircle, Clock, LayoutGrid, ListFilter
} from 'lucide-react'
import PageHeader from './PageHeader'

interface GitOpsResource {
  kind: string
  name: string
  namespace: string
  status: string
  ready: boolean
  labels?: Record<string, string>
  source?: string
  revision?: string
  message?: string
}

interface GitOpsResponse {
  fluxDetected: boolean
  argoDetected: boolean
  resources: GitOpsResource[]
}

// ── visual constants ─────────────────────────────────────────────────────────

const KIND_META: Record<string, { color: string; border: string; bg: string; dot: string; label: string; tool: 'flux' | 'argo'; icon: any }> = {
  Kustomization: { color: 'text-sky-400', border: 'border-sky-500/30', bg: 'bg-sky-500/10', dot: '#38bdf8', label: 'Kustomization', tool: 'flux', icon: <Layers className="w-3 h-3" /> },
  HelmRelease: { color: 'text-violet-400', border: 'border-violet-500/30', bg: 'bg-violet-500/10', dot: '#a78bfa', label: 'HelmRelease', tool: 'flux', icon: <Box className="w-3 h-3" /> },
  GitRepository: { color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', dot: '#34d399', label: 'GitRepo', tool: 'flux', icon: <GitBranch className="w-3 h-3" /> },
  HelmRepository: { color: 'text-cyan-400', border: 'border-cyan-500/30', bg: 'bg-cyan-500/10', dot: '#22d3ee', label: 'HelmRepo', tool: 'flux', icon: <Shield className="w-3 h-3" /> },
  HelmChart: { color: 'text-indigo-400', border: 'border-indigo-500/30', bg: 'bg-indigo-500/10', dot: '#818cf8', label: 'HelmChart', tool: 'flux', icon: <Box className="w-3 h-3" /> },
  Application: { color: 'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/10', dot: '#fb923c', label: 'Application', tool: 'argo', icon: <Layers className="w-3 h-3" /> },
  AppProject: { color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-500/10', dot: '#fbbf24', label: 'AppProject', tool: 'argo', icon: <Shield className="w-3 h-3" /> },
}

function kindMeta(kind: string) {
  return KIND_META[kind] ?? { color: 'text-slate-400', border: 'border-slate-500/30', bg: 'bg-slate-500/10', dot: '#94a3b8', label: kind, tool: null as any, icon: <Box className="w-3 h-3" /> }
}

function isHealthy(r: GitOpsResource) {
  return r.ready || r.status === 'Healthy' || r.status === 'Synced' || r.status === 'Ready'
}
function isProgressing(r: GitOpsResource) {
  return r.status === 'Progressing' || r.status === 'Pending'
}
function isDegraded(r: GitOpsResource) {
  return !r.ready && !isProgressing(r) && r.status !== 'Unknown' && r.status !== ''
}

function statusColor(r: GitOpsResource) {
  if (r.status === 'Unknown' || r.status === '') return 'text-slate-500'
  if (isHealthy(r)) return 'text-emerald-400'
  if (isProgressing(r)) return 'text-amber-400'
  return 'text-red-400'
}

function PulseDot({ r }: { r: GitOpsResource }) {
  if (r.status === 'Unknown' || r.status === '') return <span className="w-1.5 h-1.5 rounded-full bg-slate-600 inline-block" />
  if (isHealthy(r)) return (
    <span className="relative inline-flex shrink-0">
      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
      <span className="absolute inset-0 w-3.5 h-3.5 rounded-full bg-emerald-400 animate-ping opacity-30" />
    </span>
  )
  if (isProgressing(r)) return (
    <span className="relative inline-flex shrink-0">
      <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
      <span className="absolute inset-0 w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse opacity-30" />
    </span>
  )
  return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
}

function KindPill({ kind }: { kind: string }) {
  const m = kindMeta(kind)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border max-w-full ${m.color} ${m.border} ${m.bg}`}>
      <span className="shrink-0">{m.icon}</span>
      <span className="truncate">{m.label}</span>
    </span>
  )
}

// ── overview panel (shown when nothing is selected) ──────────────────────────

function OverviewPanel({ resources, fluxDetected, argoDetected }: {
  resources: GitOpsResource[]
  fluxDetected: boolean
  argoDetected: boolean
}) {
  const healthyN = resources.filter(isHealthy).length
  const progressingN = resources.filter(isProgressing).length
  const degradedN = resources.filter(isDegraded).length
  const unknownN = resources.filter(r => r.status === 'Unknown' || r.status === '').length
  const total = resources.length

  // kind breakdown
  const kindCounts = useMemo(() => {
    const m: Record<string, number> = {}
    resources.forEach(r => { m[r.kind] = (m[r.kind] ?? 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [resources])

  // namespace breakdown
  const nsCounts = useMemo(() => {
    const m: Record<string, number> = {}
    resources.forEach(r => { if (r.namespace) m[r.namespace] = (m[r.namespace] ?? 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [resources])

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-slate-600">
        <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
          <Activity className="w-6 h-6 text-slate-600" />
        </div>
        <p className="text-sm font-black text-slate-300 mb-1.5 tracking-tight">Select a resource</p>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center">to view details</p>
      </div>
    )
  }

  const healthPct = total ? Math.round((healthyN / total) * 100) : 0

  return (
    <div className="flex flex-col gap-5 px-5 py-5 overflow-y-auto h-full">
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600">Health Overview</p>
          <Info className="w-3 h-3 text-slate-600" />
        </div>

        {/* health bar */}
        <div className="mb-3">
          <div className="flex rounded-full overflow-hidden h-2 bg-white/[0.05] mb-2">
            {healthyN > 0 && <div className="bg-emerald-500" style={{ width: `${(healthyN / total) * 100}%` }} />}
            {progressingN > 0 && <div className="bg-amber-500" style={{ width: `${(progressingN / total) * 100}%` }} />}
            {degradedN > 0 && <div className="bg-red-500" style={{ width: `${(degradedN / total) * 100}%` }} />}
            {unknownN > 0 && <div className="bg-slate-600" style={{ width: `${(unknownN / total) * 100}%` }} />}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-400">{healthPct}% healthy</span>
            <span className="text-[9px] text-slate-600">{total} total</span>
          </div>
        </div>

        {/* legend */}
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: 'Healthy', n: healthyN, color: 'bg-emerald-500', text: 'text-emerald-400' },
            { label: 'Syncing', n: progressingN, color: 'bg-amber-500', text: 'text-amber-400' },
            { label: 'Degraded', n: degradedN, color: 'bg-red-500', text: 'text-red-400' },
            { label: 'Unknown', n: unknownN, color: 'bg-slate-600', text: 'text-slate-500' },
          ].filter(s => s.n > 0).map(s => (
            <div key={s.label} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04]">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.color}`} />
              <span className={`text-[10px] font-bold ${s.text}`}>{s.n}</span>
              <span className="text-[9px] text-slate-600 truncate">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* controllers */}
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600 mb-2">Controllers</p>
        <div className="flex flex-col gap-1.5">
          <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${fluxDetected ? 'bg-sky-500/8 border-sky-500/20' : 'bg-white/[0.02] border-white/[0.04] opacity-40'
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${fluxDetected ? 'bg-sky-400' : 'bg-slate-600'}`} />
            <span className={`text-[10px] font-black tracking-wider uppercase ${fluxDetected ? 'text-sky-400' : 'text-slate-600'}`}>Flux CD</span>
            {!fluxDetected && <span className="text-[9px] text-slate-700 ml-auto">not detected</span>}
          </div>
          <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${argoDetected ? 'bg-orange-500/8 border-orange-500/20' : 'bg-white/[0.02] border-white/[0.04] opacity-40'
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${argoDetected ? 'bg-orange-400' : 'bg-slate-600'}`} />
            <span className={`text-[10px] font-black tracking-wider uppercase ${argoDetected ? 'text-orange-400' : 'text-slate-600'}`}>Argo CD</span>
            {!argoDetected && <span className="text-[9px] text-slate-700 ml-auto">not detected</span>}
          </div>
        </div>
      </div>

      {kindCounts.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600 mb-2">By Kind</p>
          <div className="flex flex-col gap-1">
            {kindCounts.map(([kind, count]) => {
              const m = kindMeta(kind)
              return (
                <div key={kind} className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(count / total) * 100}%`, background: m.dot }}
                    />
                  </div>
                  <span className={`text-[10px] font-bold w-16 text-right ${m.color}`}>{m.label}</span>
                  <span className="text-[10px] text-slate-600 w-4 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {nsCounts.length > 1 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600 mb-2">By Namespace</p>
          <div className="flex flex-col gap-1">
            {nsCounts.map(([ns, count]) => (
              <div key={ns} className="flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                  <div className="h-full rounded-full bg-slate-500" style={{ width: `${(count / total) * 100}%` }} />
                </div>
                <span className="text-[10px] text-slate-400 font-mono w-28 text-right truncate">{ns}</span>
                <span className="text-[10px] text-slate-600 w-4 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[9px] text-slate-700 text-center mt-auto pt-2">Click a row to view details</p>
    </div>
  )
}

// ── detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ r, onClose }: { r: GitOpsResource; onClose: () => void }) {
  const m = kindMeta(r.kind)
  const healthy = isHealthy(r)
  const progressing = isProgressing(r)
  const shortRev = r.revision ? r.revision.slice(0, 12) : null
  const labelEntries = r.labels ? Object.entries(r.labels) : []

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* top bar */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0 border-b border-white/[0.05]">
        <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600">Resource Detail</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* hero card */}
      <div className="relative overflow-hidden mx-4 mt-4 mb-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <div
          className="absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl opacity-[0.08] pointer-events-none"
          style={{ background: m.dot }}
        />
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <KindPill kind={r.kind} />
            {m.tool === 'flux' && <span className="text-[9px] font-black tracking-widest text-sky-500/50 uppercase">Flux</span>}
            {m.tool === 'argo' && <span className="text-[9px] font-black tracking-widest text-orange-500/50 uppercase">Argo</span>}
          </div>
          <span className={`text-[10px] font-black uppercase tracking-wider mt-0.5 ${statusColor(r)}`}>
            {r.status || 'Unknown'}
          </span>
        </div>
        <p className="font-mono text-sm font-bold text-white break-all leading-tight">{r.name}</p>
        {r.namespace && <p className="text-[10px] text-slate-500 mt-0.5">{r.namespace}</p>}
        {r.message && (
          <p className={`mt-2.5 text-[10px] leading-relaxed rounded-lg px-3 py-2 border ${healthy ? 'text-emerald-400/80 bg-emerald-500/5 border-emerald-500/10'
              : progressing ? 'text-amber-400/80 bg-amber-500/5 border-amber-500/10'
                : 'text-red-400/80 bg-red-500/5 border-red-500/10'
            }`}>
            {r.message}
          </p>
        )}
      </div>

      {/* source + revision */}
      {(r.source || r.revision) && (
        <div className="px-4 mb-4">
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600 mb-2">Source</p>
          <div className="rounded-lg bg-white/[0.03] border border-white/[0.05] divide-y divide-white/[0.04]">
            {r.source && (
              <div className="flex items-start gap-3 px-3 py-2.5">
                <span className="text-[10px] text-slate-600 w-16 shrink-0 pt-0.5 flex items-center gap-1.5 font-black uppercase tracking-widest px-1">
                  <GitBranch className="w-3 h-3" />
                  Repo
                </span>
                <span className="font-mono text-[10px] text-slate-300 flex-1 break-all">{r.source}</span>
              </div>
            )}
            {r.revision && (
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="text-[10px] text-slate-600 w-16 shrink-0 flex items-center gap-1.5 font-black uppercase tracking-widest px-1">
                  <Clock className="w-3 h-3" />
                  Rev
                </span>
                <span
                  className="inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold"
                  style={{ background: `${m.dot}15`, color: m.dot, border: `1px solid ${m.dot}25` }}
                >
                  {shortRev}
                </span>
                {r.revision.length > 12 && (
                  <span className="text-[9px] text-slate-600 font-mono truncate flex-1">{r.revision.slice(12)}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* labels */}
      {labelEntries.length > 0 && (
        <div className="px-4 mb-4">
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600 mb-2">Labels</p>
          <div className="flex flex-wrap gap-1.5">
            {labelEntries.map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                <span className="text-[9px] font-bold text-slate-500">{k}</span>
                <span className="text-[9px] text-slate-400 font-mono max-w-[100px] truncate">{v}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── empty (no controllers) ────────────────────────────────────────────────────

function NoControllersState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full gap-0 py-20 text-center">
      {/* icon with ambient glow */}
      <div className="relative mb-10 group">
        <div className="absolute inset-0 bg-sky-500/10 blur-[60px] rounded-full opacity-50 group-hover:opacity-80 transition-opacity" />
        <div className="relative w-28 h-28 rounded-[2.2rem] bg-white/[0.03] border border-white/[0.1] flex items-center justify-center shadow-2xl shadow-black/50 backdrop-blur-sm">
          <Activity className="w-14 h-14 text-slate-500/60" />
        </div>
        <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-[hsl(var(--bg-dark))] border border-white/[0.12] flex items-center justify-center shadow-xl text-amber-500/80">
          <AlertTriangle className="w-6 h-6" />
        </div>
      </div>

      <h1 className="text-3xl font-black text-white mb-4 tracking-tighter">No GitOps Controllers Found</h1>
      <p className="text-[14px] text-slate-500 leading-relaxed text-center max-w-xl mb-20 font-medium">
        Podscape couldn't detect <span className="text-sky-400 font-bold">Flux v2</span> or <span className="text-orange-400 font-bold">Argo CD</span> in this cluster.
        Install a controller to enable continuous delivery and application management.
      </p>

      {/* install options cards — expanded width to fill space */}
      <div className="flex gap-10 px-12 w-full max-w-6xl">
        <button
          onClick={() => (window as any).electron?.shell?.openExternal('https://fluxcd.io/flux/installation/')}
          className="flex-1 flex flex-col items-start p-8 rounded-3xl border border-sky-500/20 bg-sky-500/[0.04] hover:bg-sky-500/[0.08] hover:border-sky-500/40 transition-all group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Shield className="w-6 h-6 text-sky-400" />
          </div>
          <div className="text-left mb-6">
            <p className="text-lg font-black text-white mb-2">Flux CD</p>
            <p className="text-[12px] text-slate-500 leading-relaxed font-medium">
              The GitOps family of projects for Kubernetes. Flux keeps clusters in sync with sources like Git repositories and automates updates.
            </p>
          </div>
          <span className="mt-auto text-[11px] font-black text-sky-400 uppercase tracking-widest flex items-center gap-2 group-hover:gap-3 transition-all">
            Installation docs <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </button>

        <button
          onClick={() => (window as any).electron?.shell?.openExternal('https://argo-cd.readthedocs.io/en/stable/getting_started/')}
          className="flex-1 flex flex-col items-start p-8 rounded-3xl border border-orange-500/20 bg-orange-500/[0.04] hover:bg-orange-500/[0.08] hover:border-orange-500/40 transition-all group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Activity className="w-6 h-6 text-orange-400" />
          </div>
          <div className="text-left mb-6">
            <p className="text-lg font-black text-white mb-2">Argo CD</p>
            <p className="text-[12px] text-slate-500 leading-relaxed font-medium">
              A declarative, GitOps continuous delivery tool for Kubernetes. It follows the GitOps pattern of using Git as the source of truth.
            </p>
          </div>
          <span className="mt-auto text-[11px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-2 group-hover:gap-3 transition-all">
            Installation docs <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </button>
      </div>
    </div>
  )
}

// ── table row ─────────────────────────────────────────────────────────────────

function TableRow({ r, selected, onClick }: { r: GitOpsResource; selected: boolean; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer transition-colors ${selected ? 'bg-sky-500/[0.08]' : 'hover:bg-white/[0.03]'
        }`}
    >
      <td className="pl-5 pr-2 py-3">
        <PulseDot r={r} />
      </td>
      <td className="px-3 py-3 max-w-0">
        <p className="font-mono text-[11px] font-semibold text-slate-200 truncate">{r.name}</p>
        {r.message && !r.ready && r.status !== 'Unknown' && (
          <p className="text-[9px] text-red-400/70 truncate mt-0.5">{r.message}</p>
        )}
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <KindPill kind={r.kind} />
      </td>
      <td className="px-3 py-3 max-w-0">
        <span className="text-[10px] text-slate-500 font-mono truncate block" title={r.namespace}>{r.namespace || '—'}</span>
      </td>
      <td className="px-3 py-3 max-w-0">
        <span className="text-[10px] text-slate-500 font-mono truncate block" title={r.source}>
          {r.source || '—'}
        </span>
      </td>
      <td className="px-3 pr-5 py-3 whitespace-nowrap">
        {r.revision ? (
          <span className="font-mono text-[10px] text-slate-500">{r.revision.slice(0, 8)}</span>
        ) : (
          <span className="text-[10px] text-slate-700">—</span>
        )}
      </td>
      <td className="px-3 py-3 max-w-0">
        <span className={`text-[10px] font-bold ${statusColor(r)} truncate block`}>{r.status || '—'}</span>
      </td>
    </tr>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function GitOpsPanel() {
  const { selectedContext, selectedNamespace } = useAppStore()
  const [data, setData] = useState<GitOpsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [selected, setSelected] = useState<GitOpsResource | null>(null)

  const load = useCallback(async () => {
    if (!selectedContext) return
    setLoading(true)
    setLoadError(null)
    try {
      const ns = selectedNamespace === '_all' ? undefined : selectedNamespace ?? undefined
      setData(await window.kubectl.getGitOps(ns))
    } catch (err) {
      setData(null)
      setLoadError((err as Error)?.message ?? 'Failed to load GitOps resources')
    } finally {
      setLoading(false)
    }
  }, [selectedContext, selectedNamespace])

  useEffect(() => { load() }, [load])
  useEffect(() => { setSelected(null) }, [selectedContext, selectedNamespace])

  const resources = data?.resources ?? []
  const kinds = useMemo(() => Array.from(new Set(resources.map(r => r.kind))).sort(), [resources])

  const filtered = useMemo(() => resources.filter(r => {
    if (kindFilter !== 'all' && r.kind !== kindFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return r.name.toLowerCase().includes(q)
      || r.namespace.toLowerCase().includes(q)
      || (r.source ?? '').toLowerCase().includes(q)
      || r.kind.toLowerCase().includes(q)
  }), [resources, kindFilter, search])

  const noControllers = data !== null && !loadError && !data.fluxDetected && !data.argoDetected && resources.length === 0

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[hsl(var(--bg-dark))] overflow-hidden relative h-full">

      <PageHeader
        title="GitOps Hub"
        subtitle="Synchronized cluster state and automated delivery status"
      >
        <div className="flex items-center gap-6">
          {/* inline stats */}
          {resources.length > 0 && (
            <div className="flex items-center gap-4 border-r border-slate-200 dark:border-white/10 pr-6 mr-2">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Total</span>
                <span className="text-[12px] font-black font-mono text-slate-700 dark:text-slate-300">{resources.length}</span>
              </div>
              {resources.filter(isHealthy).length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Healthy</span>
                  <span className="text-[12px] font-black font-mono text-emerald-500">{resources.filter(isHealthy).length}</span>
                </div>
              )}
              {data?.fluxDetected && (
                <span className="px-2 py-0.5 text-[9px] font-black tracking-widest bg-sky-500/10 text-sky-500 dark:text-sky-400 rounded-md border border-sky-500/20 uppercase">Flux</span>
              )}
              {data?.argoDetected && (
                <span className="px-2 py-0.5 text-[9px] font-black tracking-widest bg-orange-500/10 text-orange-500 dark:text-orange-400 rounded-md border border-orange-500/20 uppercase">Argo CD</span>
              )}
            </div>
          )}

          {resources.length === 0 && !loading && (
            <div className="flex items-center gap-2 border-r border-slate-200 dark:border-white/10 pr-6 mr-2">
              <span className="text-[10px] font-black tracking-widest text-slate-400 dark:text-slate-600 uppercase">Status:</span>
              <div className="px-3 py-1 rounded-full bg-amber-500/5 border border-amber-500/20 flex items-center gap-2">
                <AlertTriangle className="w-3 h-3 text-amber-500/60" />
                <span className="text-[10px] font-black tracking-widest text-amber-500/80 uppercase">No Tools Detected</span>
              </div>
            </div>
          )}

          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </PageHeader>

      {resources.length > 0 && (
        <div className="px-5 py-3 border-b border-white/[0.05] shrink-0 flex items-center gap-4 bg-white/[0.005]">
          {/* kind filter tabs */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setKindFilter('all')}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-all ${kindFilter === 'all' ? 'bg-sky-500/20 text-sky-400 border-sky-500/30' : 'text-slate-500 hover:text-slate-300 border-transparent hover:bg-white/5'}`}
            >
              All <span className="text-slate-600 ml-0.5">({resources.length})</span>
            </button>
            {kinds.map(k => (
              <button
                key={k}
                onClick={() => setKindFilter(f => f === k ? 'all' : k)}
                className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-all ${kindFilter === k ? 'bg-sky-500/20 text-sky-400 border-sky-500/30' : 'text-slate-500 hover:text-slate-300 border-transparent hover:bg-white/5'}`}
              >
                {KIND_META[k]?.label ?? k}
                <span className="text-slate-600 ml-0.5">({resources.filter(r => r.kind === k).length})</span>
              </button>
            ))}
            <div className="flex items-center gap-1 ml-2">
              <button className="p-1 rounded bg-white/5 text-slate-600 hover:text-slate-300"><LayoutGrid className="w-3 h-3" /></button>
              <button className="p-1 rounded bg-white/5 text-slate-600 hover:text-slate-300"><ListFilter className="w-3 h-3" /></button>
            </div>
          </div>

          {/* search pinned to right */}
          <div className="ml-auto relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
            <input
              type="text"
              placeholder="Search GitOps…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl
                         focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-44"
            />
          </div>
        </div>
      )}

      {/* ── body ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-3 text-slate-600">
          <div className="w-4 h-4 border-2 border-slate-700 border-t-sky-500 rounded-full animate-spin" />
          <span className="text-xs font-bold">Detecting GitOps controllers…</span>
        </div>
      ) : loadError ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-red-500/[0.08] border border-red-500/20 max-w-md">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <div>
              <p className="text-[11px] font-black text-red-400">Failed to load GitOps resources</p>
              <p className="text-[10px] text-red-400/60 mt-0.5">{loadError}</p>
            </div>
          </div>
        </div>
      ) : noControllers ? (
        <div className="flex-1 flex items-center justify-center">
          <NoControllersState />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">

          {/* ── left: table ─────────────────────────────────────────────── */}
          <div className="flex flex-col overflow-y-auto" style={{ width: '65%' }}>
            {filtered.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-600 py-16">
                <p className="text-xs font-bold">No resources match</p>
              </div>
            ) : (
              <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '28px' }} />
                  <col />
                  <col style={{ width: '130px' }} />
                  <col style={{ width: '130px' }} />
                  <col style={{ width: '140px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '90px' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-white/[0.05]">
                    <th className="pl-5 pr-2 py-2.5" />
                    {['Name', 'Kind', 'Namespace', 'Source', 'Rev', 'Status'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-600 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {filtered.map(r => (
                    <TableRow
                      key={`${r.kind}/${r.namespace}/${r.name}`}
                      r={r}
                      selected={selected?.kind === r.kind && selected?.name === r.name && selected?.namespace === r.namespace}
                      onClick={() => setSelected(prev =>
                        prev?.kind === r.kind && prev?.name === r.name && prev?.namespace === r.namespace ? null : r
                      )}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── right: detail or overview ───────────────────────────────── */}
          <div className="border-l border-white/[0.05] overflow-hidden" style={{ width: '35%' }}>
            {selected ? (
              <DetailPanel r={selected} onClose={() => setSelected(null)} />
            ) : (
              <OverviewPanel
                resources={resources}
                fluxDetected={data?.fluxDetected ?? false}
                argoDetected={data?.argoDetected ?? false}
              />
            )}
          </div>

        </div>
      )}
    </div>
  )
}
