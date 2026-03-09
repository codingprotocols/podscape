import React, { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../store'
import { Search, Globe, Terminal as TerminalIcon, Network, Play, Trash2, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { KubePod, KubeService } from '../types'

interface OutputEntry {
    text: string
    success: boolean
}

const OUTPUT_LIMIT = 50

export function buildCommand(protocol: 'curl' | 'nc' | 'ping', host: string, port: string): string[] {
    if (protocol === 'curl') return ['curl', '-v', '-m', '5', `${host}${port ? ':' + port : ''}`]
    if (protocol === 'nc') return ['nc', '-zv', '-w', '5', host, port || '80']
    return ['ping', '-c', '3', '-W', '5', host]
}

export function buildServiceDnsName(svc: { metadata: { name: string; namespace: string } }): string {
    return `${svc.metadata.name}.${svc.metadata.namespace}.svc.cluster.local`
}

export default function ConnectivityTester() {
    const { selectedContext, selectedNamespace } = useAppStore()
    const [pods, setPods] = useState<KubePod[]>([])
    const [services, setServices] = useState<KubeService[]>([])
    const [selectedPod, setSelectedPod] = useState<KubePod | null>(null)
    const [selectedContainer, setSelectedContainer] = useState<string>('')
    const [targetHost, setTargetHost] = useState('')
    const [targetPort, setTargetPort] = useState('')
    const [protocol, setProtocol] = useState<'curl' | 'nc' | 'ping'>('curl')
    const [loading, setLoading] = useState(false)
    const [output, setOutput] = useState<OutputEntry[]>([])
    const [searchPod, setSearchPod] = useState('')
    const [searchTarget, setSearchTarget] = useState('')

    useEffect(() => {
        if (!selectedContext) return
        window.kubectl.getPods(selectedContext, selectedNamespace).then(p => setPods(p as KubePod[])).catch(() => setPods([]))
        window.kubectl.getServices(selectedContext, selectedNamespace).then(s => setServices(s as KubeService[])).catch(() => setServices([]))
    }, [selectedContext, selectedNamespace])

    const filteredPods = useMemo(
        () => pods.filter(p =>
            p.status.phase === 'Running' &&
            p.metadata.name.toLowerCase().includes(searchPod.toLowerCase())
        ),
        [pods, searchPod]
    )

    const filteredServices = useMemo(
        () => services.filter(s =>
            s.metadata.name.toLowerCase().includes(searchTarget.toLowerCase())
        ),
        [services, searchTarget]
    )

    const handleSelectPod = (pod: KubePod) => {
        setSelectedPod(pod)
        setSelectedContainer(pod.spec.containers[0]?.name ?? '')
    }

    const selectService = (svc: KubeService) => {
        setTargetHost(buildServiceDnsName(svc))
        if (svc.spec.ports && svc.spec.ports.length > 0) {
            setTargetPort(svc.spec.ports[0].port.toString())
        }
    }

    const runTest = async () => {
        if (!selectedPod || !targetHost || !selectedContainer) return
        setLoading(true)
        const cmd = buildCommand(protocol, targetHost, targetPort)
        try {
            const { stdout, exitCode } = await window.kubectl.execCommand(
                selectedContext!,
                selectedPod.metadata.namespace,
                selectedPod.metadata.name,
                selectedContainer,
                cmd
            )
            setOutput(prev => [{ text: `> ${cmd.join(' ')}\n${stdout}`, success: exitCode === 0 }, ...prev].slice(0, OUTPUT_LIMIT))
        } catch (err) {
            setOutput(prev => [{ text: `> ${cmd.join(' ')}\nError: ${(err as Error).message}`, success: false }, ...prev].slice(0, OUTPUT_LIMIT))
        } finally {
            setLoading(false)
        }
    }

    const clearOutput = () => setOutput([])
    const containers = selectedPod?.spec.containers.map(c => c.name) ?? []

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
            {/* Header */}
            <div className="p-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur-md">
                <div className="flex items-center gap-4 mb-2">
                    <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 shadow-lg shadow-blue-500/10">
                        <Network size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Connectivity Tester</h1>
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Debug pod network & DNS issues</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 p-8 overflow-y-auto space-y-8 max-w-6xl mx-auto w-full">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Source Config */}
                    <div className="glass-panel p-6 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                                <TerminalIcon size={16} />
                            </div>
                            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Source Pod</h2>
                        </div>

                        <div className="space-y-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                <input
                                    type="text"
                                    placeholder="Search running pods..."
                                    value={searchPod}
                                    onChange={(e) => setSearchPod(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                {filteredPods.map(pod => (
                                    <button
                                        key={pod.metadata.uid}
                                        onClick={() => handleSelectPod(pod)}
                                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${selectedPod?.metadata.uid === pod.metadata.uid
                                            ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/40 text-slate-600 dark:text-slate-400'
                                            }`}
                                    >
                                        <span className="text-xs font-bold truncate">{pod.metadata.name}</span>
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    </button>
                                ))}
                                {filteredPods.length === 0 && (
                                    <div className="text-center py-8 text-slate-400 dark:text-slate-600 italic text-xs">
                                        No running pods found
                                    </div>
                                )}
                            </div>

                            {containers.length > 0 && (
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Container</label>
                                    <select
                                        value={selectedContainer}
                                        onChange={(e) => setSelectedContainer(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                    >
                                        {containers.map(name => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Target Config */}
                    <div className="glass-panel p-6 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                <Globe size={16} />
                            </div>
                            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Target Endpoint</h2>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Select Cluster Service</label>
                                <div className="space-y-2">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                        <input
                                            type="text"
                                            placeholder="Search services..."
                                            value={searchTarget}
                                            onChange={(e) => setSearchTarget(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-1.5 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                                        {filteredServices.map(svc => (
                                            <button
                                                key={svc.metadata.uid}
                                                onClick={() => selectService(svc)}
                                                className="flex items-center justify-between p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 bg-white dark:bg-slate-900/40 transition-all group"
                                            >
                                                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 group-hover:text-blue-500 truncate">{svc.metadata.name}</span>
                                                <span className="text-[9px] font-black text-slate-400 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded uppercase">{svc.metadata.namespace}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/50">
                                <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Protocol Tool</label>
                                <div className="flex gap-2">
                                    {(['curl', 'nc', 'ping'] as const).map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setProtocol(p)}
                                            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-all ${protocol === p
                                                ? 'border-blue-500 bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                                                : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                                }`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Hostname or IP</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. google.com"
                                        value={targetHost}
                                        onChange={(e) => setTargetHost(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Port</label>
                                    <input
                                        type="text"
                                        placeholder="80"
                                        disabled={protocol === 'ping'}
                                        value={targetPort}
                                        onChange={(e) => setTargetPort(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono disabled:opacity-50"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={runTest}
                                disabled={loading || !selectedPod || !targetHost || !selectedContainer}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-[0.2em] rounded-xl transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 mt-2"
                            >
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                                {loading ? 'Executing...' : 'Run Connectivity Check'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Output */}
                <div className="glass-panel flex flex-col min-h-[400px]">
                    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <TerminalIcon size={14} className="text-slate-400" />
                            <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Output Console</h3>
                        </div>
                        {output.length > 0 && (
                            <button
                                onClick={clearOutput}
                                className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-400 transition-colors flex items-center gap-2"
                            >
                                <Trash2 size={12} />
                                Clear
                            </button>
                        )}
                    </div>

                    <div className="flex-1 p-6 font-mono text-xs overflow-y-auto space-y-4 bg-slate-950/20 rounded-b-2xl">
                        {output.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-600 gap-4 opacity-50 italic">
                                <TerminalIcon size={32} strokeWidth={1} />
                                No tests executed yet
                            </div>
                        ) : (
                            output.map((out, i) => (
                                <div key={i} className={`p-4 rounded-xl border ${out.success ? 'bg-slate-900/50 border-slate-800 text-slate-300' : 'bg-rose-500/5 border-rose-500/20 text-rose-400'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        {out.success ? <CheckCircle2 size={12} className="text-emerald-500" /> : <XCircle size={12} className="text-rose-500" />}
                                        <span className="text-[10px] font-bold uppercase tracking-widest">{out.success ? 'Success' : 'Failed'}</span>
                                    </div>
                                    <pre className="whitespace-pre-wrap break-all leading-relaxed">
                                        {out.text}
                                    </pre>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
