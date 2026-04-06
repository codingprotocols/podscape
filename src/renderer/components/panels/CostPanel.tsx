import React, { useEffect } from 'react'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import { DollarSign, AlertTriangle, RefreshCw } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const WINDOW_OPTIONS = ['1d', '7d', 'month'] as const
type TimeWindow = typeof WINDOW_OPTIONS[number]

const PROVIDER_LABELS: Record<string, string> = {
    kubecost: 'Kubecost',
    opencost: 'OpenCost',
}

const INSTALL_OPTIONS = [
    {
        label: 'Install OpenCost',
        repoName: 'opencost',
        repoUrl: 'https://opencost.github.io/opencost-helm-chart',
        chart: 'opencost/opencost',
        description: 'CNCF sandbox, Apache 2.0',
        metrics: ['Namespace cost', 'Pod cost', 'CPU / memory / GPU', 'Network egress'],
    },
    {
        label: 'Install Kubecost',
        repoName: 'kubecost',
        repoUrl: 'https://kubecost.github.io/cost-analyzer',
        chart: 'kubecost/cost-analyzer',
        description: 'Commercial, free tier available',
        metrics: ['Namespace / pod / container', 'Idle cost', 'Savings recommendations', 'Multi-cluster'],
    },
]

export default function CostPanel() {
    const {
        costAvailable, costProvider, costError, costAllocations, costLoading,
        loadCostAllocations, selectedContext, setSection, setHelmInstallHint,
    } = useAppStore(useShallow(s => ({
        costAvailable: s.costAvailable,
        costProvider: s.costProvider,
        costError: s.costError,
        costAllocations: s.costAllocations,
        costLoading: s.costLoading,
        loadCostAllocations: s.loadCostAllocations,
        selectedContext: s.selectedContext,
        setSection: s.setSection,
        setHelmInstallHint: s.setHelmInstallHint,
    })))

    const [timeWindow, setTimeWindow] = React.useState<TimeWindow>('1d')

    useEffect(() => {
        if (costAvailable) loadCostAllocations(timeWindow, 'namespace')
    }, [costAvailable, timeWindow, selectedContext])

    const providerLabel = PROVIDER_LABELS[costProvider] ?? costProvider

    return (
        <div className="flex flex-col flex-1 min-w-0 min-h-0 bg-white dark:bg-[hsl(var(--bg-dark))] overflow-y-auto">
        <div className="flex flex-col p-6 gap-6 min-h-full">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <DollarSign size={18} />
                </div>
                <div>
                    <h1 className="text-base font-bold text-slate-800 dark:text-white">Cost</h1>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {costAvailable && providerLabel ? `Powered by ${providerLabel}` : 'Kubernetes cost allocation'}
                    </p>
                </div>
                {/* Provider badge */}
                {costAvailable && providerLabel && (
                    <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                        {providerLabel}
                    </span>
                )}
                {/* Time window selector */}
                <div className="ml-auto flex gap-1">
                    {WINDOW_OPTIONS.map(w => (
                        <button key={w} onClick={() => setTimeWindow(w)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                                timeWindow === w
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700'
                            }`}
                        >{w}</button>
                    ))}
                </div>
            </div>

            {/* Detecting */}
            {costAvailable === null && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-sm">
                    <RefreshCw size={15} className="animate-spin shrink-0" />
                    Detecting Kubecost / OpenCost in cluster…
                </div>
            )}

            {/* Not detected */}
            {costAvailable === false && (
                <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
                        <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-white">Kubecost / OpenCost not detected</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                Neither tool is reachable at <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">localhost:9090</code>.
                                Install one via Helm below, then port-forward its service so Podscape can reach it.
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 font-mono bg-white dark:bg-slate-900 px-2 py-1 rounded border border-amber-200 dark:border-amber-800/30 inline-block">
                                kubectl port-forward svc/&lt;release&gt; 9090:9090
                            </p>
                            <button
                                onClick={() => setSection('portforwards')}
                                className="block mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                            >
                                Or set up a Port Forward in Podscape →
                            </button>
                            {costError && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-mono">{costError}</p>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {INSTALL_OPTIONS.map(opt => (
                            <button
                                key={opt.repoName}
                                onClick={() => {
                                    setHelmInstallHint({ repoName: opt.repoName, repoUrl: opt.repoUrl, chart: opt.chart })
                                    setSection('helm')
                                }}
                                className="flex flex-col items-start gap-2 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-sm transition-all text-left group"
                            >
                                <div>
                                    <span className="text-[11px] font-black text-slate-800 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{opt.label}</span>
                                    <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{opt.description}</span>
                                </div>
                                <ul className="flex flex-col gap-1 w-full">
                                    {opt.metrics.map(m => (
                                        <li key={m} className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                                            <span className="w-1 h-1 rounded-full bg-emerald-400 dark:bg-emerald-600 shrink-0" />
                                            {m}
                                        </li>
                                    ))}
                                </ul>
                                <span className="text-[9px] font-mono text-slate-300 dark:text-slate-600">{opt.chart}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Loading */}
            {costAvailable === true && costLoading && (
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                    <RefreshCw size={14} className="animate-spin" /> Loading cost data…
                </div>
            )}

            {/* Error */}
            {costAvailable === true && !costLoading && costError && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-sm text-red-600 dark:text-red-400">
                    {costError}
                </div>
            )}

            {/* Chart + Table */}
            {costAvailable === true && !costLoading && !costError && costAllocations.length > 0 && (
                <>
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                        <h2 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">
                            Cost by Namespace ({timeWindow})
                        </h2>
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={costAllocations.slice(0, 10)} layout="vertical" margin={{ left: 20, right: 20 }}>
                                <XAxis type="number" tickFormatter={(v: number) => `$${v.toFixed(2)}`} tick={{ fontSize: 10 }} />
                                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                                <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, 'Total Cost']} />
                                <Bar dataKey="totalCost" radius={[0, 4, 4, 0]}>
                                    {costAllocations.slice(0, 10).map((_, i) => (
                                        <Cell key={i} fill={i === 0 ? '#10b981' : '#6ee7b7'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                    <th className="text-left px-4 py-3 font-semibold">Namespace</th>
                                    <th className="text-right px-4 py-3 font-semibold">Total</th>
                                    <th className="text-right px-4 py-3 font-semibold">CPU</th>
                                    <th className="text-right px-4 py-3 font-semibold">Memory</th>
                                </tr>
                            </thead>
                            <tbody>
                                {costAllocations.map((item, i) => (
                                    <tr key={item.name} className={`border-b border-slate-50 dark:border-slate-800/50 ${i % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-800/20'}`}>
                                        <td className="px-4 py-2.5 font-mono text-slate-700 dark:text-slate-300">{item.name}</td>
                                        <td className="px-4 py-2.5 text-right font-semibold text-slate-800 dark:text-white">${item.totalCost.toFixed(4)}</td>
                                        <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">${item.cpuCost.toFixed(4)}</td>
                                        <td className="px-4 py-2.5 text-right text-slate-500 dark:text-slate-400">${item.ramCost.toFixed(4)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Empty state */}
            {costAvailable === true && !costLoading && !costError && costAllocations.length === 0 && (
                <div className="text-center text-slate-400 dark:text-slate-600 py-16 text-sm">
                    No cost data for this time window.
                </div>
            )}
        </div>
        </div>
    )
}
