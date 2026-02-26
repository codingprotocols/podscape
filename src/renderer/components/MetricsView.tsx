import React, { useEffect } from 'react'
import { useAppStore } from '../store'
import { parseCpuMillicores, parseMemoryMiB } from '../types'

export default function MetricsView(): JSX.Element {
  const { podMetrics, nodeMetrics, loadSection, loadingResources, selectedNamespace, refresh } = useAppStore()

  useEffect(() => { loadSection('metrics') }, [selectedNamespace])

  return (
    <div className="flex flex-col flex-1 bg-slate-50 dark:bg-slate-950 h-full overflow-auto transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-6 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-950">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Metrics</h2>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
            Live resource usage · requires metrics-server
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loadingResources}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300
                     bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg shadow-sm
                     disabled:opacity-50 border border-slate-200 dark:border-slate-800 transition-all active:scale-95"
        >
          <span className={`transition-transform duration-500 ${loadingResources ? 'animate-spin' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6m12 6a9 9 0 0 1-15-6.7L3 16" /></svg>
          </span>
          Refresh
        </button>
      </div>

      <div className="flex-1 px-8 py-8 space-y-10">
        {/* Node metrics */}
        {nodeMetrics.length > 0 && (
          <section>
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-4">Cluster Nodes</h3>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {nodeMetrics.map(nm => {
                const cpu = parseCpuMillicores(nm.usage.cpu)
                const mem = parseMemoryMiB(nm.usage.memory)
                return (
                  <div key={nm.metadata.name} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-4 shadow-sm hover:shadow-md transition-all">
                    <p className="text-xs font-bold text-slate-800 dark:text-white font-mono mb-4 truncate">{nm.metadata.name}</p>
                    <div className="space-y-4">
                      <MetricBar label="CPU" value={`${Math.round(cpu)}m`} pct={Math.min(100, cpu / 10)} />
                      <MetricBar label="MEMORY" value={mem >= 1024 ? `${(mem / 1024).toFixed(1)} Gi` : `${Math.round(mem)} Mi`} pct={Math.min(100, mem / 40)} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Pod metrics */}
        {podMetrics.length > 0 && (
          <section>
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-4">
              Pods — {selectedNamespace}
            </h3>
            <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Pod</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Container</th>
                    <th className="text-right px-5 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">CPU</th>
                    <th className="text-right px-5 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Memory</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {podMetrics.flatMap(pm =>
                    pm.containers.map(c => {
                      const cpu = parseCpuMillicores(c.usage.cpu)
                      const mem = parseMemoryMiB(c.usage.memory)
                      return (
                        <tr key={`${pm.metadata.name}-${c.name}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-5 py-3 text-[11px] font-bold font-mono text-slate-700 dark:text-slate-300 truncate max-w-[220px]">
                            {pm.metadata.name}
                          </td>
                          <td className="px-5 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-500">{c.name}</td>
                          <td className="px-5 py-3 text-[11px] text-right font-mono font-bold">
                            <span className={cpu > 500 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}>
                              {Math.round(cpu)}m
                            </span>
                          </td>
                          <td className="px-5 py-3 text-[11px] text-right font-mono font-bold">
                            <span className={mem > 512 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}>
                              {mem >= 1024 ? `${(mem / 1024).toFixed(1)}Gi` : `${Math.round(mem)}Mi`}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* No metrics */}
        {!loadingResources && podMetrics.length === 0 && nodeMetrics.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 bg-white dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-slate-300 dark:text-slate-700">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" /></svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">No metrics available</p>
              <p className="text-[11px] mt-1.5 text-slate-400 dark:text-slate-600 max-w-xs mx-auto">
                Install <span className="font-mono text-slate-500 dark:text-slate-400">metrics-server</span> in your cluster to enable live resource monitoring.
              </p>
              <pre className="mt-6 text-[10px] font-bold bg-slate-900 text-slate-300 px-4 py-3 rounded-xl border border-white/5 font-mono">
                kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
              </pre>
            </div>
          </div>
        )}

        {loadingResources && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-4 border-slate-100 dark:border-slate-800 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em]">Synchronizing Metrics…</span>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricBar({ label, value, pct }: { label: string; value: string; pct: number }) {
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-blue-500'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">{label}</span>
        <span className="text-[10px] font-bold tabular-nums text-slate-600 dark:text-slate-300">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color} shadow-[0_0_8px_rgba(0,0,0,0.1)]`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
