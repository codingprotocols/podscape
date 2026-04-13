import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import { Shield } from 'lucide-react'
import PageHeader from '../core/PageHeader'
import type { ResourceKind } from '../../types'
import {
  type NodeKind, type EdgeKind, type GraphNode, type GraphEdge, type Graph,
  edgeStyle, workloadBadgeLabel, workloadIcon, collapsePodReplicas,
} from './NetworkPanel.utils'

interface NodePos { x: number; y: number; vx: number; vy: number }

// ─── Namespace colour palette ─────────────────────────────────────────────────

const NS_PALETTE = [
  { bg: 'hsla(217, 91%, 60%, 0.08)', border: 'hsla(217, 91%, 60%, 0.25)', text: '#3b82f6' },
  { bg: 'hsla(262, 83%, 58%, 0.08)', border: 'hsla(262, 83%, 58%, 0.25)', text: '#8b5cf6' },
  { bg: 'hsla(161, 94%, 30%, 0.08)', border: 'hsla(161, 94%, 30%, 0.25)', text: '#10b981' },
  { bg: 'hsla(38, 92%, 50%, 0.08)', border: 'hsla(38, 92%, 50%, 0.25)', text: '#f59e0b' },
  { bg: 'hsla(188, 78%, 41%, 0.08)', border: 'hsla(188, 78%, 41%, 0.25)', text: '#06b6d4' },
  { bg: 'hsla(330, 81%, 60%, 0.08)', border: 'hsla(330, 81%, 60%, 0.25)', text: '#ec4899' },
  { bg: 'hsla(82, 84%, 44%, 0.08)', border: 'hsla(82, 84%, 44%, 0.25)', text: '#84cc16' },
  { bg: 'hsla(0, 84%, 60%, 0.08)', border: 'hsla(0, 84%, 60%, 0.25)', text: '#ef4444' },
] as const

function nsColor(nsIdx: number) {
  const idx = Math.max(0, nsIdx)
  return NS_PALETTE[idx % NS_PALETTE.length]
}

// ─── Node colours ─────────────────────────────────────────────────────────────

function nodeColor(n: GraphNode): string {
  if (n.kind === 'ingress') return '#a78bfa'
  if (n.kind === 'service') {
    if (n.serviceType === 'LoadBalancer') return '#22d3ee'
    if (n.serviceType === 'NodePort') return '#2dd4bf'
    return '#60a5fa'
  }
  if (n.kind === 'policy') return '#f472b6'
  if (n.kind === 'workload') return '#fbbf24'
  if (n.kind === 'pvc') return '#f87171'
  if (n.kind === 'node') return '#06b6d4'
  if (n.phase === 'Running' || n.phase === 'Bound') return '#34d399'
  if (n.phase === 'Pending') return '#fbbf24'
  if (n.phase === 'Failed') return '#f87171'
  return '#94a3b8'
}

function nodeBg(n: GraphNode, dark: boolean): string {
  const c = nodeColor(n)
  return dark ? `${c}15` : `${c}10`
}

function nodeBorder(n: GraphNode, dark: boolean): string {
  const c = nodeColor(n)
  return dark ? `${c}35` : `${c}25`
}

// All unique edge colors (for predefining arrow markers)
const ALL_EDGE_COLORS = ['#8b5cf6', '#f472b6', '#a78bfa', '#60a5fa', '#3b82f6', '#f87171', '#06b6d4', '#fbbf24']

const KIND_DEFS: { kind: NodeKind; label: string; color: string }[] = [
  { kind: 'ingress', label: 'Ingress', color: '#a78bfa' },
  { kind: 'workload', label: 'Workload (Deploy/DS/STS/Job…)', color: '#fbbf24' },
  { kind: 'service', label: 'Service', color: '#60a5fa' },
  { kind: 'pod', label: 'Pod', color: '#34d399' },
  { kind: 'pvc', label: 'PVC', color: '#f87171' },
  { kind: 'node', label: 'Node', color: '#06b6d4' },
  { kind: 'policy', label: 'Policy', color: '#f472b6' },
]

// ─── Shared SVG defs (glow filter + per-color arrow markers) ─────────────────

function GraphDefs() {
  return (
    <defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      {ALL_EDGE_COLORS.map(c => (
        <marker key={c} id={`arr-${c.slice(1)}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0 0L6 3L0 6z" fill={c} />
        </marker>
      ))}
    </defs>
  )
}

// ─── Force simulation (step-based for async rAF) ─────────────────────────────

const REPULSION = 10000
const ATTRACTION = 0.005
const GRAVITY = 0.001
const DAMPING = 0.8
const NATURAL_LEN = 220
const NS_CLUSTER_STR = 0.02
const COLLISION_R = 12 * 2.5

// Target radii for different kinds (radial bands)
const KIND_RADIUS: Record<NodeKind, number> = {
  ingress: 700,
  workload: 550,
  service: 400,
  pod: 250,
  pvc: 100,
  node: 850,
  policy: 900
}

function createSimulator(graph: Graph, groupByNs: boolean): { positions: Map<string, NodePos>; step: (iter: number, total: number) => void } {
  const { nodes, edges, namespaces } = graph
  const positions = new Map<string, NodePos>()
  if (!nodes.length) return { positions, step: () => { } }

  const clusterCenters = new Map<string, { x: number; y: number }>()

  if (groupByNs && namespaces.length > 1) {
    const cr = Math.max(450, namespaces.length * 200)
    namespaces.forEach((ns, i) => {
      const a = (i / namespaces.length) * Math.PI * 2
      clusterCenters.set(ns, { x: Math.cos(a) * cr, y: Math.sin(a) * cr })
    })
    const byNs = new Map<string, GraphNode[]>()
    for (const n of nodes) {
      if (!byNs.has(n.namespace)) byNs.set(n.namespace, [])
      byNs.get(n.namespace)!.push(n)
    }
    for (const [ns, nNodes] of byNs) {
      const c = clusterCenters.get(ns) ?? { x: 0, y: 0 }
      const lr = Math.max(80, Math.sqrt(nNodes.length) * 60)
      nNodes.forEach((n, i) => {
        const a = (i / nNodes.length) * Math.PI * 2
        positions.set(n.id, { x: c.x + Math.cos(a) * lr, y: c.y + Math.sin(a) * lr, vx: 0, vy: 0 })
      })
    }
  } else {
    // Initial radial layout based on kind
    nodes.forEach((n, i) => {
      const r = KIND_RADIUS[n.kind] || 400
      const a = (i / nodes.length) * Math.PI * 2
      positions.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 })
    })
  }

  const ids = nodes.map(n => n.id)
  const nodeById = new Map(nodes.map(n => [n.id, n]))

  function step(iter: number, total: number) {
    const alpha = 1 - iter / total

    // 1. Repulsion + Collision Detection
    for (let i = 0; i < ids.length; i++) {
      const aId = ids[i]
      const a = positions.get(aId)!
      for (let j = i + 1; j < ids.length; j++) {
        const bId = ids[j]
        const b = positions.get(bId)!
        const dx = b.x - a.x, dy = b.y - a.y
        const distSq = dx * dx + dy * dy
        const dist = Math.sqrt(distSq) || 0.1

        // Collision detection: push apart harder if overlapping
        if (dist < COLLISION_R) {
          const strength = (COLLISION_R - dist) / COLLISION_R
          const fx = (dx / dist) * strength * 0.5
          const fy = (dy / dist) * strength * 0.5
          a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy
        }

        // Standard repulsion
        const f = (REPULSION / (distSq + 200)) * alpha
        const fx = (dx / dist) * f, fy = (dy / dist) * f
        a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy
      }
    }

    // 2. Attraction (Edges)
    for (const edge of edges) {
      const s = positions.get(edge.source), t = positions.get(edge.target)
      if (!s || !t) continue
      const dx = t.x - s.x, dy = t.y - s.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
      const f = (dist - NATURAL_LEN) * ATTRACTION * alpha
      const fx = (dx / dist) * f, fy = (dy / dist) * f
      s.vx += fx; s.vy += fy; t.vx -= fx; t.vy -= fy
    }

    // 3. Central Gravity & Radial Constraints
    for (const [id, p] of positions.entries()) {
      const n = nodeById.get(id)!
      if (!groupByNs) {
        // Radial constraint: pull nodes towards their kind-specific target radius
        const targetR = KIND_RADIUS[n.kind] || 400
        const dist = Math.sqrt(p.x * p.x + p.y * p.y) || 0.1
        const f = (dist - targetR) * 0.002 * alpha
        p.vx -= (p.x / dist) * f
        p.vy -= (p.y / dist) * f
      }
      p.vx -= p.x * GRAVITY * alpha
      p.vy -= p.y * GRAVITY * alpha
    }

    // 4. Namespace Clustering
    if (groupByNs && clusterCenters.size) {
      for (const id of ids) {
        const p = positions.get(id)!
        const c = clusterCenters.get(nodeById.get(id)!.namespace)
        if (!c) continue
        p.vx += (c.x - p.x) * NS_CLUSTER_STR * alpha
        p.vy += (c.y - p.y) * NS_CLUSTER_STR * alpha
      }
    }

    // 5. Apply Movement
    for (const p of positions.values()) {
      p.vx *= DAMPING; p.vy *= DAMPING
      p.x += p.vx; p.y += p.vy
    }
  }

  return { positions, step }
}

// ─── Topology layout ──────────────────────────────────────────────────────────

const NODE_W = 164
const NODE_H = 54
const H_GAP = 36

const ROW_Y: Record<NodeKind, number> = {
  ingress: 80,
  workload: 200,
  service: 320,
  pod: 440,
  pvc: 560,
  node: 680,
  policy: 800
}

const LANE_ROW_Y: Record<NodeKind, number> = {
  ingress: 68,
  workload: 180,
  service: 292,
  pod: 404,
  pvc: 516,
  node: 628,
  policy: 740
}
const LANE_MIN_W = 180
const LANE_PAD_X = 20
const LANE_GAP = 28
const LANE_HEADER = 36
const LANE_HEIGHT = LANE_ROW_Y.policy + NODE_H + 26

interface LaneDef { ns: string; nsIdx: number; x: number; y: number; w: number; h: number }

function computeTopoPositions(graph: Graph, groupByNs: boolean) {
  const positions = new Map<string, { x: number; y: number }>()
  const lanes: LaneDef[] = []
  const ALL_KINDS: NodeKind[] = ['ingress', 'workload', 'service', 'pod', 'pvc', 'node', 'policy']

  if (!groupByNs) {
    const byKind: Record<NodeKind, GraphNode[]> = {
      ingress: [], workload: [], service: [], pod: [], pvc: [], node: [], policy: []
    }
    for (const n of graph.nodes) byKind[n.kind].push(n)
    for (const kind of ALL_KINDS) {
      const row = byKind[kind]
      if (!row.length) continue
      const totalW = row.length * NODE_W + (row.length - 1) * H_GAP
      const startX = -totalW / 2 + NODE_W / 2
      row.forEach((n, i) => positions.set(n.id, { x: startX + i * (NODE_W + H_GAP), y: ROW_Y[kind] }))
    }
    return { positions, lanes }
  }

  const { namespaces } = graph
  const byNsKind = new Map<string, Record<NodeKind, GraphNode[]>>()
  for (const ns of namespaces) {
    byNsKind.set(ns, {
      ingress: [], workload: [], service: [], pod: [], pvc: [], node: [], policy: []
    })
  }
  for (const n of graph.nodes) {
    const bucket = byNsKind.get(n.namespace)
    if (bucket) bucket[n.kind].push(n)
  }

  const laneWidths = namespaces.map(ns => {
    const b = byNsKind.get(ns)!
    const counts = ALL_KINDS.map(k => b[k].length)
    const mx = Math.max(...counts, 1)
    return Math.max(LANE_MIN_W, mx * (NODE_W + H_GAP) - H_GAP + LANE_PAD_X * 2)
  })

  const totalW = laneWidths.reduce((s, w) => s + w, 0) + (namespaces.length - 1) * LANE_GAP
  let curX = -totalW / 2

  namespaces.forEach((ns, nsIdx) => {
    const lw = laneWidths[nsIdx]
    const laneCenter = curX + lw / 2
    const b = byNsKind.get(ns)!

    for (const kind of ALL_KINDS) {
      const row = b[kind]
      const rowW = row.length * NODE_W + (row.length - 1) * H_GAP
      const rowStart = laneCenter - rowW / 2 + NODE_W / 2
      row.forEach((n, i) =>
        positions.set(n.id, { x: rowStart + i * (NODE_W + H_GAP), y: LANE_HEADER + LANE_ROW_Y[kind] })
      )
    }

    lanes.push({ ns, nsIdx, x: curX - LANE_PAD_X / 2, y: 0, w: lw + LANE_PAD_X, h: LANE_HEIGHT + LANE_HEADER })
    curX += lw + LANE_GAP
  })

  return { positions, lanes }
}

// ─── Topology adaptive edge endpoint computation ──────────────────────────────

function computeEdgeEndpoints(
  sp: { x: number; y: number },
  tp: { x: number; y: number }
): { path: string; lx: number; ly: number } {
  const dx = tp.x - sp.x
  const dy = tp.y - sp.y

  if (Math.abs(dx) > Math.abs(dy) * 1.5) {
    // Predominantly horizontal: attach to left/right sides
    const sign = dx > 0 ? 1 : -1
    const sx = sp.x + sign * NODE_W / 2, sy = sp.y
    const tx = tp.x - sign * NODE_W / 2, ty = tp.y
    const mid = (sx + tx) / 2
    return {
      path: `M ${sx} ${sy} C ${mid} ${sy}, ${mid} ${ty}, ${tx} ${ty}`,
      lx: (sx + tx) / 2,
      ly: (sy + ty) / 2,
    }
  }

  // Predominantly vertical: attach to top/bottom
  const sign = dy > 0 ? 1 : -1
  const sx = sp.x, sy = sp.y + sign * NODE_H / 2
  const tx = tp.x, ty = tp.y - sign * NODE_H / 2
  const ddy = ty - sy
  return {
    path: `M ${sx} ${sy} C ${sx} ${sy + ddy / 2}, ${tx} ${ty - ddy / 2}, ${tx} ${ty}`,
    lx: (sx + tx) / 2,
    ly: (sy + ty) / 2,
  }
}

// ─── Edge label ───────────────────────────────────────────────────────────────

function EdgeLabel({ x, y, label, color }: { x: number; y: number; label: string; color: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={9} fontWeight={700}
      fill={color} stroke="rgba(15,23,42,0.75)" strokeWidth={3} paintOrder="stroke"
      style={{ userSelect: 'none' }}>
      {label}
    </text>
  )
}

// ─── Legend overlay ───────────────────────────────────────────────────────────

const LEGEND_ENTRIES = [
  { icon: '⬡', color: '#a78bfa', label: 'Ingress' },
  { icon: '📦', color: '#fbbf24', label: 'Workload (Deploy/RS...)' },
  { icon: '◈', color: '#60a5fa', label: 'Service' },
  { icon: '●', color: '#34d399', label: 'Pod · Running' },
  { icon: '●', color: '#f59e0b', label: 'Pod · Pending' },
  { icon: '●', color: '#ef4444', label: 'Pod · Failed' },
  { icon: '💿', color: '#f87171', label: 'PVC' },
  { icon: '🖥', color: '#06b6d4', label: 'Node' },
  { icon: '🛡', color: '#f472b6', label: 'Network Policy' },
]

function Legend({ dark }: { dark: boolean }) {
  return (
    <div className={`absolute bottom-6 left-6 z-10
                    bg-white/80 dark:bg-slate-900/80 backdrop-blur-md
                    border ${dark ? 'border-slate-800/60' : 'border-slate-200/60'}
                    rounded-2xl shadow-2xl px-4 py-4 min-w-[210px] transition-all duration-300`}>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 mb-3.5">Legend</p>
      <div className="space-y-1.5 mb-3">
        {LEGEND_ENTRIES.map(e => (
          <div key={e.label} className="flex items-center gap-2.5">
            <span className="text-sm w-3.5 text-center leading-none" style={{ color: e.color }}>{e.icon}</span>
            <span className="text-[11px] text-slate-600 dark:text-slate-300 leading-tight">{e.label}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Edges</p>
        {([
          ['#8b5cf6', 'Ingress → Service'],
          ['#fbbf24', 'Controller relationship'],
          ['#3b82f6', 'Service → Pod'],
          ['#f472b6', 'Policy governs Pod'],
          ['#f87171', 'Pod uses PVC'],
          ['#06b6d4', 'Pod on Node'],
        ] as [string, string][]).map(([c, lbl]) => (
          <div key={lbl} className="flex items-center gap-2.5">
            <svg width="22" height="8" className="shrink-0">
              <defs>
                <marker id={`lgnd-arr-${c.slice(1)}`} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                  <path d="M0 0L5 2.5L0 5z" fill={c} />
                </marker>
              </defs>
              <line x1="1" y1="4" x2="16" y2="4" stroke={c} strokeWidth="2"
                markerEnd={`url(#lgnd-arr-${c.slice(1)})`} />
            </svg>
            <span className="text-[11px] text-slate-600 dark:text-slate-300">{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Node tooltip ─────────────────────────────────────────────────────────────

function NodeTooltip({ node, x, y, dark, onCollapseWorkload }: {
  node: GraphNode; x: number; y: number; dark: boolean
  onCollapseWorkload?: (workloadId: string) => void
}) {
  const color = nodeColor(node)
  const clampedX = Math.min(x + 14, window.innerWidth - 240)
  return (
    <div
      style={{ position: 'fixed', left: clampedX, top: y - 12, zIndex: 200, pointerEvents: 'none' }}
      className={`bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border ${dark ? 'border-slate-800' : 'border-slate-200'} rounded-xl shadow-2xl px-3.5 py-2.5 min-w-[170px] text-xs transition-colors duration-200`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="font-bold text-slate-900 dark:text-white truncate max-w-[150px]" title={node.name}>{node.name}</span>
      </div>
      <div className="space-y-1 text-slate-500 dark:text-slate-400">
        <div><span className="text-slate-400 dark:text-slate-500">Kind</span> · <span className="text-slate-600 dark:text-slate-300 capitalize">{node.kind === 'workload' && node.workloadKind ? node.workloadKind : node.kind}</span></div>
        {node.namespace && <div><span className="text-slate-400 dark:text-slate-500">NS</span> · <span className="text-slate-600 dark:text-slate-300">{node.namespace}</span></div>}
        {node.phase && <div><span className="text-slate-400 dark:text-slate-500">Phase</span> · <span style={{ color }}>{node.phase}</span></div>}
        {node.serviceType && <div><span className="text-slate-400 dark:text-slate-500">Type</span> · <span className="text-slate-600 dark:text-slate-300">{node.serviceType}</span></div>}
        {node.ports && node.ports.length > 0 && (
          <div><span className="text-slate-400 dark:text-slate-500">Ports</span> · <span className="text-slate-600 dark:text-slate-300 font-mono">{node.ports.join(', ')}</span></div>
        )}
        <div className="mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-400">Click to navigate →</div>
        {node.kind === 'workload' && onCollapseWorkload && (
          <button
            className="mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700 text-[10px] text-pink-400 hover:text-pink-300 cursor-pointer w-full text-left block"
            style={{ pointerEvents: 'auto' }}
            onClick={() => onCollapseWorkload(node.id)}
          >
            ⊟ Collapse pods
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Toggle pill ──────────────────────────────────────────────────────────────

function TogglePill({ on, onToggle, label, icon }: { on: boolean; onToggle: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[11px] font-bold transition-all duration-300 select-none
        ${on
          ? 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-500/10 shadow-[0_0_12px_rgba(59,130,246,0.2)]'
          : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 bg-white/50 dark:bg-slate-900/50'
        }`}
    >
      <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${on ? 'bg-blue-500 shadow-[0_0_8px_#3b82f6]' : 'bg-slate-300 dark:bg-slate-700'}`} />
      {icon}
      {label}
    </button>
  )
}

// ─── Kind filter pill ─────────────────────────────────────────────────────────

function KindPill({ color, label, count, active, onToggle }: { color: string; label: string; count: number; active: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} title={`${active ? 'Hide' : 'Show'} ${label}`}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all duration-300 select-none
        ${active
          ? 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800/80 backdrop-blur-sm shadow-sm'
          : 'border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-600 opacity-40 grayscale hover:grayscale-0 hover:opacity-100'
        }`}
    >
      <div className="w-1.5 h-1.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: active ? color : '#64748b' }} />
      {label}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${active ? 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400' : 'bg-slate-50 dark:bg-slate-900/50'}`}>
        {count}
      </span>
    </button>
  )
}

// ─── Topology View ────────────────────────────────────────────────────────────

function TopologyView({ graph, groupByNs, animate, fitTrigger, dark, searchQuery, onNodeClick, onCollapseWorkload }: {
  graph: Graph; groupByNs: boolean; animate: boolean; fitTrigger: number; dark: boolean
  searchQuery: string; onNodeClick: (node: GraphNode) => void
  onCollapseWorkload: (workloadId: string) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const [tooltip, setTooltip] = useState<{ node: GraphNode; x: number; y: number } | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  const { positions, lanes } = useMemo(() => computeTopoPositions(graph, groupByNs), [graph, groupByNs])

  // Search: matched node IDs and connected edge IDs
  const matchedIds = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    return new Set(graph.nodes.filter(n => n.name.toLowerCase().includes(q)).map(n => n.id))
  }, [searchQuery, graph.nodes])

  const connectedEdgeIds = useMemo(() => {
    if (!hoveredNodeId) return null
    return new Set(graph.edges.filter(e => e.source === hoveredNodeId || e.target === hoveredNodeId).map(e => e.id))
  }, [hoveredNodeId, graph.edges])

  const fitToScreen = useCallback(() => {
    if (!svgRef.current || !positions.size) return
    const { width: svgW, height: svgH } = svgRef.current.getBoundingClientRect()
    if (svgW === 0 || svgH === 0) { requestAnimationFrame(fitToScreen); return }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of positions.values()) {
      minX = Math.min(minX, p.x - NODE_W / 2); maxX = Math.max(maxX, p.x + NODE_W / 2)
      minY = Math.min(minY, p.y - NODE_H / 2); maxY = Math.max(maxY, p.y + NODE_H / 2)
    }
    for (const lane of lanes) {
      minX = Math.min(minX, lane.x); maxX = Math.max(maxX, lane.x + lane.w)
      minY = Math.min(minY, lane.y); maxY = Math.max(maxY, lane.y + lane.h)
    }
    const PAD = 48
    const newScale = Math.min(svgW / (maxX - minX + PAD * 2), svgH / (maxY - minY + PAD * 2), 2)
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    setPan({ x: svgW / 2 - cx * newScale, y: svgH / 2 - cy * newScale })
    setScale(newScale)
  }, [positions, lanes])

  useEffect(() => { requestAnimationFrame(fitToScreen) }, [graph, groupByNs])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (fitTrigger > 0) fitToScreen() }, [fitTrigger, fitToScreen])

  // Auto-pan to search matches
  useEffect(() => {
    if (!matchedIds || matchedIds.size === 0 || !svgRef.current) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const id of matchedIds) {
      const p = positions.get(id)
      if (!p) continue
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    if (minX === Infinity) return
    const { width: svgW, height: svgH } = svgRef.current.getBoundingClientRect()
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    setPan({ x: svgW / 2 - cx * scale, y: svgH / 2 - cy * scale })
  }, [matchedIds])  // eslint-disable-line react-hooks/exhaustive-deps

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const rect = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const ns = Math.max(0.05, Math.min(4, scale * factor))
    setPan(p => ({ x: mx - (mx - p.x) * (ns / scale), y: my - (my - p.y) * (ns / scale) }))
    setScale(ns)
  }

  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest('[data-node]')) return
    panRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
  }
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!panRef.current) return
    setPan({ x: panRef.current.px + e.clientX - panRef.current.sx, y: panRef.current.py + e.clientY - panRef.current.sy })
  }
  const onMouseUp = () => { panRef.current = null }
  const onMouseLeave = () => { panRef.current = null; setTooltip(null); setHoveredNodeId(null) }

  const rowLabelX = useMemo(() => {
    if (groupByNs) return {} as Record<string, number>
    const left: Record<string, number> = {}
    for (const n of graph.nodes) {
      const p = positions.get(n.id)
      if (!p) continue
      if (left[n.kind] === undefined || p.x < left[n.kind]) left[n.kind] = p.x
    }
    return left
  }, [positions, graph.nodes, groupByNs])

  const searchActive = !!matchedIds

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing select-none"
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
      >
        <GraphDefs />
        <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
          {/* Namespace lane panels */}
          {groupByNs && lanes.map(lane => {
            const c = nsColor(lane.nsIdx)
            return (
              <g key={lane.ns}>
                <rect x={lane.x} y={lane.y} width={lane.w} height={lane.h}
                  fill={c.bg} stroke={c.border} strokeWidth={1} strokeDasharray="6 4" rx={14} />
                <text x={lane.x + lane.w / 2} y={lane.y + 22}
                  textAnchor="middle" fontSize={11} fontWeight={700} fill={c.text}
                  style={{ userSelect: 'none' }}>
                  {lane.ns}
                </text>
              </g>
            )
          })}

          {/* Flat mode row labels */}
          {!groupByNs && (['ingress', 'service', 'policy', 'pod'] as NodeKind[]).map(kind => {
            const lx = rowLabelX[kind]
            if (lx === undefined) return null
            return (
              <text key={kind}
                x={lx - NODE_W / 2 - 14} y={ROW_Y[kind] + NODE_H / 2 - 6}
                textAnchor="end" fontSize={9} fontWeight={700} letterSpacing={1.5}
                fill="#64748b" style={{ userSelect: 'none', textTransform: 'uppercase' }}>
                {kind === 'pod' ? 'Pods' : kind === 'service' ? 'Services' : kind === 'policy' ? 'Policies' : 'Ingresses'}
              </text>
            )
          })}

          {/* Edges */}
          {graph.edges.map(edge => {
            const s = positions.get(edge.source), t = positions.get(edge.target)
            if (!s || !t) return null
            const { color, dur, class: edgeClass } = edgeStyle(edge.kind)
            // Policy edges replaced by hull zones in topology view
            if (edgeClass === 'policy') return null
            const isInfra = edgeClass === 'infra'
            const { path, lx, ly } = computeEdgeEndpoints(s, t)
            const isConnected = connectedEdgeIds ? connectedEdgeIds.has(edge.id) : true
            const edgeOpacity = connectedEdgeIds
              ? (isConnected ? (isInfra ? 0.5 : 0.9) : 0.04)
              : (animate ? (isInfra ? 0.15 : 0.25) : (isInfra ? 0.25 : 0.5))
            return (
              <g key={edge.id} style={{ transition: 'opacity 0.2s' }}>
                <path d={path} fill="none" stroke={color}
                  strokeWidth={isConnected && connectedEdgeIds ? 2 : 1.5}
                  strokeOpacity={edgeOpacity}
                  strokeDasharray={isInfra ? '5 6' : undefined}
                  markerEnd={`url(#arr-${color.slice(1)})`} />
                {animate && isConnected && !isInfra && (
                  <path d={path} fill="none" stroke={color} strokeWidth={2}
                    strokeOpacity={0.85} strokeDasharray="7 9">
                    {/* @ts-ignore */}
                    <animate attributeName="stroke-dashoffset" from="16" to="0" dur={dur} repeatCount="indefinite" />
                  </path>
                )}
                {edge.label && <EdgeLabel x={lx} y={ly - 6} label={edge.label} color={color} />}
              </g>
            )
          })}

          {/* Nodes */}
          {graph.nodes.map(n => {
            const p = positions.get(n.id)
            if (!p) return null
            const color = nodeColor(n)
            const bg = nodeBg(n, dark)
            const border = nodeBorder(n, dark)
            const active = tooltip?.node.id === n.id
            const isMatch = matchedIds ? matchedIds.has(n.id) : true
            const nodeOpacity = searchActive && !isMatch ? 0.15 : 1
            const isPodGroup = n.replicaCount !== undefined
            return (
              <g key={n.id} style={{ opacity: nodeOpacity, cursor: 'pointer', transition: 'opacity 0.2s' }}
                onMouseEnter={e => { setTooltip({ node: n, x: e.clientX, y: e.clientY }); setHoveredNodeId(n.id) }}
                onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                onMouseLeave={() => { setTooltip(null); setHoveredNodeId(null) }}
                onClick={() => onNodeClick(n)}
              >
                <foreignObject
                  x={p.x - NODE_W / 2} y={p.y - NODE_H / 2}
                  width={NODE_W} height={NODE_H}
                  style={{ pointerEvents: 'none', overflow: 'visible' }}>
                  <div
                    className="relative w-full h-full rounded-xl border px-3 py-1.5 flex flex-col justify-center backdrop-blur-md transition-all duration-300"
                    style={{
                      fontFamily: 'inherit',
                      backgroundColor: bg,
                      borderColor: isMatch && searchActive ? color : border,
                      borderWidth: isMatch && searchActive ? 2 : 1,
                      filter: active ? 'url(#glow)' : 'none',
                      transform: active ? 'scale(1.02)' : 'scale(1)',
                      boxShadow: isPodGroup ? `2px 2px 0 1px ${border}, 4px 4px 0 1px ${border}` : undefined,
                    }}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {n.kind === 'policy'
                        ? <Shield className="w-3 h-3 shrink-0" style={{ color }} />
                        : <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      }
                      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: color + 'bb' }}>
                        {n.kind === 'policy' ? 'NetPol'
                          : n.kind === 'workload' ? workloadBadgeLabel(n.workloadKind)
                          : n.kind}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-slate-900 dark:text-white truncate leading-tight" title={n.name}>
                      {n.name}
                    </span>
                    {!groupByNs && (
                      <span className="text-[9px] text-slate-400 truncate mt-0.5">{n.namespace}</span>
                    )}
                    {isPodGroup && (
                      <div
                        className="absolute -top-1.5 -right-1.5 flex items-center justify-center
                                    w-5 h-5 rounded-full text-[9px] font-black border-2
                                    bg-white dark:bg-slate-900 border-current shadow-sm select-none"
                        style={{ color }}
                      >
                        ×{n.replicaCount}
                      </div>
                    )}
                  </div>
                </foreignObject>
                <rect data-node="true"
                  x={p.x - NODE_W / 2} y={p.y - NODE_H / 2}
                  width={NODE_W} height={NODE_H} fill="transparent" rx={10} />
              </g>
            )
          })}
        </g>
      </svg>
      {tooltip && <NodeTooltip node={tooltip.node} x={tooltip.x} y={tooltip.y} dark={dark} onCollapseWorkload={onCollapseWorkload} />}
    </div>
  )
}

// ─── Map View (force-directed, async rAF simulation) ─────────────────────────

const NODE_R = 26

function MapView({ graph, groupByNs, animate, fitTrigger, dark, searchQuery, onNodeClick, onCollapseWorkload }: {
  graph: Graph; groupByNs: boolean; animate: boolean; fitTrigger: number; dark: boolean
  searchQuery: string; onNodeClick: (node: GraphNode) => void
  onCollapseWorkload: (workloadId: string) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [dragOverrides, setDragOverrides] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [tooltip, setTooltip] = useState<{ node: GraphNode; x: number; y: number } | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  // Async simulation state
  const [simPos, setSimPos] = useState<Map<string, NodePos>>(new Map())

  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const dragRef = useRef<{ id: string; mx: number; my: number; nx: number; ny: number } | null>(null)

  // Run simulation asynchronously with rAF — shows ring layout immediately, animates into place
  useEffect(() => {
    if (!graph.nodes.length) { setSimPos(new Map()); return }
    const { positions, step } = createSimulator(graph, groupByNs)
    setSimPos(new Map(positions))   // Show ring layout immediately
    setDragOverrides(new Map())

    let cancelled = false
    let iter = 0
    const TOTAL = 250
    const BATCH = 8 // iters per frame

    function tick() {
      if (cancelled) return
      for (let b = 0; b < BATCH && iter < TOTAL; b++, iter++) step(iter, TOTAL)
      setSimPos(new Map(positions)) // new Map triggers React re-render
      if (iter < TOTAL) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return () => { cancelled = true }
  }, [graph, groupByNs])

  // Merge drag overrides on top of simulation positions
  const nodePos = useMemo(() => {
    if (!dragOverrides.size) return simPos
    const merged = new Map(simPos)
    for (const [id, { x, y }] of dragOverrides) {
      const orig = merged.get(id)
      if (orig) merged.set(id, { ...orig, x, y })
    }
    return merged
  }, [simPos, dragOverrides])

  // Search: matched node IDs
  const matchedIds = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    return new Set(graph.nodes.filter(n => n.name.toLowerCase().includes(q)).map(n => n.id))
  }, [searchQuery, graph.nodes])

  // Connected edge IDs for hover highlighting
  const connectedEdgeIds = useMemo(() => {
    if (!hoveredNodeId) return null
    return new Set(graph.edges.filter(e => e.source === hoveredNodeId || e.target === hoveredNodeId).map(e => e.id))
  }, [hoveredNodeId, graph.edges])

  // Pre-compute edge offsets for fan-out (parallel edges between same node pair)
  const edgeOffsets = useMemo(() => {
    const counts = new Map<string, number>()
    const indices = new Map<string, number>()
    for (const edge of graph.edges) {
      const key = [edge.source, edge.target].sort().join('~')
      indices.set(edge.id, counts.get(key) ?? 0)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const offsets = new Map<string, number>()
    for (const edge of graph.edges) {
      const key = [edge.source, edge.target].sort().join('~')
      const idx = indices.get(edge.id) ?? 0
      const total = counts.get(key) ?? 1
      offsets.set(edge.id, (idx - (total - 1) / 2) * 24)
    }
    return offsets
  }, [graph.edges])

  const fitToScreen = useCallback(() => {
    if (!svgRef.current || !nodePos.size) return
    const { width: svgW, height: svgH } = svgRef.current.getBoundingClientRect()
    if (svgW === 0 || svgH === 0) { requestAnimationFrame(fitToScreen); return }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of nodePos.values()) {
      minX = Math.min(minX, p.x - NODE_R); maxX = Math.max(maxX, p.x + NODE_R)
      minY = Math.min(minY, p.y - NODE_R); maxY = Math.max(maxY, p.y + NODE_R)
    }
    const PAD = 64
    const newScale = Math.min(svgW / (maxX - minX + PAD * 2), svgH / (maxY - minY + PAD * 2), 2)
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    setPan({ x: svgW / 2 - cx * newScale, y: svgH / 2 - cy * newScale })
    setScale(newScale)
  }, [nodePos])

  useEffect(() => { requestAnimationFrame(fitToScreen) }, [graph, groupByNs])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (fitTrigger > 0) fitToScreen() }, [fitTrigger, fitToScreen])

  // Auto-pan to search matches
  useEffect(() => {
    if (!matchedIds || matchedIds.size === 0 || !svgRef.current) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const id of matchedIds) {
      const p = nodePos.get(id)
      if (!p) continue
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    if (minX === Infinity) return
    const { width: svgW, height: svgH } = svgRef.current.getBoundingClientRect()
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    setPan({ x: svgW / 2 - cx * scale, y: svgH / 2 - cy * scale })
  }, [matchedIds])  // eslint-disable-line react-hooks/exhaustive-deps

  // Namespace bounding boxes
  const nsBounds = useMemo(() => {
    if (!groupByNs) return new Map<string, { x: number; y: number; w: number; h: number; nsIdx: number }>()
    const PAD = 50
    const raw = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>()
    for (const n of graph.nodes) {
      const p = nodePos.get(n.id)
      if (!p) continue
      const b = raw.get(n.namespace)
      if (!b) raw.set(n.namespace, { minX: p.x, maxX: p.x, minY: p.y, maxY: p.y })
      else { b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x); b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y) }
    }
    const result = new Map<string, { x: number; y: number; w: number; h: number; nsIdx: number }>()
    for (const [ns, b] of raw) {
      const idx = graph.namespaces.indexOf(ns)
      result.set(ns, { 
        x: b.minX - PAD, 
        y: b.minY - PAD, 
        w: b.maxX - b.minX + PAD * 2, 
        h: b.maxY - b.minY + PAD * 2, 
        nsIdx: idx === -1 ? 0 : idx 
      })
    }
    return result
  }, [nodePos, groupByNs, graph.nodes, graph.namespaces])

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const rect = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const ns = Math.max(0.05, Math.min(4, scale * factor))
    setPan(p => ({ x: mx - (mx - p.x) * (ns / scale), y: my - (my - p.y) * (ns / scale) }))
    setScale(ns)
  }

  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const nodeEl = (e.target as Element).closest('[data-nid]')
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-nid')!
      const p = nodePos.get(id)
      if (p) dragRef.current = { id, mx: e.clientX, my: e.clientY, nx: p.x, ny: p.y }
      return
    }
    panRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
  }

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      const { id, mx, my, nx, ny } = dragRef.current
      const dx = (e.clientX - mx) / scale, dy = (e.clientY - my) / scale
      setDragOverrides(prev => { const next = new Map(prev); next.set(id, { x: nx + dx, y: ny + dy }); return next })
      return
    }
    if (panRef.current)
      setPan({ x: panRef.current.px + e.clientX - panRef.current.sx, y: panRef.current.py + e.clientY - panRef.current.sy })
  }

  const onMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    // Click = no drag movement
    if (dragRef.current) {
      const movedX = Math.abs(e.clientX - dragRef.current.mx)
      const movedY = Math.abs(e.clientY - dragRef.current.my)
      if (movedX < 4 && movedY < 4) {
        // treat as click: find node and navigate
        const id = dragRef.current.id
        const node = graph.nodes.find(n => n.id === id)
        if (node) onNodeClick(node)
      }
    }
    dragRef.current = null
    panRef.current = null
  }
  const onMouseLeave = () => { dragRef.current = null; panRef.current = null; setTooltip(null); setHoveredNodeId(null) }

  const searchActive = !!matchedIds

  return (
    <div className="relative w-full h-full">
      <svg ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing select-none"
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
      >
        <GraphDefs />
        <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
          {/* Namespace bounding boxes */}
          {groupByNs && Array.from(nsBounds.entries()).map(([ns, b]) => {
            const c = nsColor(b.nsIdx)
            return (
              <g key={ns}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h}
                  fill={c.bg} stroke={c.border} strokeWidth={1} strokeDasharray="8 6" rx={24} 
                  className="transition-all duration-500" />
                <text x={b.x + 14} y={b.y + 24}
                  fontSize={12} fontWeight={800} fill={c.text} fillOpacity={0.6}
                  style={{ userSelect: 'none', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {ns}
                </text>
              </g>
            )
          })}

          {/* Edges — quadratic Bézier with perpendicular fan-out for parallel edges */}
          {graph.edges.map(edge => {
            const s = nodePos.get(edge.source), t = nodePos.get(edge.target)
            if (!s || !t) return null
            const { color, dur, class: edgeClass } = edgeStyle(edge.kind)
            const isInfra = edgeClass === 'infra'
            const offset = edgeOffsets.get(edge.id) ?? 0
            const dx = t.x - s.x, dy = t.y - s.y
            const len = Math.sqrt(dx * dx + dy * dy) || 1
            const px = -dy / len * offset, py = dx / len * offset
            const cx = (s.x + t.x) / 2 + px, cy = (s.y + t.y) / 2 + py
            // Label midpoint at t=0.5 for quadratic bezier
            const lx = 0.25 * s.x + 0.5 * cx + 0.25 * t.x
            const ly = 0.25 * s.y + 0.5 * cy + 0.25 * t.y
            const path = `M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`
            const isConnected = connectedEdgeIds ? connectedEdgeIds.has(edge.id) : true
            const edgeOpacity = connectedEdgeIds
              ? (isConnected ? (isInfra ? 0.5 : 0.9) : 0.04)
              : (animate ? (isInfra ? 0.15 : 0.2) : (isInfra ? 0.25 : 0.45))
            return (
              <g key={edge.id} style={{ transition: 'opacity 0.2s' }}>
                <path d={path} fill="none" stroke={color}
                  strokeWidth={isConnected && connectedEdgeIds ? 2.5 : 1.5}
                  strokeOpacity={edgeOpacity}
                  strokeDasharray={isInfra ? '5 6' : undefined}
                  markerEnd={`url(#arr-${color.slice(1)})`} />
                {animate && isConnected && !isInfra && (
                  <path d={path} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.85} strokeDasharray="7 9">
                    {/* @ts-ignore */}
                    <animate attributeName="stroke-dashoffset" from="16" to="0" dur={dur} repeatCount="indefinite" />
                  </path>
                )}
                {animate && isConnected && !isInfra && (
                  <circle r="2" fill={color} filter="url(#glow)">
                    {/* @ts-ignore */}
                    <animateMotion dur={dur} repeatCount="indefinite" path={path} />
                  </circle>
                )}
                {edge.label && <EdgeLabel x={lx} y={ly - 8} label={edge.label} color={color} />}
              </g>
            )
          })}

          {/* Nodes */}
          {graph.nodes.map(n => {
            const p = nodePos.get(n.id)
            if (!p) return null
            const color = nodeColor(n)
            const bg = nodeBg(n, dark)
            const active = tooltip?.node.id === n.id
            const isMatch = matchedIds ? matchedIds.has(n.id) : true
            const nodeOpacity = searchActive && !isMatch ? 0.12 : 1
            const label = n.name.length > 14 ? n.name.slice(0, 12) + '..' : n.name
            const kindIcon = n.kind === 'ingress' ? '⬡'
              : n.kind === 'service' ? '◈'
              : n.kind === 'policy' ? '🛡'
              : n.kind === 'workload' ? workloadIcon(n.workloadKind)
              : '●'
            const strokeW = active ? 2.5 : isMatch && searchActive ? 3 : 1.8
            const isPodGroup = n.replicaCount !== undefined
            return (
              <g key={n.id} data-nid={n.id} style={{ cursor: 'pointer', opacity: nodeOpacity, transition: 'opacity 0.2s' }}
                onMouseEnter={e => { setTooltip({ node: n, x: e.clientX, y: e.clientY }); setHoveredNodeId(n.id) }}
                onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                onMouseLeave={() => { setTooltip(null); setHoveredNodeId(null) }}
              >
                {isPodGroup && (
                  <>
                    <circle cx={p.x + 3} cy={p.y + 3} r={NODE_R} fill={bg} stroke={color} strokeWidth={1} strokeOpacity={0.3} />
                    <circle cx={p.x + 6} cy={p.y + 6} r={NODE_R} fill={bg} stroke={color} strokeWidth={1} strokeOpacity={0.15} />
                  </>
                )}
                <circle cx={p.x} cy={p.y} r={NODE_R + 4} fill={color} fillOpacity={isMatch && searchActive ? 0.18 : 0.08} />
                <circle cx={p.x} cy={p.y} r={NODE_R}
                  fill={bg} stroke={color} strokeWidth={strokeW}
                  style={{ filter: active ? 'url(#glow)' : 'none' }}
                  className="transition-all duration-300"
                />
                <text x={p.x} y={p.y - 4} textAnchor="middle" fontSize={11}
                  fill={color} fillOpacity={0.7} style={{ userSelect: 'none' }}>
                  {kindIcon}
                </text>
                <text x={p.x} y={p.y + 8} textAnchor="middle" fontSize={9} fontWeight={600}
                  fill={color} style={{ userSelect: 'none' }}>
                  {label}
                </text>
                {isPodGroup && (
                  <text x={p.x + NODE_R - 2} y={p.y - NODE_R + 8}
                    textAnchor="middle" fontSize={8} fontWeight={900}
                    fill={color}
                    stroke="rgba(15,23,42,0.8)" strokeWidth={2.5} paintOrder="stroke"
                    style={{ userSelect: 'none' }}>
                    ×{n.replicaCount}
                  </text>
                )}
                {!groupByNs && (
                  <text x={p.x} y={p.y + NODE_R + 14} textAnchor="middle" fontSize={8}
                    fill="#64748b" style={{ userSelect: 'none' }}>
                    {n.namespace.length > 14 ? n.namespace.slice(0, 13) + '…' : n.namespace}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
      {tooltip && <NodeTooltip node={tooltip.node} x={tooltip.x} y={tooltip.y} dark={dark} onCollapseWorkload={onCollapseWorkload} />}
    </div>
  )
}

// ─── Main NetworkPanel ────────────────────────────────────────────────────────

const KIND_TO_SECTION: Record<NodeKind, ResourceKind> = {
  ingress: 'ingresses',
  service: 'services',
  pod: 'pods',
  policy: 'networkpolicies',
  workload: 'deployments',   // fallback only
  pvc: 'pvcs',
  node: 'nodes',
}

const WORKLOAD_KIND_TO_SECTION: Record<string, ResourceKind> = {
  Deployment: 'deployments',
  ReplicaSet: 'replicasets',
  DaemonSet: 'daemonsets',
  StatefulSet: 'statefulsets',
  Job: 'jobs',
  CronJob: 'cronjobs',
}

export default function NetworkPanel(): JSX.Element {
  const { selectedContext, loadingNamespaces, namespaces, theme, setSection } = useAppStore()
  const dark = theme === 'dark'

  const [panelNs, setPanelNs] = useState<string>('default')
  const [loading, setLoading] = useState(false)
  const [rawGraph, setRawGraph] = useState<Graph>({ nodes: [], edges: [], namespaces: [] })

  const [tab, setTab] = useState<'topology' | 'map'>('topology')
  const [groupByNs, setGroupByNs] = useState(false)
  const [animate, setAnimate] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [fitTrigger, setFitTrigger] = useState(0)
  const [visibleKinds, setVisibleKinds] = useState<Set<NodeKind>>(new Set(['ingress', 'service', 'pod', 'workload', 'pvc', 'node', 'policy']))
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedWorkloads, setExpandedWorkloads] = useState<Set<string>>(new Set())

  const load = useCallback((ns: string) => {
    if (!selectedContext || loadingNamespaces) return
    setLoading(true)
    const nsArg = ns === '_all' ? '' : ns
    // @ts-ignore
    window.kubectl.getTopology(nsArg)
      .then((data: Graph) => {
        setRawGraph(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load topology:', err)
        setLoading(false)
      })
  }, [selectedContext, loadingNamespaces])

  useEffect(() => { load(panelNs) }, [panelNs, load])

  const graph = useMemo(() => {
    // Step 1: collapse pod replicas
    const collapsed = collapsePodReplicas(rawGraph, expandedWorkloads)
    // Step 2: filter by visible kinds
    if (visibleKinds.size === KIND_DEFS.length) return collapsed
    const nodes = collapsed.nodes.filter(n => visibleKinds.has(n.kind))
    const nodeIds = new Set(nodes.map(n => n.id))
    const edges = collapsed.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    const nss = [...new Set(nodes.map(n => n.namespace))].sort()
    return { nodes, edges, namespaces: nss }
  }, [rawGraph, visibleKinds, expandedWorkloads])

  // O(n) single-pass count map so KindPill badges don't each scan rawGraph.nodes
  const kindCounts = useMemo(() =>
    rawGraph.nodes.reduce((acc, n) => {
      acc[n.kind] = (acc[n.kind] ?? 0) + 1
      return acc
    }, {} as Record<NodeKind, number>),
    [rawGraph.nodes]
  )

  const toggleKind = (kind: NodeKind) => {
    setVisibleKinds(prev => {
      const next = new Set(prev)
      if (next.has(kind) && next.size > 1) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  const handleNodeClick = useCallback((node: GraphNode) => {
    // Pod group node: expand replicas on click
    if (node.replicaCount !== undefined) {
      const workloadId = node.id.replace(/^podgroup:/, '')
      setExpandedWorkloads(prev => { const next = new Set(prev); next.add(workloadId); return next })
      return
    }
    // Workload node: navigate to correct section
    if (node.kind === 'workload' && node.workloadKind) {
      setSection(WORKLOAD_KIND_TO_SECTION[node.workloadKind] ?? 'deployments')
      return
    }
    setSection(KIND_TO_SECTION[node.kind])
  }, [setSection])

  const handleCollapseWorkload = useCallback((workloadId: string) => {
    setExpandedWorkloads(prev => { const next = new Set(prev); next.delete(workloadId); return next })
  }, [])

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 bg-white dark:bg-[hsl(var(--bg-dark))] transition-colors duration-200">
      <PageHeader
        title="Network Map"
        subtitle={<span className="text-slate-400 dark:text-slate-500">Visualizing real-time traffic, security policies, and resource dependencies</span>}
      >
        <div className="flex items-center gap-2">
          {/* Namespace dropdown */}
          <div className="relative">
            <select value={panelNs} onChange={e => setPanelNs(e.target.value)} disabled={loading}
              className="appearance-none pl-3 pr-7 py-1.5 text-xs font-semibold rounded-lg border
                         bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700
                         text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2
                         focus:ring-blue-500/40 cursor-pointer disabled:opacity-50 transition-colors">
              {!selectedContext && <option value="" disabled>Select cluster first</option>}
              {selectedContext && namespaces.length === 0 && !loading && <option value="" disabled>No namespaces</option>}
              <option value="_all">All Namespaces</option>
              {namespaces.map(ns => (
                <option key={ns.metadata.name} value={ns.metadata.name}>{ns.metadata.name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2.5 4l2.5 2.5L7.5 4H2.5z" /></svg>
            </div>
          </div>

          {/* Fit to screen */}
          <button onClick={() => setFitTrigger(t => t + 1)} disabled={loading || graph.nodes.length === 0}
            title="Fit to screen"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg
                       bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700
                       text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-40 leading-none h-[30px]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
            Fit
          </button>

          {/* Refresh */}
          <button onClick={() => load(panelNs)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg
                       bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700
                       text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50 leading-none h-[30px]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              className={loading ? 'animate-spin' : ''}>
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            Refresh
          </button>
        </div>

      </PageHeader>

      {/* Tab bar + controls */}
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-white/5 pl-8 pr-6 shrink-0 flex-wrap bg-white/5 backdrop-blur-md">
        {/* Tabs */}
        <div className="flex shrink-0">
          {(['topology', 'map'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors
                ${tab === t ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              {t === 'topology' ? 'Topology' : 'Map'}
            </button>
          ))}
        </div>

        {/* Kind filter pills */}
        <div className="flex items-center gap-1.5 pl-3 border-l border-slate-200 dark:border-slate-700 py-2">
          {KIND_DEFS.map(({ kind, color, label }) => (
            <KindPill key={kind} color={color} label={label}
              count={kindCounts[kind] ?? 0}
              active={visibleKinds.has(kind)}
              onToggle={() => toggleKind(kind)}
            />
          ))}
        </div>

        {/* Search input */}
        <div className="relative ml-2 py-2">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Find node…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-7 pr-3 py-1 text-[11px] font-mono rounded-lg border
                       bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700
                       text-slate-700 dark:text-slate-200 placeholder-slate-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-36 transition-all
                       focus:w-48"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* View toggles */}
        <div className="flex items-center gap-2 ml-auto py-2">
          <TogglePill on={groupByNs} onToggle={() => setGroupByNs(v => !v)} label="Group by NS"
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
          />
          <TogglePill on={animate} onToggle={() => setAnimate(v => !v)} label="Animate Flow"
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M12 5l7 7-7 7" /></svg>}
          />
          <TogglePill on={showLegend} onToggle={() => setShowLegend(v => !v)} label="Legend"
            icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>}
          />
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 relative">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <div className="w-6 h-6 border-2 border-slate-200 dark:border-slate-800 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading network data…</span>
          </div>
        ) : graph.nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M12 5a2 2 0 100-4 2 2 0 000 4zm-7 7a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4zm-7 7a2 2 0 100-4 2 2 0 000 4zM5 12H2m10-7V2m7 10h3M12 17v3M7.05 7.05L5 5m9.95 2.05L17 5M7.05 16.95L5 19m9.95-2.05L17 19" />
            </svg>
            <p className="text-sm font-medium">No network resources found</p>
            <p className="text-xs">
              {panelNs === '_all' ? 'No services, ingresses or pods in any namespace' : `No resources in namespace "${panelNs}"`}
            </p>
          </div>
        ) : tab === 'topology' ? (
          <TopologyView graph={graph} groupByNs={groupByNs} animate={animate} fitTrigger={fitTrigger} dark={dark}
            searchQuery={searchQuery} onNodeClick={handleNodeClick} onCollapseWorkload={handleCollapseWorkload} />
        ) : (
          <MapView graph={graph} groupByNs={groupByNs} animate={animate} fitTrigger={fitTrigger} dark={dark}
            searchQuery={searchQuery} onNodeClick={handleNodeClick} onCollapseWorkload={handleCollapseWorkload} />
        )}

        {/* Legend overlay */}
        {showLegend && !loading && <Legend dark={dark} />}
      </div>
    </div>
  )
}
