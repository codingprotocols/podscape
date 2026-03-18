import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'

import { useAppStore } from '../store'
import PageHeader from './PageHeader'
import type { KubePod, KubeService } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = 'diagnose' | 'manual'
type Protocol = 'curl' | 'nc' | 'ping'
type StepStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped'

interface DiagStep {
    key: 'dns' | 'tcp' | 'http'
    label: string
    cmd: string[]
    status: StepStatus
    output: string
    durationMs: number
}

interface DiagRun {
    id: number
    timestamp: Date
    from: string
    to: string
    steps: DiagStep[]
    done: boolean
}

interface ManualRun {
    id: number
    timestamp: Date
    cmd: string[]
    from: string
    to: string
    output: string
    exitCode: number
    durationMs: number
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

export function buildCommand(protocol: Protocol, host: string, port: string, path = ''): string[] {
    const target = `${host}${port ? ':' + port : ''}${path}`
    if (protocol === 'curl') return ['curl', '-v', '-m', '10', target]
    if (protocol === 'nc') return ['nc', '-zv', '-w', '5', host, port || '80']
    return ['ping', '-c', '3', '-W', '5', host]
}

export function buildServiceDnsName(svc: { metadata: { name: string; namespace?: string } }): string {
    return `${svc.metadata.name}.${svc.metadata.namespace || 'default'}.svc.cluster.local`
}

export function buildPodDnsName(pod: { metadata: { namespace?: string }; status: { podIP?: string } }): string {
    const ip = pod.status.podIP ?? ''
    const ns = pod.metadata.namespace ?? 'default'
    return `${ip.replace(/\./g, '-')}.${ns}.pod.cluster.local`
}

function podContainerPorts(pod: KubePod): number[] {
    const ports = new Set<number>()
    for (const c of pod.spec.containers) {
        for (const p of c.ports ?? []) {
            ports.add(p.containerPort)
        }
    }
    return [...ports].sort((a, b) => a - b)
}

function buildDiagSteps(host: string, port: string, path: string, skipDns: boolean): DiagStep[] {
    const url = `http://${host}${port ? ':' + port : ''}${path || '/'}`
    const steps: DiagStep[] = []

    if (!skipDns) {
        steps.push({
            key: 'dns', label: 'DNS Resolution', status: 'idle', output: '', durationMs: 0,
            cmd: ['nslookup', host],
        })
    }

    steps.push({
        key: 'tcp', label: 'TCP Port Check', status: 'idle', output: '', durationMs: 0,
        cmd: ['nc', '-zv', '-w', '5', host, port || '80'],
    })

    steps.push({
        key: 'http', label: 'HTTP Response', status: 'idle', output: '', durationMs: 0,
        cmd: ['curl', '-s', '-m', '10', '-o', '/dev/null', '-w', 'HTTP %{http_code} (%{time_total}s)', url],
    })

    return steps
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepRow({ step }: { step: DiagStep }) {
    const [expanded, setExpanded] = useState(false)
    const hasOutput = step.output.trim().length > 0

    const icon = step.status === 'running'
        ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
        : step.status === 'success'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
            : step.status === 'failed'
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                : step.status === 'skipped'
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                    : <span className="w-3.5 h-3.5 rounded-full border-2 border-current opacity-30 inline-block" />

    const color =
        step.status === 'success' ? 'text-emerald-500' :
            step.status === 'failed' ? 'text-red-400' :
                step.status === 'running' ? 'text-blue-400' :
                    step.status === 'skipped' ? 'text-slate-500' :
                        'text-slate-500'

    return (
        <div className={`border-l-2 pl-4 py-1 ${step.status === 'success' ? 'border-emerald-500' : step.status === 'failed' ? 'border-red-400' : step.status === 'running' ? 'border-blue-400' : 'border-slate-700'}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className={color}>{icon}</span>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{step.label}</span>
                    {step.status !== 'idle' && step.status !== 'running' && step.durationMs > 0 && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">{step.durationMs}ms</span>
                    )}
                    {step.status === 'running' && (
                        <span className="text-[10px] text-blue-400 animate-pulse">running…</span>
                    )}
                    {step.status === 'skipped' && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-600">DNS failed — skipped</span>
                    )}
                </div>
                {hasOutput && (
                    <button
                        onClick={() => setExpanded(e => !e)}
                        className="text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition-colors font-bold uppercase tracking-wider"
                    >
                        {expanded ? 'Hide' : 'Output'}
                    </button>
                )}
            </div>
            {hasOutput && expanded && (
                <pre className="mt-2 text-[10px] leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-all bg-slate-100 dark:bg-black/30 rounded-lg p-3 max-h-40 overflow-y-auto">
                    {step.output.trim()}
                </pre>
            )}
        </div>
    )
}

function DiagRunCard({ run }: { run: DiagRun }) {
    const allDone = run.steps.every(s => s.status !== 'idle' && s.status !== 'running')
    const anyFailed = run.steps.some(s => s.status === 'failed')
    const allSuccess = run.steps.every(s => s.status === 'success')

    const copyAll = () => {
        const lines = run.steps.map(s =>
            `[${s.label}] ${s.status.toUpperCase()}${s.durationMs ? ` (${s.durationMs}ms)` : ''}\n${s.output.trim()}`
        ).join('\n\n')
        navigator.clipboard.writeText(`FROM: ${run.from}\nTO: ${run.to}\n\n${lines}`)
    }

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
                <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${allDone ? (allSuccess ? 'bg-emerald-500' : anyFailed ? 'bg-red-400' : 'bg-slate-500') : 'bg-blue-400 animate-pulse'}`} />
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate font-mono">{run.from}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-slate-400 dark:text-slate-600"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                    <span className="text-[10px] font-bold text-slate-800 dark:text-slate-300 truncate font-mono">{run.to}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-600 font-mono">{run.timestamp.toLocaleTimeString()}</span>
                    {allDone && (
                        <button onClick={copyAll} className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors" title="Copy results">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        </button>
                    )}
                </div>
            </div>
            <div className="p-4 space-y-3">
                {run.steps.map(step => <StepRow key={step.key} step={step} />)}
            </div>
        </div>
    )
}

function ManualRunCard({ run }: { run: ManualRun }) {
    const copy = () => navigator.clipboard.writeText(run.output)

    return (
        <div className={`rounded-xl border overflow-hidden ${run.exitCode === 0 ? 'border-emerald-900/60 bg-emerald-950/20' : 'border-red-900/40 bg-red-950/10'}`}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-inherit">
                <div className="flex items-center gap-2 min-w-0">
                    {run.exitCode === 0
                        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    }
                    <code className="text-[10px] text-slate-400 font-mono truncate">{run.cmd.join(' ')}</code>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="text-[10px] text-slate-400 dark:text-slate-600 font-mono">{run.timestamp.toLocaleTimeString()}</span>
                    <button onClick={copy} className="text-[10px] text-slate-400 hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-300 transition-colors" title="Copy output">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                    </button>
                </div>
            </div>
            <pre className="px-4 py-3 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                {run.output.trim() || '(no output)'}
            </pre>
        </div>
    )
}

// ─── Main component ───────────────────────────────────────────────────────────

const idRef = { current: 0 }
const nextId = () => ++idRef.current

export default function ConnectivityTester() {
    const { selectedContext, selectedNamespace } = useAppStore()

    // Data
    const [pods, setPods] = useState<KubePod[]>([])
    const [services, setServices] = useState<KubeService[]>([])

    // Source
    const [selectedPod, setSelectedPod] = useState<KubePod | null>(null)
    const [selectedContainer, setSelectedContainer] = useState('')
    const [searchPod, setSearchPod] = useState('')

    // Target
    const [targetHost, setTargetHost] = useState('')
    const [targetPort, setTargetPort] = useState('')
    const [targetPath, setTargetPath] = useState('/')
    const [protocol, setProtocol] = useState<Protocol>('curl')
    const [searchSvc, setSearchSvc] = useState('')
    const [searchTargetPod, setSearchTargetPod] = useState('')
    const [targetPickerTab, setTargetPickerTab] = useState<'services' | 'pods'>('services')

    // Mode & results
    const [mode, setMode] = useState<Mode>('diagnose')
    const [running, setRunning] = useState(false)
    const [activeDiag, setActiveDiag] = useState<DiagRun | null>(null)
    const [diagHistory, setDiagHistory] = useState<DiagRun[]>([])
    const [manualHistory, setManualHistory] = useState<ManualRun[]>([])

    const activeDiagRef = useRef<DiagRun | null>(null)

    // Fetch pods + services on context/namespace change
    useEffect(() => {
        if (!selectedContext) return
        const nsArg = selectedNamespace === '_all' ? null : selectedNamespace
        window.kubectl.getPods(selectedContext, nsArg)
            .then(p => setPods(p as KubePod[]))
            .catch(() => setPods([]))
        window.kubectl.getServices(selectedContext, nsArg)
            .then(s => setServices(s as KubeService[]))
            .catch(() => setServices([]))
        setSelectedPod(null)
        setSelectedContainer('')
    }, [selectedContext, selectedNamespace])

    const filteredPods = useMemo(
        () => pods.filter(p =>
            p.status.phase === 'Running' &&
            p.metadata.name.toLowerCase().includes(searchPod.toLowerCase())
        ),
        [pods, searchPod]
    )

    const filteredSvcs = useMemo(
        () => services.filter(s => s.metadata.name.toLowerCase().includes(searchSvc.toLowerCase())),
        [services, searchSvc]
    )

    const filteredTargetPods = useMemo(
        () => pods.filter(p =>
            p.status.phase === 'Running' &&
            !!p.status.podIP &&
            p.metadata.name.toLowerCase().includes(searchTargetPod.toLowerCase())
        ),
        [pods, searchTargetPod]
    )

    const containers = selectedPod?.spec.containers.map(c => c.name) ?? []

    const handleSelectPod = (pod: KubePod) => {
        setSelectedPod(pod)
        setSelectedContainer(pod.spec.containers[0]?.name ?? '')
    }

    const handleSelectService = (svc: KubeService, port?: number) => {
        setTargetHost(buildServiceDnsName(svc))
        setTargetPort(String(port ?? svc.spec.ports?.[0]?.port ?? ''))
    }

    const handleSelectPodAsTarget = (pod: KubePod, port?: number) => {
        setTargetHost(buildPodDnsName(pod))
        if (port !== undefined) setTargetPort(String(port))
    }

    // Derived state
    const isIPAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(targetHost)
    const canRun = !!selectedPod && !!targetHost && !!selectedContainer && !running

    const fromLabel = selectedPod
        ? `${selectedPod.metadata.name} (${selectedPod.metadata.namespace ?? selectedNamespace ?? '?'})`
        : null
    const toLabel = targetHost
        ? `${targetHost}${targetPort ? ':' + targetPort : ''}${mode === 'manual' && protocol === 'curl' && targetPath ? targetPath : ''}`
        : null

    const previewCmd = canRun
        ? (mode === 'diagnose'
            ? `nslookup ${targetHost} → nc -zv ${targetHost} ${targetPort || '80'} → curl http://${toLabel}${targetPath || '/'}`
            : buildCommand(protocol, targetHost, targetPort, protocol === 'curl' ? targetPath : '').join(' ')
        )
        : null

    // ── Run diagnose ──────────────────────────────────────────────────────────

    const runDiagnose = useCallback(async () => {
        if (!canRun) return
        setRunning(true)

        const steps = buildDiagSteps(targetHost, targetPort, targetPath, isIPAddress)
        const run: DiagRun = {
            id: nextId(),
            timestamp: new Date(),
            from: fromLabel!,
            to: toLabel!,
            steps,
            done: false,
        }
        activeDiagRef.current = run
        setActiveDiag({ ...run })

        const ns = selectedPod!.metadata.namespace || 'default'
        const podName = selectedPod!.metadata.name
        let dnsOk = true

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i]

            // Update step to running
            steps[i] = { ...step, status: 'running' }
            setActiveDiag({ ...run, steps: [...steps] })

            // Skip TCP/HTTP if DNS failed and host is not an IP
            if (step.key !== 'dns' && !dnsOk && !isIPAddress) {
                steps[i] = { ...step, status: 'skipped', output: '', durationMs: 0 }
                setActiveDiag({ ...run, steps: [...steps] })
                continue
            }

            const t0 = Date.now()
            try {
                const { stdout, exitCode } = await window.kubectl.execCommand(
                    selectedContext!, ns, podName, selectedContainer, step.cmd
                )
                const durationMs = Date.now() - t0
                const success = exitCode === 0
                if (step.key === 'dns' && !success) dnsOk = false
                steps[i] = { ...step, status: success ? 'success' : 'failed', output: stdout, durationMs }
            } catch (err) {
                const durationMs = Date.now() - t0
                if (step.key === 'dns') dnsOk = false
                steps[i] = { ...step, status: 'failed', output: (err as Error).message, durationMs }
            }

            setActiveDiag({ ...run, steps: [...steps] })
        }

        const finished: DiagRun = { ...run, steps: [...steps], done: true }
        setActiveDiag(null)
        setDiagHistory(prev => [finished, ...prev].slice(0, 20))
        setRunning(false)
    }, [canRun, targetHost, targetPort, targetPath, isIPAddress, selectedPod, selectedContainer, selectedContext, fromLabel, toLabel])

    // ── Run manual ────────────────────────────────────────────────────────────

    const runManual = useCallback(async () => {
        if (!canRun) return
        setRunning(true)

        const cmd = buildCommand(protocol, targetHost, targetPort, protocol === 'curl' ? targetPath : '')
        const ns = selectedPod!.metadata.namespace || 'default'
        const t0 = Date.now()

        try {
            const { stdout, exitCode } = await window.kubectl.execCommand(
                selectedContext!, ns, selectedPod!.metadata.name, selectedContainer, cmd
            )
            setManualHistory(prev => [{
                id: nextId(), timestamp: new Date(),
                cmd, from: fromLabel!, to: toLabel!,
                output: stdout, exitCode, durationMs: Date.now() - t0,
            }, ...prev].slice(0, 20))
        } catch (err) {
            setManualHistory(prev => [{
                id: nextId(), timestamp: new Date(),
                cmd, from: fromLabel!, to: toLabel!,
                output: (err as Error).message, exitCode: 1, durationMs: Date.now() - t0,
            }, ...prev].slice(0, 20))
        } finally {
            setRunning(false)
        }
    }, [canRun, protocol, targetHost, targetPort, targetPath, selectedPod, selectedContainer, selectedContext, fromLabel, toLabel])

    const handleRun = mode === 'diagnose' ? runDiagnose : runManual

    // Enter key to run
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canRun) handleRun()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [handleRun, canRun])

    const history = mode === 'diagnose' ? diagHistory : manualHistory

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-[hsl(var(--bg-dark))] overflow-hidden transition-colors duration-200">

            <PageHeader
        title="Connectivity Tester"
        subtitle="Diagnostic network troubleshooting and latency analysis"
      />

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {/* Source + Target */}
                <div className="grid grid-cols-2 gap-4">

                    {/* Source pod */}
                    <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.03] p-5 space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 9h6M9 12h6M9 15h4" /></svg>
                            </div>
                            <h2 className="text-[11px] font-black text-slate-800 dark:text-slate-300 uppercase tracking-widest">Source Pod</h2>
                            <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-600 font-mono">{filteredPods.length} running</span>
                        </div>

                        {/* Pod search */}
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                            <input
                                type="text"
                                placeholder="Filter pods…"
                                value={searchPod}
                                onChange={e => setSearchPod(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all"
                            />
                        </div>

                        {/* Pod list */}
                        <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                            {filteredPods.length === 0 ? (
                                <p className="text-center py-8 text-xs text-slate-600 italic">No running pods found</p>
                            ) : filteredPods.map(pod => (
                                <button
                                    key={pod.metadata.uid}
                                    onClick={() => handleSelectPod(pod)}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all ${selectedPod?.metadata.uid === pod.metadata.uid
                                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-300 shadow-sm shadow-blue-500/10'
                                        : 'border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10 bg-white dark:bg-white/[0.02] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 shadow-sm'
                                        }`}
                                >
                                    <span className="text-xs font-mono font-bold truncate">{pod.metadata.name}</span>
                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                        {pod.metadata.namespace && selectedNamespace === '_all' && (
                                            <span className="text-[9px] text-slate-600 font-mono">{pod.metadata.namespace}</span>
                                        )}
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Container select */}
                        {containers.length > 1 && (
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Container</label>
                                <select
                                    value={selectedContainer}
                                    onChange={e => setSelectedContainer(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-300 focus:outline-none focus:border-blue-500/50 transition-all"
                                >
                                    {containers.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Target */}
                    <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.03] p-5 space-y-4 shadow-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" /><line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" /></svg>
                            </div>
                            <h2 className="text-[11px] font-black text-slate-800 dark:text-slate-300 uppercase tracking-widest">Target</h2>
                        </div>

                        {/* Picker tab toggle */}
                        <div className="flex rounded-lg border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.03] p-0.5 gap-0.5">
                            {(['services', 'pods'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setTargetPickerTab(tab)}
                                    className={`flex-1 py-1 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${targetPickerTab === tab
                                        ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm dark:shadow-none'
                                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                                        }`}
                                >
                                    {tab === 'services' ? 'Services' : 'Pods'}
                                </button>
                            ))}
                        </div>

                        {/* Service picker */}
                        {targetPickerTab === 'services' && (
                            <div>
                                <div className="relative mb-2">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                                    <input
                                        type="text"
                                        placeholder="Filter services…"
                                        value={searchSvc}
                                        onChange={e => setSearchSvc(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all"
                                    />
                                </div>
                                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                                    {filteredSvcs.map(svc => {
                                        const ports = svc.spec.ports ?? []
                                        return (
                                            <div key={svc.metadata.uid} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-100 dark:border-white/5 bg-white dark:bg-white/[0.02] hover:border-slate-200 dark:hover:border-white/10 transition-all group shadow-sm">
                                                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 truncate flex-1 transition-colors">{svc.metadata.name}</span>
                                                {svc.metadata.namespace && selectedNamespace === '_all' && (
                                                    <span className="text-[9px] text-slate-600 font-mono shrink-0">{svc.metadata.namespace}</span>
                                                )}
                                                <div className="flex gap-1 shrink-0">
                                                    {ports.slice(0, 3).map(p => (
                                                        <button
                                                            key={p.port}
                                                            onClick={() => handleSelectService(svc, p.port)}
                                                            className="px-1.5 py-0.5 text-[9px] font-black rounded bg-slate-800 hover:bg-blue-500/20 hover:text-blue-300 text-slate-400 transition-all font-mono"
                                                            title={p.name ?? String(p.port)}
                                                        >
                                                            {p.port}
                                                        </button>
                                                    ))}
                                                    {ports.length === 0 && (
                                                        <button
                                                            onClick={() => handleSelectService(svc)}
                                                            className="px-1.5 py-0.5 text-[9px] font-black rounded bg-slate-800 hover:bg-blue-500/20 hover:text-blue-300 text-slate-400 transition-all"
                                                        >
                                                            Use
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {filteredSvcs.length === 0 && (
                                        <p className="text-center py-4 text-[10px] text-slate-600 italic">No services found</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Pod hostname picker */}
                        {targetPickerTab === 'pods' && (
                            <div>
                                <div className="relative mb-2">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                                    <input
                                        type="text"
                                        placeholder="Filter pods…"
                                        value={searchTargetPod}
                                        onChange={e => setSearchTargetPod(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all"
                                    />
                                </div>
                                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                    {filteredTargetPods.length === 0 && (
                                        <p className="text-center py-4 text-[10px] text-slate-600 italic">No running pods with IP found</p>
                                    )}
                                    {filteredTargetPods.map(pod => {
                                        const hostname = buildPodDnsName(pod)
                                        const ports = podContainerPorts(pod)
                                        return (
                                            <div key={pod.metadata.uid} className="px-3 py-2 rounded-xl border border-slate-100 dark:border-white/5 bg-white dark:bg-white/[0.02] hover:border-slate-200 dark:hover:border-white/10 transition-all shadow-sm">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                    <span className="text-[11px] font-mono font-bold text-slate-800 dark:text-slate-300 truncate flex-1">{pod.metadata.name}</span>
                                                    {pod.metadata.namespace && selectedNamespace === '_all' && (
                                                        <span className="text-[9px] text-slate-600 font-mono shrink-0">{pod.metadata.namespace}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1.5 pl-3">
                                                    <code className="text-[9px] font-mono text-slate-500 truncate flex-1" title={hostname}>{hostname}</code>
                                                    {/* Copy hostname */}
                                                    <button
                                                        onClick={() => navigator.clipboard.writeText(hostname)}
                                                        className="shrink-0 p-1 rounded hover:bg-white/5 text-slate-600 hover:text-slate-300 transition-colors"
                                                        title="Copy hostname"
                                                    >
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                                    </button>
                                                    {/* Port pills — click to test */}
                                                    {ports.slice(0, 4).map(p => (
                                                        <button
                                                            key={p}
                                                            onClick={() => handleSelectPodAsTarget(pod, p)}
                                                            className="px-1.5 py-0.5 text-[9px] font-black rounded bg-slate-800 hover:bg-emerald-500/20 hover:text-emerald-300 text-slate-400 transition-all font-mono"
                                                            title={`Test port ${p}`}
                                                        >
                                                            {p}
                                                        </button>
                                                    ))}
                                                    {ports.length === 0 && (
                                                        <button
                                                            onClick={() => handleSelectPodAsTarget(pod)}
                                                            className="px-1.5 py-0.5 text-[9px] font-black rounded bg-slate-800 hover:bg-emerald-500/20 hover:text-emerald-300 text-slate-400 transition-all"
                                                        >
                                                            Use
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                                <p className="mt-1.5 text-[9px] text-slate-400 dark:text-slate-700 font-mono">format: &lt;pod-ip-dashes&gt;.&lt;ns&gt;.pod.cluster.local</p>
                            </div>
                        )}

                        <div className="border-t border-slate-100 dark:border-white/5 pt-4 space-y-3">
                            {/* Manual host + port */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Hostname or IP</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. my-svc.ns.svc.cluster.local"
                                        value={targetHost}
                                        onChange={e => setTargetHost(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Port</label>
                                    <input
                                        type="text"
                                        placeholder="80"
                                        value={targetPort}
                                        onChange={e => setTargetPort(e.target.value)}
                                        disabled={mode === 'manual' && protocol === 'ping'}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-all disabled:opacity-40"
                                    />
                                </div>
                            </div>

                            {/* Path (curl / diagnose HTTP step) */}
                            {(mode === 'diagnose' || protocol === 'curl') && (
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">HTTP Path</label>
                                    <input
                                        type="text"
                                        placeholder="/healthz"
                                        value={targetPath}
                                        onChange={e => setTargetPath(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-all"
                                    />
                                </div>
                            )}

                            {/* Protocol (manual only) */}
                            {mode === 'manual' && (
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Tool</label>
                                    <div className="flex gap-2">
                                        {(['curl', 'nc', 'ping'] as Protocol[]).map(p => (
                                            <button
                                                key={p}
                                                onClick={() => setProtocol(p)}
                                                className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg border transition-all ${protocol === p
                                                    ? 'border-blue-500/60 bg-blue-500/15 text-blue-600 dark:text-blue-300'
                                                    : 'border-slate-100 dark:border-white/5 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 hover:border-slate-200 dark:hover:border-white/10'
                                                    }`}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* FROM → TO bar */}
                {fromLabel && toLabel && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-xs font-mono shadow-sm">
                        <span className="text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-widest shrink-0">From</span>
                        <span className="text-blue-600 dark:text-blue-300 truncate">{fromLabel}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300 dark:text-slate-600 shrink-0"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                        <span className="text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-widest shrink-0">To</span>
                        <span className="text-emerald-600 dark:text-emerald-300 truncate">{toLabel}</span>
                    </div>
                )}

                {/* Mode + Run */}
                <div className="flex items-center gap-3">
                    {/* Mode toggle */}
                    <div className="flex rounded-xl border border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-white/[0.03] p-1 gap-1">
                        {(['diagnose', 'manual'] as Mode[]).map(m => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${mode === m
                                    ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm dark:shadow-none'
                                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                                    }`}
                            >
                                {m === 'diagnose' ? '⚡ Diagnose' : '⌨ Manual'}
                            </button>
                        ))}
                    </div>

                    {/* Run button */}
                    <button
                        onClick={handleRun}
                        disabled={!canRun}
                        className="flex items-center gap-2 px-6 py-2.5 text-xs font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                    >
                        {running
                            ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                        }
                        {running ? 'Running…' : mode === 'diagnose' ? 'Diagnose' : 'Run'}
                    </button>

                    <span className="text-[10px] text-slate-600 ml-auto">⌘↵ to run</span>
                </div>

                {/* Command preview */}
                {previewCmd && (
                    <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/[0.04]">
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest shrink-0 mt-0.5">CMD</span>
                        <code className="text-[10px] text-slate-600 dark:text-slate-400 font-mono break-all leading-relaxed">{previewCmd}</code>
                    </div>
                )}

                {/* Mode description */}
                {!fromLabel && !toLabel && (
                    <div className="rounded-xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.02] px-5 py-4 shadow-sm">
                        {mode === 'diagnose' ? (
                            <div className="space-y-2">
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-300">Diagnose mode runs three checks in sequence:</p>
                                <div className="space-y-1 text-[11px] text-slate-500">
                                    <div className="flex items-center gap-2"><span className="text-slate-400 dark:text-slate-600 font-mono w-4">1.</span> <strong className="text-slate-600 dark:text-slate-400">DNS</strong> — nslookup resolves the hostname</div>
                                    <div className="flex items-center gap-2"><span className="text-slate-400 dark:text-slate-600 font-mono w-4">2.</span> <strong className="text-slate-600 dark:text-slate-400">TCP</strong> — nc checks if the port is open</div>
                                    <div className="flex items-center gap-2"><span className="text-slate-400 dark:text-slate-600 font-mono w-4">3.</span> <strong className="text-slate-600 dark:text-slate-400">HTTP</strong> — curl checks the HTTP response code</div>
                                </div>
                                <p className="text-[10px] text-slate-400 dark:text-slate-600">Pick a pod, click a service port, then hit Diagnose.</p>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500">Manual mode runs a single command (curl / nc / ping) and shows the full output. Useful when you need verbose details.</p>
                        )}
                    </div>
                )}

                {/* Active diagnose in progress */}
                {activeDiag && <DiagRunCard run={activeDiag} />}

                {/* History */}
                {history.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">History</span>
                            <button
                                onClick={() => mode === 'diagnose' ? setDiagHistory([]) : setManualHistory([])}
                                className="text-[10px] text-slate-600 hover:text-red-400 transition-colors font-bold uppercase tracking-wider"
                            >
                                Clear
                            </button>
                        </div>
                        {mode === 'diagnose'
                            ? diagHistory.map(r => <DiagRunCard key={r.id} run={r} />)
                            : manualHistory.map(r => <ManualRunCard key={r.id} run={r} />)
                        }
                    </div>
                )}
            </div>
        </div>
    )
}
