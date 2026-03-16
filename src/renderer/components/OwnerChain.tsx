import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { OwnerRef } from '../types'

// ─── constants ───────────────────────────────────────────────────────────────

const NODE_W   = 168   // px — card width (ancestors, current, descendants all share this)
const NODE_GAP = 10    // px — gap between sibling descendant cards
const MAX_DESC = 7     // max visible descendant cards before "+N more"

// ─── props ────────────────────────────────────────────────────────────────────

interface Props {
  uid: string
  kind: string
  name: string
  namespace: string
}

interface NodeCardProps {
  kind: string
  name: string
  namespace: string
  found: boolean
  isCurrent?: boolean
  onClick?: () => void
  width: number
}

// ─── kind styles ──────────────────────────────────────────────────────────────

interface KindStyle {
  border: string; bg: string; ring: string
  label: string; badge: string; hex: string
}

const KIND_STYLES: Record<string, KindStyle> = {
  Deployment:  { border: 'border-[#4065f5]/40', bg: 'bg-[#4065f5]/10', ring: 'ring-[#4065f5]/30', label: 'text-[#4065f5]',  badge: 'bg-[#4065f5] text-white',        hex: '#4065f5' },
  ReplicaSet:  { border: 'border-indigo-500/40', bg: 'bg-indigo-500/10', ring: 'ring-indigo-500/30', label: 'text-indigo-400', badge: 'bg-indigo-500 text-white',        hex: '#6366f1' },
  DaemonSet:   { border: 'border-violet-500/40', bg: 'bg-violet-500/10', ring: 'ring-violet-500/30', label: 'text-violet-400', badge: 'bg-violet-500 text-white',        hex: '#8b5cf6' },
  StatefulSet: { border: 'border-purple-500/40', bg: 'bg-purple-500/10', ring: 'ring-purple-500/30', label: 'text-purple-400', badge: 'bg-purple-500 text-white',        hex: '#a855f7' },
  Job:         { border: 'border-amber-500/40',  bg: 'bg-amber-500/10',  ring: 'ring-amber-500/30',  label: 'text-amber-400',  badge: 'bg-amber-500 text-slate-900',    hex: '#f59e0b' },
  CronJob:     { border: 'border-orange-500/40', bg: 'bg-orange-500/10', ring: 'ring-orange-500/30', label: 'text-orange-400', badge: 'bg-orange-500 text-white',        hex: '#f97316' },
  Pod:         { border: 'border-emerald-500/40',bg: 'bg-emerald-500/10',ring: 'ring-emerald-500/30',label: 'text-emerald-400',badge: 'bg-emerald-500 text-slate-900',  hex: '#10b981' },
}
const DEFAULT_STYLE: KindStyle = {
  border: 'border-slate-600/40', bg: 'bg-slate-600/10', ring: 'ring-slate-600/30',
  label: 'text-slate-400', badge: 'bg-slate-600 text-white', hex: '#64748b',
}
const ks = (k: string) => KIND_STYLES[k] ?? DEFAULT_STYLE

// ─── kind icons ───────────────────────────────────────────────────────────────

function KindIcon({ kind, color, size = 13 }: { kind: string; color: string; size?: number }) {
  const p: React.SVGProps<SVGSVGElement> = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color, strokeWidth: 2,
    strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { flexShrink: 0 },
  }
  switch (kind) {
    case 'Deployment':
      return <svg {...p}><rect x="2" y="3" width="20" height="5" rx="1"/><rect x="2" y="10" width="20" height="5" rx="1"/><rect x="2" y="17" width="20" height="5" rx="1"/></svg>
    case 'ReplicaSet':
      return <svg {...p}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 012-2h10"/></svg>
    case 'DaemonSet':
      return <svg {...p}><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="9.5" width="9" height="4" rx="1"/><rect x="13" y="9.5" width="9" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/></svg>
    case 'StatefulSet':
      return <svg {...p}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v4c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 9v4c0 1.66 4.03 3 9 3s9-1.34 9-3V9"/><path d="M3 13v4c0 1.66 4.03 3 9 3s9-1.34 9-3V13"/></svg>
    case 'Job':
      return <svg {...p}><polygon points="5 3 19 12 5 21 5 3"/></svg>
    case 'CronJob':
      return <svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    case 'Pod':
      return <svg {...p}><path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
    default:
      return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
  }
}

// ─── connectors ───────────────────────────────────────────────────────────────

function DownArrow() {
  return (
    <svg width="14" height="20" style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
      <line x1="7" y1="0" x2="7" y2="13" stroke="#334155" strokeWidth="1"/>
      <path d="M3 9 L7 15 L11 9" fill="none" stroke="#334155" strokeWidth="1" strokeLinejoin="round"/>
    </svg>
  )
}

/** SVG that draws the branching connector from a single parent to N children. */
function BranchConnector({ count }: { count: number }) {
  if (count === 0) return null

  const totalW = count * NODE_W + (count - 1) * NODE_GAP
  const cx     = totalW / 2     // center x
  const nc     = NODE_W / 2     // center of each node
  const h      = 24

  if (count === 1) {
    return (
      <svg width={totalW} height={h} style={{ display: 'block' }}>
        <line x1={cx} y1={0} x2={cx} y2={h - 6} stroke="#334155" strokeWidth="1"/>
        <path d={`M${cx - 4} ${h - 9} L${cx} ${h - 3} L${cx + 4} ${h - 9}`}
          fill="none" stroke="#334155" strokeWidth="1" strokeLinejoin="round"/>
      </svg>
    )
  }

  const midY  = h / 2
  const leftX = nc
  const rightX = (count - 1) * (NODE_W + NODE_GAP) + nc

  return (
    <svg width={totalW} height={h} style={{ display: 'block' }}>
      {/* Vertical stem from parent */}
      <line x1={cx} y1={0} x2={cx} y2={midY} stroke="#334155" strokeWidth="1"/>
      {/* Horizontal bar */}
      <line x1={leftX} y1={midY} x2={rightX} y2={midY} stroke="#334155" strokeWidth="1"/>
      {/* Vertical drops to each child */}
      {Array.from({ length: count }).map((_, i) => {
        const x = nc + i * (NODE_W + NODE_GAP)
        return <line key={i} x1={x} y1={midY} x2={x} y2={h} stroke="#334155" strokeWidth="1"/>
      })}
    </svg>
  )
}

// ─── node card ────────────────────────────────────────────────────────────────

function NodeCard({ kind, name, namespace, found, isCurrent, onClick, width }: NodeCardProps) {
  const st = ks(kind)

  const baseCls = 'relative flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 select-none transition-all duration-150'
  const activeCls  = `${st.border} ${st.bg} ring-2 ring-offset-1 ring-offset-[hsl(222,20%,6%)] ${st.ring}`
  const clickCls   = 'border-white/[0.07] bg-white/[0.03] cursor-pointer hover:bg-white/[0.06] hover:border-white/[0.15] active:scale-[0.97]'
  const missingCls = 'border-dashed border-white/10 bg-transparent opacity-40 cursor-default'

  return (
    <div
      onClick={onClick}
      style={{ width }}
      className={[baseCls, isCurrent ? activeCls : found ? clickCls : missingCls].join(' ')}
    >
      {/* Kind row */}
      <div className="flex items-center justify-between gap-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          <KindIcon
            kind={kind}
            color={isCurrent ? st.hex : found ? st.hex + '99' : '#475569'}
            size={13}
          />
          <span className={`text-[9px] font-black uppercase tracking-wider truncate ${isCurrent ? st.label : 'text-slate-500'}`}>
            {kind}
          </span>
        </div>
        {isCurrent && (
          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0 leading-none ${st.badge}`}>
            ACTIVE
          </span>
        )}
        {!found && !isCurrent && (
          <span className="text-[8px] text-red-400/50 shrink-0">missing</span>
        )}
      </div>

      {/* Name */}
      <span className="text-[11px] font-semibold text-slate-200 truncate leading-tight">{name}</span>

      {/* Namespace — omit for descendants to keep cards compact */}
      {namespace && isCurrent && (
        <span className="text-[9px] text-slate-600 truncate leading-none">{namespace}</span>
      )}
    </div>
  )
}

// ─── loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="border-b border-white/5 shrink-0 px-5 py-3">
      <div className="h-2.5 w-28 bg-white/5 rounded-full animate-pulse mb-4" />
      <div className="flex flex-col items-center gap-[10px]">
        {[1, 2, 3].map(i => (
          <React.Fragment key={i}>
            <div className="h-[62px] rounded-xl bg-white/[0.04] animate-pulse" style={{ width: NODE_W }} />
            {i < 3 && <div className="h-5 w-px bg-white/[0.04] animate-pulse" />}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function OwnerChain({ uid, kind, name, namespace }: Props): JSX.Element | null {
  const { ownerChains, navigateToResource } = useAppStore()
  const [loading, setLoading]   = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const chain = ownerChains[uid]

  useEffect(() => {
    if (chain !== undefined || loading) return
    if (!window.kubectl?.getOwnerChain) return
    setLoading(true)
    window.kubectl.getOwnerChain(kind, name, namespace)
      .then((result: any) => {
        useAppStore.setState(s => ({ ownerChains: { ...s.ownerChains, [uid]: result } }))
      })
      .catch(() => {
        useAppStore.setState(s => ({
          ownerChains: { ...s.ownerChains, [uid]: { ancestors: [], descendants: {} } },
        }))
      })
      .finally(() => setLoading(false))
  }, [uid, kind, name, namespace, chain, loading])

  if (loading) return <LoadingSkeleton />
  if (!chain)  return null

  // ancestors stored leaf→root, reverse for display (root at top)
  const ancestors = [...(chain.ancestors ?? [])].reverse()
  const allDesc   = Object.values(chain.descendants ?? {}).flat() as OwnerRef[]

  if (ancestors.length === 0 && allDesc.length === 0) return null

  const totalNodes   = ancestors.length + 1 + allDesc.length
  const visible      = allDesc.slice(0, MAX_DESC)
  const hiddenCount  = allDesc.length - MAX_DESC
  const totalVisible = visible.length + (hiddenCount > 0 ? 1 : 0)

  return (
    <div className="border-b border-slate-100 dark:border-white/5 shrink-0">

      {/* ── Section header ──────────────────────────────────────────────── */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          {/* Tree icon */}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" className="text-slate-600">
            <circle cx="12" cy="5" r="2"/>
            <circle cx="5" cy="19" r="2"/>
            <circle cx="19" cy="19" r="2"/>
            <line x1="12" y1="7" x2="5.8" y2="17"/>
            <line x1="12" y1="7" x2="18.2" y2="17"/>
          </svg>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em]">
            Ownership Chain
          </span>
          <span className="text-[9px] font-bold text-slate-600 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded-full">
            {totalNodes}
          </span>
        </div>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round"
          className={`text-slate-600 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      {/* ── Tree body ───────────────────────────────────────────────────── */}
      {!collapsed && (
        <div className="pb-5 pt-1 overflow-x-auto">
          <div className="flex flex-col items-center min-w-max px-5">

            {/* Ancestor chain — root at top, each with a DownArrow below */}
            {ancestors.map((ref: OwnerRef, i: number) => (
              <React.Fragment key={`a-${ref.uid || i}`}>
                <NodeCard
                  kind={ref.kind} name={ref.name} namespace={ref.namespace}
                  found={ref.found} width={NODE_W}
                  onClick={ref.found ? () => navigateToResource(ref.kind, ref.name, ref.namespace) : undefined}
                />
                <DownArrow />
              </React.Fragment>
            ))}

            {/* Current resource */}
            <NodeCard
              kind={kind} name={name} namespace={namespace}
              found isCurrent width={NODE_W}
            />

            {/* Descendants — branching below the current node */}
            {visible.length > 0 && (
              <>
                <BranchConnector count={totalVisible} />
                <div className="flex" style={{ gap: NODE_GAP }}>
                  {visible.map((ref: OwnerRef, i: number) => (
                    <NodeCard
                      key={`d-${ref.uid || i}`}
                      kind={ref.kind} name={ref.name} namespace={ref.namespace}
                      found={ref.found} width={NODE_W}
                      onClick={ref.found ? () => navigateToResource(ref.kind, ref.name, ref.namespace) : undefined}
                    />
                  ))}
                  {hiddenCount > 0 && (
                    <div
                      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] text-[10px] font-bold text-slate-600"
                      style={{ width: NODE_W, minHeight: 68 }}
                    >
                      +{hiddenCount} more
                    </div>
                  )}
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  )
}
