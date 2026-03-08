import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store'
import type { KubeIngress, KubePod, KubeService } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeKind = 'ingress' | 'service' | 'pod'
type EdgeKind = 'ing-svc' | 'svc-pod'

interface GraphNode {
  id: string
  kind: NodeKind
  name: string
  namespace: string
  phase?: string
  serviceType?: string
  ports?: string[]
}

interface GraphEdge {
  id: string
  source: string
  target: string
  kind: EdgeKind
  label?: string          // port label, e.g. ":80"
}

interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  namespaces: string[]
}

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

function nsColor(nsIdx: number) { return NS_PALETTE[nsIdx % NS_PALETTE.length] }

// ─── Node colours ─────────────────────────────────────────────────────────────

function nodeColor(n: GraphNode): string {
  if (n.kind === 'ingress') return '#a78bfa' // lighter violet
  if (n.kind === 'service') {
    if (n.serviceType === 'LoadBalancer') return '#22d3ee' // cyan
    if (n.serviceType === 'NodePort') return '#2dd4bf' // teal
    return '#60a5fa' // blue
  }
  if (n.phase === 'Running') return '#34d399' // emerald
  if (n.phase === 'Pending') return '#fbbf24' // amber
  if (n.phase === 'Failed') return '#f87171' // red
  return '#94a3b8' // slate
}

function nodeBg(n: GraphNode, dark: boolean): string {
  const c = nodeColor(n)
  return dark ? `${c}15` : `${c}10`
}

function nodeBorder(n: GraphNode, dark: boolean): string {
  const c = nodeColor(n)
  return dark ? `${c}35` : `${c}25`
}

// ─── Graph builder ────────────────────────────────────────────────────────────

function buildGraph(services: KubeService[], ingresses: KubeIngress[], pods: KubePod[]): Graph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const edgeSet = new Set<string>()

  const addEdge = (src: string, tgt: string, kind: EdgeKind, label?: string) => {
    const id = `${src}--${tgt}`
    if (!edgeSet.has(id)) { edgeSet.add(id); edges.push({ id, source: src, target: tgt, kind, label }) }
  }

  for (const ing of ingresses)
    nodes.push({ id: `ing:${ing.metadata.namespace}:${ing.metadata.name}`, kind: 'ingress', name: ing.metadata.name, namespace: ing.metadata.namespace ?? '' })

  for (const svc of services)
    nodes.push({ id: `svc:${svc.metadata.namespace}:${svc.metadata.name}`, kind: 'service', name: svc.metadata.name, namespace: svc.metadata.namespace ?? '', serviceType: svc.spec.type, ports: svc.spec.ports?.map(p => `${p.port}/${p.protocol ?? 'TCP'}`) })

  const cappedPods = pods.slice(0, 100)
  for (const pod of cappedPods)
    nodes.push({ id: `pod:${pod.metadata.uid}`, kind: 'pod', name: pod.metadata.name, namespace: pod.metadata.namespace ?? '', phase: pod.status.phase })

  const svcSet = new Set(services.map(s => `svc:${s.metadata.namespace}:${s.metadata.name}`))
  const podsByNs = new Map<string, KubePod[]>()
  for (const pod of cappedPods) {
    const ns = pod.metadata.namespace ?? ''
    if (!podsByNs.has(ns)) podsByNs.set(ns, [])
    podsByNs.get(ns)!.push(pod)
  }

  for (const ing of ingresses) {
    const ingId = `ing:${ing.metadata.namespace}:${ing.metadata.name}`
    for (const rule of ing.spec.rules ?? [])
      for (const path of rule.http?.paths ?? []) {
        const svcName = path.backend.service?.name
        if (svcName) {
          const svcId = `svc:${ing.metadata.namespace}:${svcName}`
          if (svcSet.has(svcId)) {
            // Carry port as label (number preferred, name as fallback)
            const port = path.backend.service?.port?.number ?? path.backend.service?.port?.name
            addEdge(ingId, svcId, 'ing-svc', port != null ? `:${port}` : undefined)
          }
        }
      }
  }

  for (const svc of services) {
    if (!svc.spec.selector || !Object.keys(svc.spec.selector).length) continue
    const svcId = `svc:${svc.metadata.namespace}:${svc.metadata.name}`
    for (const pod of podsByNs.get(svc.metadata.namespace ?? '') ?? [])
      if (Object.entries(svc.spec.selector).every(([k, v]) => pod.metadata.labels?.[k] === v))
        addEdge(svcId, `pod:${pod.metadata.uid}`, 'svc-pod')
  }

  const namespaces = [...new Set(nodes.map(n => n.namespace))].sort()
  return { nodes, edges, namespaces }
}

// ─── Force simulation ─────────────────────────────────────────────────────────

const REPULSION = 12000
const ATTRACTION = 0.004
const GRAVITY = 0.0008
const DAMPING = 0.82
const NATURAL_LEN = 300
const NS_CLUSTER_STR = 0.015

function runForceSimulation(graph: Graph, groupByNs: boolean, iters = 250): Map<string, NodePos> {
  const { nodes, edges, namespaces } = graph
  const positions = new Map<string, NodePos>()
  if (!nodes.length) return positions

  const clusterCenters = new Map<string, { x: number; y: number }>()

  if (groupByNs && namespaces.length > 1) {
    const cr = Math.max(350, namespaces.length * 160)
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
      const lr = Math.max(60, Math.sqrt(nNodes.length) * 45)
      nNodes.forEach((n, i) => {
        const a = (i / nNodes.length) * Math.PI * 2
        positions.set(n.id, { x: c.x + Math.cos(a) * lr, y: c.y + Math.sin(a) * lr, vx: 0, vy: 0 })
      })
    }
  } else {
    const ir = Math.max(200, Math.sqrt(nodes.length) * 120)
    nodes.forEach((n, i) => {
      const a = (i / nodes.length) * Math.PI * 2
      positions.set(n.id, { x: Math.cos(a) * ir, y: Math.sin(a) * ir, vx: 0, vy: 0 })
    })
  }

  const ids = nodes.map(n => n.id)
  const nodeById = new Map(nodes.map(n => [n.id, n]))

  for (let iter = 0; iter < iters; iter++) {
    const alpha = 1 - iter / iters

    for (let i = 0; i < ids.length; i++) {
      const a = positions.get(ids[i])!
      for (let j = i + 1; j < ids.length; j++) {
        const b = positions.get(ids[j])!
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
        const f = (REPULSION / (dist * dist)) * alpha
        const fx = (dx / dist) * f, fy = (dy / dist) * f
        a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy
      }
    }

    for (const edge of edges) {
      const s = positions.get(edge.source), t = positions.get(edge.target)
      if (!s || !t) continue
      const dx = t.x - s.x, dy = t.y - s.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
      const f = (dist - NATURAL_LEN) * ATTRACTION * alpha
      const fx = (dx / dist) * f, fy = (dy / dist) * f
      s.vx += fx; s.vy += fy; t.vx -= fx; t.vy -= fy
    }

    for (const p of positions.values()) {
      p.vx -= p.x * GRAVITY * alpha
      p.vy -= p.y * GRAVITY * alpha
    }

    if (groupByNs && clusterCenters.size) {
      for (const id of ids) {
        const p = positions.get(id)!
        const c = clusterCenters.get(nodeById.get(id)!.namespace)
        if (!c) continue
        p.vx += (c.x - p.x) * NS_CLUSTER_STR * alpha
        p.vy += (c.y - p.y) * NS_CLUSTER_STR * alpha
      }
    }

    for (const p of positions.values()) {
      p.vx *= DAMPING; p.vy *= DAMPING
      p.x += p.vx; p.y += p.vy
    }
  }
  return positions
}

// ─── Topology layout ──────────────────────────────────────────────────────────

const NODE_W = 164
const NODE_H = 54
const H_GAP = 36

const ROW_Y: Record<NodeKind, number> = { ingress: 80, service: 280, pod: 480 }

const LANE_MIN_W = 180
const LANE_PAD_X = 20
const LANE_GAP = 28
const LANE_ROW_Y: Record<NodeKind, number> = { ingress: 68, service: 212, pod: 356 }
const LANE_HEADER = 36
const LANE_HEIGHT = LANE_ROW_Y.pod + NODE_H + 26

interface LaneDef { ns: string; nsIdx: number; x: number; y: number; w: number; h: number }

function computeTopoPositions(graph: Graph, groupByNs: boolean) {
  const positions = new Map<string, { x: number; y: number }>()
  const lanes: LaneDef[] = []

  if (!groupByNs) {
    const byKind: Record<NodeKind, GraphNode[]> = { ingress: [], service: [], pod: [] }
    for (const n of graph.nodes) byKind[n.kind].push(n)
    for (const kind of ['ingress', 'service', 'pod'] as NodeKind[]) {
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
  for (const ns of namespaces) byNsKind.set(ns, { ingress: [], service: [], pod: [] })
  for (const n of graph.nodes) {
    const bucket = byNsKind.get(n.namespace)
    if (bucket) bucket[n.kind].push(n)
  }

  const laneWidths = namespaces.map(ns => {
    const b = byNsKind.get(ns)!
    const mx = Math.max(b.ingress.length, b.service.length, b.pod.length, 1)
    return Math.max(LANE_MIN_W, mx * (NODE_W + H_GAP) - H_GAP + LANE_PAD_X * 2)
  })

  const totalW = laneWidths.reduce((s, w) => s + w, 0) + (namespaces.length - 1) * LANE_GAP
  let curX = -totalW / 2

  namespaces.forEach((ns, nsIdx) => {
    const lw = laneWidths[nsIdx]
    const laneCenter = curX + lw / 2
    const b = byNsKind.get(ns)!

    for (const kind of ['ingress', 'service', 'pod'] as NodeKind[]) {
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

// ─── Edge label (SVG text with stroke outline for readability) ────────────────

function EdgeLabel({ x, y, label, color }: { x: number; y: number; label: string; color: string }) {
  return (
    <text
      x={x} y={y}
      textAnchor="middle"
      fontSize={9} fontWeight={700}
      fill={color}
      stroke="rgba(15,23,42,0.75)"
      strokeWidth={3}
      paintOrder="stroke"
      style={{ userSelect: 'none' }}
    >
      {label}
    </text>
  )
}

// ─── Legend overlay ───────────────────────────────────────────────────────────

const LEGEND_ENTRIES = [
  { icon: '⬡', color: '#8b5cf6', label: 'Ingress' },
  { icon: '◈', color: '#3b82f6', label: 'Service · ClusterIP' },
  { icon: '◈', color: '#06b6d4', label: 'Service · LoadBalancer' },
  { icon: '◈', color: '#14b8a6', label: 'Service · NodePort' },
  { icon: '●', color: '#10b981', label: 'Pod · Running' },
  { icon: '●', color: '#f59e0b', label: 'Pod · Pending' },
  { icon: '●', color: '#ef4444', label: 'Pod · Failed' },
  { icon: '●', color: '#64748b', label: 'Pod · Other' },
]

function Legend({ dark }: { dark: boolean }) {
  return (
    <div className={`absolute bottom-6 left-6 z-10
                    bg-white/80 dark:bg-slate-900/80 backdrop-blur-md
                    border ${dark ? 'border-slate-800/60' : 'border-slate-200/60'}
                    rounded-2xl shadow-2xl px-4 py-4 min-w-[210px] transition-all duration-300`}>
      <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 mb-3.5">Legend</p>

      {/* Node kinds */}
      <div className="space-y-1.5 mb-3">
        {LEGEND_ENTRIES.map(e => (
          <div key={e.label} className="flex items-center gap-2.5">
            <span className="text-sm w-3.5 text-center leading-none" style={{ color: e.color }}>{e.icon}</span>
            <span className="text-[11px] text-slate-600 dark:text-slate-300 leading-tight">{e.label}</span>
          </div>
        ))}
      </div>

      {/* Edge types */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5 space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Edges</p>
        {([['#8b5cf6', 'Ingress → Service'], ['#3b82f6', 'Service → Pod']] as [string, string][]).map(([c, lbl]) => (
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

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function NodeTooltip({ node, x, y, dark }: { node: GraphNode; x: number; y: number; dark: boolean }) {
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
        <div><span className="text-slate-400 dark:text-slate-500">Kind</span> · <span className="text-slate-600 dark:text-slate-300 capitalize">{node.kind}</span></div>
        {node.namespace && <div><span className="text-slate-400 dark:text-slate-500">NS</span> · <span className="text-slate-600 dark:text-slate-300">{node.namespace}</span></div>}
        {node.phase && <div><span className="text-slate-400 dark:text-slate-500">Phase</span> · <span style={{ color }}>{node.phase}</span></div>}
        {node.serviceType && <div><span className="text-slate-400 dark:text-slate-500">Type</span> · <span className="text-slate-600 dark:text-slate-300">{node.serviceType}</span></div>}
        {node.ports && node.ports.length > 0 && (
          <div><span className="text-slate-400 dark:text-slate-500">Ports</span> · <span className="text-slate-600 dark:text-slate-300 font-mono">{node.ports.join(', ')}</span></div>
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

function KindPill({
  color, label, count, active, onToggle
}: { color: string; label: string; count: number; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={`${active ? 'Hide' : 'Show'} ${label}`}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold
                  transition-all duration-300 select-none
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

function TopologyView({ graph, groupByNs, animate, fitTrigger, dark }: {
  graph: Graph; groupByNs: boolean; animate: boolean; fitTrigger: number; dark: boolean
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const [tooltip, setTooltip] = useState<{ node: GraphNode; x: number; y: number } | null>(null)

  const { positions, lanes } = useMemo(() => computeTopoPositions(graph, groupByNs), [graph, groupByNs])

  // Compute tight bounding box and fit view
  const fitToScreen = useCallback(() => {
    if (!svgRef.current || !positions.size) return
    const { width: svgW, height: svgH } = svgRef.current.getBoundingClientRect()
    // SVG not yet laid out — retry after paint
    if (svgW === 0 || svgH === 0) { requestAnimationFrame(fitToScreen); return }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of positions.values()) {
      minX = Math.min(minX, p.x - NODE_W / 2)
      maxX = Math.max(maxX, p.x + NODE_W / 2)
      minY = Math.min(minY, p.y - NODE_H / 2)
      maxY = Math.max(maxY, p.y + NODE_H / 2)
    }
    // Also account for lane panels in grouped mode
    for (const lane of lanes) {
      minX = Math.min(minX, lane.x)
      maxX = Math.max(maxX, lane.x + lane.w)
      minY = Math.min(minY, lane.y)
      maxY = Math.max(maxY, lane.y + lane.h)
    }
    const PAD = 48
    const newScale = Math.min(svgW / (maxX - minX + PAD * 2), svgH / (maxY - minY + PAD * 2), 2)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setPan({ x: svgW / 2 - cx * newScale, y: svgH / 2 - cy * newScale })
    setScale(newScale)
  }, [positions, lanes])

  // Initial fit when graph or layout changes
  useEffect(() => { requestAnimationFrame(fitToScreen) }, [graph, groupByNs])  // eslint-disable-line react-hooks/exhaustive-deps
  // Fit triggered by toolbar button
  useEffect(() => { if (fitTrigger > 0) fitToScreen() }, [fitTrigger, fitToScreen])

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
  const onMouseLeave = () => { panRef.current = null; setTooltip(null) }

  // Row labels in flat mode
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

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing select-none"
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
      >
        <defs>
          <marker id="arrowT" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0 0L6 3L0 6z" fill="#475569" />
          </marker>
        </defs>
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
          {!groupByNs && (['ingress', 'service', 'pod'] as NodeKind[]).map(kind => {
            const lx = rowLabelX[kind]
            if (lx === undefined) return null
            return (
              <text key={kind}
                x={lx - NODE_W / 2 - 14} y={ROW_Y[kind] + NODE_H / 2 - 6}
                textAnchor="end" fontSize={9} fontWeight={700} letterSpacing={1.5}
                fill="#64748b" style={{ userSelect: 'none', textTransform: 'uppercase' }}>
                {kind === 'pod' ? 'Pods' : kind === 'service' ? 'Services' : 'Ingresses'}
              </text>
            )
          })}

          {/* Edges */}
          {graph.edges.map(edge => {
            const s = positions.get(edge.source), t = positions.get(edge.target)
            if (!s || !t) return null
            const sx = s.x, sy = s.y + NODE_H / 2
            const tx = t.x, ty = t.y - NODE_H / 2
            const dy = ty - sy
            const d = `M ${sx} ${sy} C ${sx} ${sy + dy / 2}, ${tx} ${ty - dy / 2}, ${tx} ${ty}`
            const color = edge.kind === 'ing-svc' ? '#8b5cf6' : '#3b82f6'
            const dur = edge.kind === 'ing-svc' ? '1.5s' : '2.5s'
            // Midpoint of this symmetric bezier is simply the average of endpoints
            const mx = (sx + tx) / 2
            const my = (sy + ty) / 2
            return (
              <g key={edge.id}>
                <path d={d} fill="none" stroke={color} strokeWidth={1.5}
                  strokeOpacity={animate ? 0.25 : 0.5} markerEnd="url(#arrowT)" />
                {animate && (
                  <path d={d} fill="none" stroke={color} strokeWidth={2}
                    strokeOpacity={0.85} strokeDasharray="7 9">
                    {/* @ts-ignore */}
                    <animate attributeName="stroke-dashoffset" from="16" to="0" dur={dur} repeatCount="indefinite" />
                  </path>
                )}
                {/* Port label at bezier midpoint */}
                {edge.label && <EdgeLabel x={mx} y={my - 6} label={edge.label} color={color} />}
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
            return (
              <g key={n.id}
                onMouseEnter={e => setTooltip({ node: n, x: e.clientX, y: e.clientY })}
                onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                onMouseLeave={() => setTooltip(null)}
              >
                <foreignObject
                  x={p.x - NODE_W / 2} y={p.y - NODE_H / 2}
                  width={NODE_W} height={NODE_H}
                  style={{ pointerEvents: 'none' }}>
                  <div
                    className={`w-full h-full rounded-xl border px-3 py-1.5 flex flex-col justify-center backdrop-blur-md transition-all duration-300`}
                    style={{
                      fontFamily: 'inherit',
                      backgroundColor: bg,
                      borderColor: border,
                      filter: active ? 'url(#glow)' : 'none',
                      transform: active ? 'scale(1.02)' : 'scale(1)'
                    }}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: color + 'bb' }}>
                        {n.kind}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-slate-900 dark:text-white truncate leading-tight" title={n.name}>
                      {n.name}
                    </span>
                    {!groupByNs && (
                      <span className="text-[9px] text-slate-400 truncate mt-0.5">{n.namespace}</span>
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
      {tooltip && <NodeTooltip node={tooltip.node} x={tooltip.x} y={tooltip.y} dark={dark} />}
    </div>
  )
}

// ─── Map View (force-directed) ────────────────────────────────────────────────

const NODE_R = 26

function MapView({ graph, groupByNs, animate, fitTrigger, dark }: {
  graph: Graph; groupByNs: boolean; animate: boolean; fitTrigger: number; dark: boolean
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  // Drag overrides: only the dragged node's position is kept in state
  const [dragOverrides, setDragOverrides] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [tooltip, setTooltip] = useState<{ node: GraphNode; x: number; y: number } | null>(null)

  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const dragRef = useRef<{ id: string; mx: number; my: number; nx: number; ny: number } | null>(null)

  // Simulation runs synchronously in useMemo — same render cycle as the graph,
  // so fitToScreen always has fresh positions (mirrors how TopologyView works).
  const simPos = useMemo(() => runForceSimulation(graph, groupByNs), [graph, groupByNs])

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

  // Clear drag overrides when the graph / grouping changes
  useEffect(() => { setDragOverrides(new Map()) }, [graph, groupByNs])

  const fitToScreen = useCallback(() => {
    if (!svgRef.current || !nodePos.size) return
    const { width: svgW, height: svgH } = svgRef.current.getBoundingClientRect()
    // SVG not yet laid out — retry after paint
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

  // Fit whenever graph / grouping changes (simPos is already updated in same render)
  useEffect(() => { requestAnimationFrame(fitToScreen) }, [graph, groupByNs])  // eslint-disable-line react-hooks/exhaustive-deps
  // Fit triggered by toolbar button
  useEffect(() => { if (fitTrigger > 0) fitToScreen() }, [fitTrigger, fitToScreen])

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
    for (const [ns, b] of raw)
      result.set(ns, { x: b.minX - PAD, y: b.minY - PAD, w: b.maxX - b.minX + PAD * 2, h: b.maxY - b.minY + PAD * 2, nsIdx: graph.namespaces.indexOf(ns) })
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
      setDragOverrides(prev => {
        const next = new Map(prev)
        next.set(id, { x: nx + dx, y: ny + dy })
        return next
      })
      return
    }
    if (panRef.current)
      setPan({ x: panRef.current.px + e.clientX - panRef.current.sx, y: panRef.current.py + e.clientY - panRef.current.sy })
  }

  const onMouseUp = () => { dragRef.current = null; panRef.current = null }
  const onMouseLeave = () => { dragRef.current = null; panRef.current = null; setTooltip(null) }

  return (
    <div className="relative w-full h-full">
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing select-none"
        onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
      >
        <defs>
          <marker id="arrowM" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0 0L6 3L0 6z" fill="#475569" />
          </marker>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
          {/* Namespace bounding boxes */}
          {groupByNs && Array.from(nsBounds.entries()).map(([ns, b]) => {
            const c = nsColor(b.nsIdx)
            return (
              <g key={ns}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h}
                  fill={c.bg} stroke={c.border} strokeWidth={1} strokeDasharray="6 4" rx={14} />
                <text x={b.x + 10} y={b.y + 20}
                  fontSize={11} fontWeight={700} fill={c.text} style={{ userSelect: 'none' }}>
                  {ns}
                </text>
              </g>
            )
          })}

          {/* Edges */}
          {graph.edges.map(edge => {
            const s = nodePos.get(edge.source), t = nodePos.get(edge.target)
            if (!s || !t) return null
            const color = edge.kind === 'ing-svc' ? '#8b5cf6' : '#3b82f6'
            const dur = edge.kind === 'ing-svc' ? '1.5s' : '2.5s'
            const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2
            return (
              <g key={edge.id}>
                <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke={color} strokeWidth={1.5}
                  strokeOpacity={animate ? 0.2 : 0.45} markerEnd="url(#arrowM)" />
                {animate && (
                  <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                    stroke={color} strokeWidth={2} strokeOpacity={0.85} strokeDasharray="7 9">
                    {/* @ts-ignore */}
                    <animate attributeName="stroke-dashoffset" from="16" to="0" dur={dur} repeatCount="indefinite" />
                  </line>
                )}
                {/* Port label at line midpoint */}
                {edge.label && <EdgeLabel x={mx} y={my - 8} label={edge.label} color={color} />}
              </g>
            )
          })}

          {/* Nodes */}
          {graph.nodes.map(n => {
            const p = nodePos.get(n.id)
            if (!p) return null
            const color = nodeColor(n)
            const bg = nodeBg(n, dark)
            const border = nodeBorder(n, dark)
            const active = tooltip?.node.id === n.id
            const label = n.name.length > 12 ? n.name.slice(0, 11) + '…' : n.name
            const kindIcon = n.kind === 'ingress' ? '⬡' : n.kind === 'service' ? '◈' : '●'
            const r = NODE_R
            return (
              <g key={n.id} data-nid={n.id} style={{ cursor: 'grab' }}
                onMouseEnter={e => setTooltip({ node: n, x: e.clientX, y: e.clientY })}
                onMouseMove={e => setTooltip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                onMouseLeave={() => setTooltip(null)}
              >
                <circle cx={p.x} cy={p.y} r={NODE_R + 4} fill={color} fillOpacity={0.08} />
                <circle
                  cx={p.x} cy={p.y} r={r}
                  fill={bg}
                  stroke={color}
                  strokeWidth={active ? 2.5 : 1.8}
                  style={{
                    filter: active ? 'url(#glow)' : 'none',
                    borderColor: border // satisfy linter
                  }}
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
      {tooltip && <NodeTooltip node={tooltip.node} x={tooltip.x} y={tooltip.y} dark={dark} />}
    </div>
  )
}

// ─── Main NetworkPanel ────────────────────────────────────────────────────────

const KIND_DEFS: { kind: NodeKind; color: string; label: string }[] = [
  { kind: 'ingress', color: '#8b5cf6', label: 'Ingress' },
  { kind: 'service', color: '#3b82f6', label: 'Services' },
  { kind: 'pod', color: '#10b981', label: 'Pods' },
]

export default function NetworkPanel(): JSX.Element {
  const { selectedContext, namespaces, theme } = useAppStore()
  const dark = theme === 'dark'

  // Panel-local namespace selector
  const [panelNs, setPanelNs] = useState<string>('_all')
  const [loading, setLoading] = useState(false)
  const [svcs, setSvcs] = useState<KubeService[]>([])
  const [ings, setIngs] = useState<KubeIngress[]>([])
  const [pds, setPds] = useState<KubePod[]>([])

  // View controls
  const [tab, setTab] = useState<'topology' | 'map'>('topology')
  const [groupByNs, setGroupByNs] = useState(false)
  const [animate, setAnimate] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [fitTrigger, setFitTrigger] = useState(0)
  const [visibleKinds, setVisibleKinds] = useState<Set<NodeKind>>(new Set(['ingress', 'service', 'pod']))

  const load = useCallback((ns: string) => {
    if (!selectedContext) return
    setLoading(true)
    const nsArg = ns === '_all' ? null : ns
    Promise.all([
      window.kubectl.getServices(selectedContext, nsArg),
      window.kubectl.getIngresses(selectedContext, nsArg),
      window.kubectl.getPods(selectedContext, nsArg),
    ]).then(([s, i, p]) => {
      setSvcs(s as KubeService[])
      setIngs(i as KubeIngress[])
      setPds(p as KubePod[])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [selectedContext])

  useEffect(() => { load(panelNs) }, [panelNs, load])

  // Raw graph (all kinds) — used for kind pill counts
  const rawGraph = useMemo(() => buildGraph(svcs, ings, pds), [svcs, ings, pds])

  // Filtered graph (respects visibleKinds)
  const graph = useMemo(() => {
    if (visibleKinds.size === 3) return rawGraph
    const nodes = rawGraph.nodes.filter(n => visibleKinds.has(n.kind))
    const nodeIds = new Set(nodes.map(n => n.id))
    const edges = rawGraph.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    const nss = [...new Set(nodes.map(n => n.namespace))].sort()
    return { nodes, edges, namespaces: nss }
  }, [rawGraph, visibleKinds])

  const cappedPods = pds.length > 100

  const toggleKind = (kind: NodeKind) => {
    setVisibleKinds(prev => {
      const next = new Set(prev)
      if (next.has(kind) && next.size > 1) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 bg-white dark:bg-slate-950 transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/60 dark:border-slate-800/60 shrink-0 sticky top-0 z-20 backdrop-blur-md bg-white/70 dark:bg-slate-950/70">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Network Map</h1>
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 uppercase tracking-wider">
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/50">{graph.nodes.length} nodes</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/50">{graph.edges.length} edges</span>
            {graph.namespaces.length > 1 && (
              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/50">{graph.namespaces.length} namespaces</span>
            )}
            {cappedPods && <span className="text-amber-500 dark:text-amber-400 font-bold ml-1">· pods capped at 100</span>}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Namespace dropdown */}
          <div className="relative">
            <select
              value={panelNs} onChange={e => setPanelNs(e.target.value)} disabled={loading}
              className="appearance-none pl-3 pr-7 py-1.5 text-xs font-semibold rounded-lg border
                         bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700
                         text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2
                         focus:ring-blue-500/40 cursor-pointer disabled:opacity-50 transition-colors"
            >
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
          <button
            onClick={() => setFitTrigger(t => t + 1)} disabled={loading || graph.nodes.length === 0}
            title="Fit to screen"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg
                       bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700
                       text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
            Fit
          </button>

          {/* Refresh */}
          <button
            onClick={() => load(panelNs)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg
                       bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700
                       text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              className={loading ? 'animate-spin' : ''}>
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Tab bar + controls */}
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 px-6 shrink-0 flex-wrap">
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
            <KindPill
              key={kind} color={color} label={label}
              count={rawGraph.nodes.filter(n => n.kind === kind).length}
              active={visibleKinds.has(kind)}
              onToggle={() => toggleKind(kind)}
            />
          ))}
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
          <TopologyView graph={graph} groupByNs={groupByNs} animate={animate} fitTrigger={fitTrigger} dark={dark} />
        ) : (
          <MapView graph={graph} groupByNs={groupByNs} animate={animate} fitTrigger={fitTrigger} dark={dark} />
        )}

        {/* Legend overlay */}
        {showLegend && !loading && <Legend dark={dark} />}
      </div>
    </div>
  )
}
