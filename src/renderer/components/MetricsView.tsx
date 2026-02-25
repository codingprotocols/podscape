import React, { useEffect } from 'react'
import { useAppStore } from '../store'
import { parseCpuMillicores, parseMemoryMiB } from '../types'

export default function MetricsView(): JSX.Element {
  const { podMetrics, nodeMetrics, loadSection, loadingResources, selectedNamespace, refresh } = useAppStore()

  useEffect(() => { loadSection('metrics') }, [selectedNamespace])

  return (
    <div className="flex flex-col flex-1 bg-gray-900/50 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white">Metrics</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Live resource usage · requires metrics-server
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loadingResources}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-300 bg-white/5
                     hover:bg-white/10 rounded transition-colors disabled:opacity-50 border border-white/10"
        >
          <span className={loadingResources ? 'animate-spin inline-block' : 'inline-block'}>↻</span>
          Refresh
        </button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-6">
        {/* Node metrics */}
        {nodeMetrics.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Nodes</h3>
            <div className="grid gap-3">
              {nodeMetrics.map(nm => {
                const cpu = parseCpuMillicores(nm.usage.cpu)
                const mem = parseMemoryMiB(nm.usage.memory)
                return (
                  <div key={nm.metadata.name} className="bg-gray-800/50 border border-white/10 rounded-lg px-4 py-3">
                    <p className="text-xs font-mono text-white mb-2.5">{nm.metadata.name}</p>
                    <div className="space-y-2">
                      <MetricBar label="CPU" value={`${Math.round(cpu)}m`} pct={Math.min(100, cpu / 10)} />
                      <MetricBar label="Memory" value={mem >= 1024 ? `${(mem / 1024).toFixed(1)}Gi` : `${Math.round(mem)}Mi`} pct={Math.min(100, mem / 40)} />
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
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Pods — {selectedNamespace}
            </h3>
            <div className="bg-gray-800/30 border border-white/10 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-900/80">
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Pod</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Container</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">CPU</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-400">Memory</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {podMetrics.flatMap(pm =>
                    pm.containers.map(c => {
                      const cpu = parseCpuMillicores(c.usage.cpu)
                      const mem = parseMemoryMiB(c.usage.memory)
                      return (
                        <tr key={`${pm.metadata.name}-${c.name}`} className="hover:bg-white/3">
                          <td className="px-4 py-2.5 text-xs font-mono text-gray-200 truncate max-w-[180px]">
                            {pm.metadata.name}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400">{c.name}</td>
                          <td className="px-4 py-2.5 text-xs text-right font-mono">
                            <span className={cpu > 500 ? 'text-orange-400' : 'text-gray-300'}>
                              {Math.round(cpu)}m
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-right font-mono">
                            <span className={mem > 512 ? 'text-orange-400' : 'text-gray-300'}>
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
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-500">
            <span className="text-4xl opacity-30">📊</span>
            <div className="text-center">
              <p className="text-sm font-medium">No metrics available</p>
              <p className="text-xs mt-1 text-gray-600">
                Install <span className="font-mono text-gray-500">metrics-server</span> in your cluster to enable CPU & memory metrics.
              </p>
              <pre className="mt-3 text-xs bg-gray-800 text-gray-300 px-3 py-2 rounded-lg">
                kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
              </pre>
            </div>
          </div>
        )}

        {loadingResources && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
            <div className="w-6 h-6 border-2 border-gray-700 border-t-gray-400 rounded-full animate-spin" />
            <span className="text-sm">Fetching metrics…</span>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricBar({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-12">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-orange-500' : 'bg-blue-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono text-gray-300 w-16 text-right">{value}</span>
    </div>
  )
}
