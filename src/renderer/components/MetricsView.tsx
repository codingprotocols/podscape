import React, { useEffect, useState, useMemo } from 'react'
import { useAppStore } from '../store'
import { parseCpuMillicores, parseMemoryMiB } from '../types'
import { Search, ArrowUp, ArrowDown, Activity, RefreshCw, Cpu, Database } from 'lucide-react'

// ─── Types & Sorting ──────────────────────────────────────────────────────────

type SortField = 'name' | 'cpu' | 'memory'
type SortOrder = 'asc' | 'desc'

export default function MetricsView(): JSX.Element {
  const {
    podMetrics, nodeMetrics, nodes, pods, hpas,
    loadSection, loadingResources, selectedNamespace, refresh
  } = useAppStore()

  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<SortField>('cpu')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  useEffect(() => { loadSection('metrics') }, [selectedNamespace])

  // Cluster-wide aggregates
  const clusterTotals = useMemo(() => {
    let totalCpuM = 0; let usedCpuM = 0
    let totalMemMiB = 0; let usedMemMiB = 0

    const safeNodes = Array.isArray(nodes) ? nodes : []
    safeNodes.forEach(n => {
      totalCpuM += parseCpuMillicores(n.status.allocatable?.cpu ?? n.status.capacity?.cpu ?? '0')
      totalMemMiB += parseMemoryMiB(n.status.allocatable?.memory ?? n.status.capacity?.memory ?? '0Ki')
    })

    const safeNodeMetrics = Array.isArray(nodeMetrics) ? nodeMetrics : []
    safeNodeMetrics.forEach(nm => {
      usedCpuM += parseCpuMillicores(nm.usage.cpu)
      usedMemMiB += parseMemoryMiB(nm.usage.memory)
    })

    return {
      cpu: { used: usedCpuM, total: totalCpuM, pct: totalCpuM > 0 ? (usedCpuM / totalCpuM) * 100 : 0 },
      mem: { used: usedMemMiB, total: totalMemMiB, pct: totalMemMiB > 0 ? (usedMemMiB / totalMemMiB) * 100 : 0 }
    }
  }, [nodes, nodeMetrics])

  const fmtCpu = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} Core` : `${Math.round(m)}m`
  const fmtMem = (mib: number) => mib >= 1024 ? `${(mib / 1024).toFixed(1)} GiB` : `${Math.round(mib)} MiB`

  // Filtering and Sorting
  const processedPods = useMemo(() => {
    const safePodMetrics = Array.isArray(podMetrics) ? podMetrics : []
    const safePods = Array.isArray(pods) ? pods : []
    const safeHPAs = Array.isArray(hpas) ? hpas : []

    const list = safePodMetrics.flatMap(pm => {
      const podObj = safePods.find(p => p.metadata.name === pm.metadata.name && p.metadata.namespace === pm.metadata.namespace)

      return (pm.containers ?? []).map(c => {
        const podContainer = podObj?.spec.containers.find(pc => pc.name === c.name)
        const requests = podContainer?.resources?.requests
        const limits = podContainer?.resources?.limits

        const reqCpu = requests?.cpu ? parseCpuMillicores(requests.cpu) : 0
        const limCpu = limits?.cpu ? parseCpuMillicores(limits.cpu) : 0
        const reqMem = requests?.memory ? parseMemoryMiB(requests.memory) : 0
        const limMem = limits?.memory ? parseMemoryMiB(limits.memory) : 0

        const curCpu = parseCpuMillicores(c.usage.cpu)
        const curMem = parseMemoryMiB(c.usage.memory)

        // Find HPA
        const hpa = safeHPAs.find(h =>
          h.metadata.namespace === pm.metadata.namespace &&
          (h.spec.scaleTargetRef.name === pm.metadata.name || // Simple match
            podObj?.metadata.ownerReferences?.some(or => or.name === h.spec.scaleTargetRef.name))
        )

        return {
          pm,
          c,
          cpu: curCpu,
          mem: curMem,
          reqCpu, limCpu,
          reqMem, limMem,
          hpa,
          // Efficiency: Usage / Request (if request > 0)
          cpuEff: reqCpu > 0 ? (curCpu / reqCpu) * 100 : null,
          memEff: reqMem > 0 ? (curMem / reqMem) * 100 : null
        }
      })
    })

    const filtered = list.filter(item =>
      item.pm.metadata.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.c.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return filtered.sort((a, b) => {
      const factor = sortOrder === 'asc' ? 1 : -1
      if (sortField === 'name') return a.pm.metadata.name.localeCompare(b.pm.metadata.name) * factor
      if (sortField === 'cpu') return (a.cpu - b.cpu) * factor
      if (sortField === 'memory') return (a.mem - b.mem) * factor
      return 0
    })
  }, [podMetrics, pods, hpas, searchTerm, sortField, sortOrder])

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-[hsl(var(--bg-dark))] h-full overflow-auto transition-colors duration-200">
      {/* Premium Header */}
      <div className="flex flex-col px-8 py-8 border-b border-slate-200 dark:border-white/5 shrink-0 bg-white/5 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter flex items-center gap-3">
              <Activity className="w-8 h-8 text-blue-500" />
              Resource Intelligence
            </h2>
            <p className="text-[10px] font-black text-slate-500 dark:text-slate-600 mt-2.5 uppercase tracking-[0.25em] flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6] animate-pulse" />
              Live Cluster Observability
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={refresh}
              disabled={loadingResources}
              className="flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300
                         glass-panel hover:bg-white/10 dark:hover:bg-white/5 rounded-xl shadow-sm
                         disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 transition-transform duration-700 ${loadingResources ? 'animate-spin' : ''}`} />
              Sync
            </button>
          </div>
        </div>

      </div>

      <div className="flex-1 px-8 py-8 space-y-10">
        {nodeMetrics.length > 0 ? (
          <>
            {/* Aggregate Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ClusterStat
                label="Total CPU Load"
                used={clusterTotals.cpu.used}
                total={clusterTotals.cpu.total}
                pct={clusterTotals.cpu.pct}
                icon={<Cpu className="w-4 h-4" />}
                fmt={fmtCpu}
              />
              <ClusterStat
                label="Total Memory Load"
                used={clusterTotals.mem.used}
                total={clusterTotals.mem.total}
                pct={clusterTotals.mem.pct}
                icon={<Database className="w-4 h-4" />}
                fmt={fmtMem}
              />
            </div>

            {/* Node metrics */}
            <section>
              <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-5 flex items-center gap-2">
                <span className="w-4 h-px bg-slate-200 dark:bg-slate-800" />
                Cluster Nodes
              </h3>
              <div className="grid gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {(Array.isArray(nodeMetrics) ? nodeMetrics : []).map(nm => {
                  const node = (Array.isArray(nodes) ? nodes : []).find(n => n.metadata.name === nm.metadata.name)
                  const cpuCapM = parseCpuMillicores(node?.status.allocatable?.cpu ?? node?.status.capacity?.cpu ?? '0')
                  const memCapMiB = parseMemoryMiB(node?.status.allocatable?.memory ?? node?.status.capacity?.memory ?? '0Ki')
                  const cpuUsedM = parseCpuMillicores(nm.usage.cpu)
                  const memUsedMiB = parseMemoryMiB(nm.usage.memory)

                  const cpuPct = cpuCapM > 0 ? (cpuUsedM / cpuCapM) * 100 : 0
                  const memPct = memCapMiB > 0 ? (memUsedMiB / memCapMiB) * 100 : 0

                  const overcommittedCpu = pods.reduce((total, p) => {
                    if (p.spec.nodeName !== nm.metadata.name) return total
                    return total + p.spec.containers.reduce((ct, c) => ct + (c.resources?.limits?.cpu ? parseCpuMillicores(c.resources.limits.cpu) : 0), 0)
                  }, 0)

                  return (
                    <div key={nm.metadata.name} className="glass-card glass-light p-6 space-y-6 hover:scale-[1.02] transition-all group border-white/5">
                      <div className="flex items-center justify-between min-w-0">
                        <p className="text-[14px] font-black text-white font-mono truncate tracking-tight">{nm.metadata.name}</p>
                        {overcommittedCpu > cpuCapM && (
                          <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-500 text-[8px] font-black uppercase tracking-widest animate-pulse">
                            Overcommitted
                          </span>
                        )}
                      </div>
                      <div className="space-y-4">
                        <MetricBar label="Physical CPU" value={`${Math.round(cpuUsedM)}m / ${fmtCpu(cpuCapM)}`} pct={cpuPct} />
                        <MetricBar label="Physical Memory" value={`${fmtMem(memUsedMiB)} / ${fmtMem(memCapMiB)}`} pct={memPct} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Pod metrics */}
            <section className="space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] flex items-center gap-2">
                  <span className="w-4 h-px bg-slate-200 dark:bg-slate-800" />
                  Pod Performance — {selectedNamespace === '_all' ? 'All Namespaces' : selectedNamespace}
                </h3>

                <div className="flex items-center gap-3">
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                    <input
                      type="text"
                      placeholder="Search pods..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-2 text-[11px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl
                                 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-48 lg:w-64"
                    />
                  </div>
                </div>
              </div>

              <div className="glass-card overflow-hidden border-slate-200 dark:border-white/5">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                        <SortHeader field="name" label="Pod / Container" current={sortField} order={sortOrder} onSort={(f) => {
                          if (sortField === f) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                          else { setSortField(f); setSortOrder('desc') }
                        }} />
                        <SortHeader field="cpu" label="CPU" current={sortField} order={sortOrder} onSort={(f) => {
                          if (sortField === f) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                          else { setSortField(f); setSortOrder('desc') }
                        }} className="text-right" />
                        <SortHeader field="memory" label="Memory" current={sortField} order={sortOrder} onSort={(f) => {
                          if (sortField === f) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                          else { setSortField(f); setSortOrder('desc') }
                        }} className="text-right" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {processedPods.map(({ pm, c, cpu, mem, reqCpu, limCpu, reqMem, limMem, cpuEff, memEff, hpa }) => (
                        <tr key={`${pm.metadata.name}-${c.name}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-all group">
                          <td className="px-6 py-5">
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[12px] font-black text-slate-800 dark:text-white font-mono truncate">{pm.metadata.name}</span>
                                {hpa && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500 dark:text-blue-400 text-[8px] font-black uppercase tracking-widest border border-blue-500/20">
                                    HPA
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-500 dark:group-hover:text-blue-500/70 transition-colors uppercase tracking-tight">{c.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex flex-col gap-2">
                              <div className="flex justify-between items-baseline">
                                <span className={`text-[11px] font-black font-mono ${cpu > limCpu && limCpu > 0 ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {Math.round(cpu)}m
                                </span>
                                <div className="flex gap-2">
                                  <span className="text-[8px] font-bold text-slate-400 dark:text-slate-600 uppercase">Req: {reqCpu > 0 ? `${reqCpu}m` : '0'}</span>
                                  <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase font-black">Lim: {limCpu > 0 ? `${limCpu}m` : '∞'}</span>
                                </div>
                              </div>
                              <div className="h-1 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-700 ${cpuEff !== null && cpuEff > 100 ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-blue-500'}`}
                                  style={{ width: `${Math.min(100, limCpu > 0 ? (cpu / limCpu) * 100 : cpu / 10)}%` }}
                                />
                              </div>
                              {cpuEff !== null && (
                                <div className="flex flex-col gap-1">
                                  <span className={`text-[8px] font-black uppercase tracking-widest ${cpuEff < 10 ? 'text-amber-500 animate-pulse' : 'text-slate-400 dark:text-slate-600'}`}>
                                    Efficiency: {Math.round(cpuEff)}% of Req
                                  </span>
                                  {cpuEff < 10 && reqCpu > 0 && (
                                    <span className="text-[7px] text-amber-500/80 font-bold italic">Recommendation: Reduce Request to {Math.max(10, Math.round(cpu * 1.5))}m</span>
                                  )}
                                  {cpu > limCpu * 0.95 && limCpu > 0 && (
                                    <span className="text-[7px] text-red-500 font-bold italic">Warning: Throttling likely. Increase Limit.</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex flex-col gap-2">
                              <div className="flex justify-between items-baseline">
                                <span className={`text-[11px] font-black font-mono ${mem > limMem && limMem > 0 ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {mem >= 1024 ? `${(mem / 1024).toFixed(1)}Gi` : `${Math.round(mem)}Mi`}
                                </span>
                                <div className="flex gap-2">
                                  <span className="text-[8px] font-bold text-slate-400 dark:text-slate-600 uppercase">Req: {reqMem > 0 ? `${reqMem}Mi` : '0'}</span>
                                  <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase font-black">Lim: {limMem > 0 ? `${limMem}Mi` : '∞'}</span>
                                </div>
                              </div>
                              <div className="h-1 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-700 ${memEff !== null && memEff > 100 ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-purple-500'}`}
                                  style={{ width: `${Math.min(100, limMem > 0 ? (mem / limMem) * 100 : mem / 50)}%` }}
                                />
                              </div>
                              {memEff !== null && (
                                <div className="flex flex-col gap-1">
                                  <span className={`text-[8px] font-black uppercase tracking-widest ${memEff < 15 ? 'text-amber-500 animate-pulse' : 'text-slate-400 dark:text-slate-600'}`}>
                                    Efficiency: {Math.round(memEff)}% of Req
                                  </span>
                                  {memEff < 15 && reqMem > 0 && (
                                    <span className="text-[7px] text-amber-500/80 font-bold italic">Recommendation: Reduce Request to {Math.max(16, Math.round(mem * 1.2))}Mi</span>
                                  )}
                                  {mem > limMem * 0.95 && limMem > 0 && (
                                    <span className="text-[7px] text-red-500 font-bold italic">Warning: Near OOM. Increase Limit.</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {processedPods.length === 0 && !loadingResources && (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">
                            No pods matching "{searchTerm}"
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        ) : !loadingResources ? (
          <div className="glass-panel p-12 flex flex-col items-center text-center gap-6 border-dashed border-2">
            <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-300 dark:text-slate-700 shadow-inner">
              <Cpu className="w-8 h-8" />
            </div>
            <div className="max-w-md">
              <h4 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Metrics-Server Required</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                To enable real-time resource monitoring, you must install the metrics-server in your cluster.
              </p>
              <div className="mt-8 p-4 bg-slate-950 rounded-xl border border-white/5 font-mono group relative">
                <code className="text-[10px] text-blue-400 break-all leading-relaxed">
                  kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
                </code>
              </div>
            </div>
          </div>
        ) : null}

        {/* Sync state */}
        {loadingResources && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em]">Synchronizing Metrics…</span>
          </div>
        )}
      </div>
    </div>
  )
}

function SortHeader({ field, label, current, order, onSort, className }: any) {
  const active = current === field
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-500 transition-colors ${className}`}
    >
      <div className={`flex items-center gap-2 ${className?.includes('text-right') ? 'justify-end' : ''}`}>
        {label}
        {active ? (
          order === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUp className="w-3 h-3 opacity-0 group-hover:opacity-10" />
        )}
      </div>
    </th>
  )
}

function ClusterStat({ label, used, total, pct, icon, fmt }: any) {
  const color =
    pct >= 85 ? 'var(--danger)' :
      pct >= 65 ? 'var(--warning)' :
        pct >= 45 ? 'hsl(38, 92%, 60%)' :
          'var(--primary)'

  const barBg =
    pct >= 85 ? 'bg-red-500' :
      pct >= 65 ? 'bg-orange-500' :
        pct >= 45 ? 'bg-yellow-500' :
          'bg-blue-500'

  const accent =
    pct >= 85 ? 'text-red-500 bg-red-500/10' :
      pct >= 65 ? 'text-orange-500 bg-orange-500/10' :
        pct >= 45 ? 'text-yellow-500 bg-yellow-500/10' :
          'text-blue-500 bg-blue-500/10'

  return (
    <div className="glass-card p-6 flex flex-col gap-4 border-l-4 border-slate-200 dark:border-white/5" style={{ borderLeftColor: color }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${accent}`}>{icon}</div>
          <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{label}</span>
        </div>
        <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{Math.round(pct)}%</span>
      </div>
      <div className="space-y-2">
        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div className={`h-full rounded-full ${barBg} transition-all duration-1000`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="flex justify-between text-[10px] font-bold font-mono text-slate-400">
          <span>{fmt(used)} Used</span>
          <span>{fmt(total)} Capacity</span>
        </div>
      </div>
    </div>
  )
}

function MetricBar({ label, value, pct }: { label: string; value: string; pct: number }) {
  const barColor =
    pct >= 85 ? 'bg-red-500' :
      pct >= 65 ? 'bg-orange-500' :
        pct >= 45 ? 'bg-yellow-500' :
          'bg-blue-500'

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">{label}</span>
        <span className="text-[10px] font-black tabular-nums text-slate-700 dark:text-slate-300 font-mono">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800/50 overflow-hidden shadow-inner">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor} shadow-[0_0_8px_rgba(0,0,0,0.1)]`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}
