import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'

import { useAppStore } from '../../store'
import PageHeader from '../core/PageHeader'
import type { KubePod, KubeService, KubeNetworkPolicy, KubeEndpoints, NetworkPolicyIngressRule, NetworkPolicyEgressRule } from '../../types'
import { isMac } from '../../utils/platform'

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
    // Fields used by FailureAnalysis — populated at run time
    sourcePod?: KubePod
    sourceContext?: string
    targetHost?: string         // raw hostname without port
    targetNamespace?: string    // parsed from SVC/Pod DNS, if available
    targetServiceName?: string  // parsed from <svc>.<ns>.svc.cluster.local, if available
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
    const ip = pod.status.podIP
    if (!ip) return ''
    const ns = pod.metadata.namespace ?? 'default'
    return `${ip.replace(/\./g, '-')}.${ns}.pod.cluster.local`
}

export function podContainerPorts(pod: KubePod): number[] {
    const ports = new Set<number>()
    for (const c of pod.spec.containers) {
        for (const p of c.ports ?? []) {
            ports.add(p.containerPort)
        }
    }
    return [...ports].sort((a, b) => a - b)
}

export function buildDiagSteps(host: string, port: string, path: string, skipDns: boolean): DiagStep[] {
    const url = `http://${host}${port ? ':' + port : ''}${path || '/'}`
    const steps: DiagStep[] = []

    if (!skipDns) {
        steps.push({
            key: 'dns', label: 'DNS Resolution', status: 'idle', output: '', durationMs: 0,
            cmd: ['nslookup', '-timeout=5', host],
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

// ─── Failure-analysis helpers ─────────────────────────────────────────────────

/** Parse `<svc>.<ns>.svc.cluster.local` → { name, namespace } */
function parseSvcDns(host: string): { name: string; namespace: string } | null {
    const p = host.split('.')
    if (p.length >= 5 && p[2] === 'svc' && p[3] === 'cluster' && p[4] === 'local') {
        return { name: p[0], namespace: p[1] }
    }
    return null
}

/** Parse `<ip-dashes>.<ns>.pod.cluster.local` → { namespace } */
function parsePodDns(host: string): { namespace: string } | null {
    const p = host.split('.')
    if (p.length >= 5 && p[2] === 'pod' && p[3] === 'cluster' && p[4] === 'local') {
        return { namespace: p[1] }
    }
    return null
}

/** Does a podSelector matchLabels match the given pod labels?
 *  An empty/absent matchLabels selects ALL pods in the namespace. */
function labelsMatchSelector(
    selector: { matchLabels?: Record<string, string> } | undefined,
    labels: Record<string, string>
): boolean {
    if (!selector?.matchLabels || Object.keys(selector.matchLabels).length === 0) return true
    return Object.entries(selector.matchLabels).every(([k, v]) => labels[k] === v)
}

function describeRuleFrom(rule: NetworkPolicyIngressRule): string {
    if (!rule.from || rule.from.length === 0) return 'any source'
    return rule.from.map(peer => {
        if (peer.ipBlock) return `IP ${peer.ipBlock.cidr}`
        const ns = peer.namespaceSelector?.matchLabels
            ? Object.entries(peer.namespaceSelector.matchLabels).map(([k, v]) => `${k}=${v}`).join(',')
            : peer.namespaceSelector ? 'any namespace' : null
        const pod = peer.podSelector?.matchLabels
            ? Object.entries(peer.podSelector.matchLabels).map(([k, v]) => `${k}=${v}`).join(',')
            : peer.podSelector ? 'any pod' : null
        if (ns && pod) return `pods {${pod}} in ns {${ns}}`
        if (ns) return `namespace {${ns}}`
        if (pod) return `pods {${pod}}`
        return 'same namespace'
    }).join(', ')
}

function describeRuleTo(rule: NetworkPolicyEgressRule): string {
    if (!rule.to || rule.to.length === 0) return 'any destination'
    return rule.to.map(peer => {
        if (peer.ipBlock) return `IP ${peer.ipBlock.cidr}`
        const ns = peer.namespaceSelector?.matchLabels
            ? Object.entries(peer.namespaceSelector.matchLabels).map(([k, v]) => `${k}=${v}`).join(',')
            : peer.namespaceSelector ? 'any namespace' : null
        const pod = peer.podSelector?.matchLabels
            ? Object.entries(peer.podSelector.matchLabels).map(([k, v]) => `${k}=${v}`).join(',')
            : peer.podSelector ? 'any pod' : null
        if (ns && pod) return `pods {${pod}} in ns {${ns}}`
        if (ns) return `namespace {${ns}}`
        if (pod) return `pods {${pod}}`
        return 'same namespace'
    }).join(', ')
}

function describeRulePorts(ports: NetworkPolicyIngressRule['ports']): string {
    if (!ports || ports.length === 0) return 'all ports'
    return ports.map(p => p.port
        ? `${p.port}${p.endPort ? `–${p.endPort}` : ''}${p.protocol && p.protocol !== 'TCP' ? '/' + p.protocol : ''}`
        : 'all ports'
    ).join(', ')
}

function isIngressRestricted(np: KubeNetworkPolicy): boolean {
    const types = np.spec.policyTypes ?? []
    return types.includes('Ingress') || (types.length === 0 && np.spec.ingress !== undefined)
}

function isEgressRestricted(np: KubeNetworkPolicy): boolean {
    const types = np.spec.policyTypes ?? []
    return types.includes('Egress') || (types.length === 0 && np.spec.egress !== undefined)
}

// ─── FailureAnalysis component ────────────────────────────────────────────────

interface FailureAnalysisData {
    targetNetpols: KubeNetworkPolicy[]
    sourceNetpols: KubeNetworkPolicy[]
    endpoints: KubeEndpoints | null
}

function FailureAnalysis({ run }: { run: DiagRun }) {
    const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
    const [data, setData] = useState<FailureAnalysisData | null>(null)
    const [err, setErr] = useState('')

    if (!run.sourceContext || !run.sourcePod || !run.targetHost) return null

    const { sourceContext, sourcePod, targetHost, targetNamespace, targetServiceName } = run
    const sourceNs = sourcePod.metadata.namespace ?? 'default'
    const sourcePodLabels = sourcePod.metadata.labels ?? {}

    const analyze = async () => {
        setState('loading')
        try {
            const [targetNpRaw, sourceNpRaw, endpointRaw] = await Promise.all([
                targetNamespace
                    ? window.kubectl.getNetworkPolicies(sourceContext, targetNamespace)
                    : Promise.resolve([]),
                window.kubectl.getNetworkPolicies(sourceContext, sourceNs),
                targetNamespace && targetServiceName
                    ? window.kubectl.getEndpoints(sourceContext, targetNamespace)
                    : Promise.resolve([]),
            ])
            const targetNetpols = targetNpRaw as KubeNetworkPolicy[]
            const sourceNetpols = sourceNpRaw as KubeNetworkPolicy[]
            const allEp = endpointRaw as KubeEndpoints[]
            const endpoints = targetServiceName
                ? allEp.find(e => e.metadata.name === targetServiceName) ?? null
                : null
            setData({ targetNetpols, sourceNetpols, endpoints })
            setState('done')
        } catch (e) {
            setErr((e as Error).message)
            setState('error')
        }
    }

    if (state === 'idle') {
        return (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
                <button
                    onClick={analyze}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-500 hover:text-amber-400 transition-colors"
                >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                    Investigate Failure
                </button>
            </div>
        )
    }

    if (state === 'loading') {
        return (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center gap-2 text-[10px] text-slate-500">
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                Fetching network policies and endpoints…
            </div>
        )
    }

    if (state === 'error') {
        return (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 text-[10px] text-red-400">
                Analysis failed: {err}
            </div>
        )
    }

    const { targetNetpols, sourceNetpols, endpoints } = data!

    // NetworkPolicies that restrict INGRESS and select the target pods
    const ingressPols = targetNetpols.filter(np => isIngressRestricted(np))
    // NetworkPolicies that restrict EGRESS and select the source pod
    const egressPols = sourceNetpols.filter(np =>
        isEgressRestricted(np) && labelsMatchSelector(np.spec.podSelector, sourcePodLabels)
    )

    // Endpoint stats
    const readyCount = endpoints?.subsets?.reduce((n, s) => n + (s.addresses?.length ?? 0), 0) ?? null
    const notReadyCount = endpoints?.subsets?.reduce((n, s) => n + (s.notReadyAddresses?.length ?? 0), 0) ?? null
    const readyPodNames = endpoints?.subsets?.flatMap(s =>
        (s.addresses ?? []).map(a => a.targetRef?.name).filter(Boolean)
    ) ?? []

    const failedSteps = run.steps.filter(s => s.status === 'failed').map(s => s.key)

    return (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 space-y-4 text-[11px]">
            <div className="flex items-center gap-1.5 font-black text-[10px] uppercase tracking-widest text-amber-500">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                Failure Analysis
            </div>

            {/* ── DNS hint ── */}
            {failedSteps.includes('dns') && (
                <div className="px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px]">
                    <strong>DNS failed</strong> — check that the service name and namespace are correct.
                    {targetNamespace && <span> Expected namespace: <code className="font-mono">{targetNamespace}</code>.</span>}
                    {' '}NetworkPolicies do not affect DNS resolution.
                </div>
            )}

            {/* ── Endpoints ── */}
            {endpoints !== null && (
                <div>
                    <p className="text-[10px] font-black text-slate-500 dark:text-slate-600 uppercase tracking-widest mb-1.5">
                        Endpoints — {targetServiceName}
                    </p>
                    {readyCount === 0 && notReadyCount === 0 ? (
                        <div className="px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/15 text-red-400 text-[10px] font-bold">
                            No endpoints — no pods match the service selector. Check the service's podSelector and that matching pods are Running.
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <span className={`flex items-center gap-1.5 text-[10px] font-bold ${readyCount! > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                {readyCount} ready{readyPodNames.length > 0 && ` (${readyPodNames.slice(0, 3).join(', ')}${readyPodNames.length > 3 ? '…' : ''})`}
                            </span>
                            {notReadyCount! > 0 && (
                                <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                                    {notReadyCount} not-ready
                                </span>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Target ingress NetworkPolicies ── */}
            <div>
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-600 uppercase tracking-widest mb-1.5">
                    Ingress NetworkPolicies
                    {targetNamespace && <span className="normal-case font-normal text-slate-400"> (namespace: {targetNamespace})</span>}
                </p>
                {!targetNamespace && (
                    <p className="text-[10px] text-slate-500 italic">Cannot determine target namespace from this hostname.</p>
                )}
                {targetNamespace && ingressPols.length === 0 && (
                    <p className="text-[10px] text-slate-400">No ingress NetworkPolicies found — inbound traffic is unrestricted by policy.</p>
                )}
                <div className="space-y-1.5">
                    {ingressPols.map(np => {
                        const selectorDesc = !np.spec.podSelector?.matchLabels || Object.keys(np.spec.podSelector.matchLabels).length === 0
                            ? 'all pods'
                            : Object.entries(np.spec.podSelector.matchLabels).map(([k, v]) => `${k}=${v}`).join(', ')
                        const hasRules = np.spec.ingress && np.spec.ingress.length > 0
                        const isDenyAll = !hasRules
                        return (
                            <div key={np.metadata.uid} className={`px-3 py-2 rounded-lg border text-[10px] ${isDenyAll ? 'bg-red-500/5 border-red-500/15' : 'bg-slate-50 dark:bg-white/[0.02] border-slate-100 dark:border-white/5'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={isDenyAll ? 'text-red-400' : 'text-slate-500'}>
                                        {isDenyAll ? '✗' : '≈'}
                                    </span>
                                    <span className="font-black font-mono text-slate-700 dark:text-slate-300">{np.metadata.name}</span>
                                    <span className="text-slate-400">selects: <code className="font-mono">{selectorDesc}</code></span>
                                </div>
                                {isDenyAll ? (
                                    <p className="text-red-400 ml-4">Denies ALL ingress (no rules defined)</p>
                                ) : (
                                    <div className="ml-4 space-y-0.5">
                                        {np.spec.ingress!.map((rule, i) => (
                                            <p key={i} className="text-slate-500 dark:text-slate-400">
                                                Allow from <span className="text-slate-700 dark:text-slate-300 font-semibold">{describeRuleFrom(rule)}</span>
                                                {' '}on <span className="text-slate-700 dark:text-slate-300 font-semibold">{describeRulePorts(rule.ports)}</span>
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* ── Source egress NetworkPolicies ── */}
            <div>
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-600 uppercase tracking-widest mb-1.5">
                    Egress NetworkPolicies
                    <span className="normal-case font-normal text-slate-400"> (source namespace: {sourceNs})</span>
                </p>
                {egressPols.length === 0 ? (
                    <p className="text-[10px] text-slate-400">No egress NetworkPolicies apply to this pod — outbound traffic is unrestricted.</p>
                ) : (
                    <div className="space-y-1.5">
                        {egressPols.map(np => {
                            const hasRules = np.spec.egress && np.spec.egress.length > 0
                            const isDenyAll = !hasRules
                            return (
                                <div key={np.metadata.uid} className={`px-3 py-2 rounded-lg border text-[10px] ${isDenyAll ? 'bg-red-500/5 border-red-500/15' : 'bg-slate-50 dark:bg-white/[0.02] border-slate-100 dark:border-white/5'}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={isDenyAll ? 'text-red-400' : 'text-slate-500'}>
                                            {isDenyAll ? '✗' : '≈'}
                                        </span>
                                        <span className="font-black font-mono text-slate-700 dark:text-slate-300">{np.metadata.name}</span>
                                    </div>
                                    {isDenyAll ? (
                                        <p className="text-red-400 ml-4">Denies ALL egress (no rules defined)</p>
                                    ) : (
                                        <div className="ml-4 space-y-0.5">
                                            {np.spec.egress!.map((rule, i) => (
                                                <p key={i} className="text-slate-500 dark:text-slate-400">
                                                    Allow to <span className="text-slate-700 dark:text-slate-300 font-semibold">{describeRuleTo(rule)}</span>
                                                    {' '}on <span className="text-slate-700 dark:text-slate-300 font-semibold">{describeRulePorts(rule.ports)}</span>
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

// ─── Step runner (exported for tests) ────────────────────────────────────────

export type ExecFn = (cmd: string[]) => Promise<{ stdout: string; exitCode: number }>

/** Runs a DiagStep[] array sequentially against a cluster.
 *  `allowSkipOnDnsFail`: when true, TCP/HTTP steps are skipped if the DNS step fails
 *  (use false for IP targets where there is no DNS step).
 */
export async function runSteps(
    steps: DiagStep[],
    execFn: ExecFn,
    onStepUpdate: (steps: DiagStep[]) => void,
    cancelledRef: { current: boolean },
    allowSkipOnDnsFail: boolean
): Promise<DiagStep[]> {
    const result = steps.map(s => ({ ...s }))
    let dnsOk = true

    for (let i = 0; i < result.length; i++) {
        if (cancelledRef.current) {
            result[i] = { ...result[i], status: 'skipped' }
            onStepUpdate([...result])
            continue
        }

        const step = result[i]
        result[i] = { ...step, status: 'running' }
        onStepUpdate([...result])

        if (step.key !== 'dns' && !dnsOk && allowSkipOnDnsFail) {
            result[i] = { ...step, status: 'skipped', output: '', durationMs: 0 }
            onStepUpdate([...result])
            continue
        }

        const t0 = Date.now()
        try {
            const { stdout, exitCode } = await execFn(step.cmd)
            const durationMs = Date.now() - t0
            const success = exitCode === 0
            if (step.key === 'dns' && !success) dnsOk = false
            result[i] = { ...step, status: success ? 'success' : 'failed', output: stdout, durationMs }
        } catch (err) {
            const durationMs = Date.now() - t0
            if (step.key === 'dns') dnsOk = false
            result[i] = { ...step, status: 'failed', output: (err as Error).message, durationMs }
        }
        onStepUpdate([...result])
    }

    return result
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
                {allDone && anyFailed && <FailureAnalysis run={run} />}
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
    const [fetchError, setFetchError] = useState<string | null>(null)

    const idRef = useRef(0)
    const nextId = () => { idRef.current += 1; return idRef.current }
    const cancelledRef = useRef(false)

    // Fetch pods + services on context/namespace change
    useEffect(() => {
        if (!selectedContext) return
        let cancelled = false
        const nsArg = selectedNamespace === '_all' ? null : selectedNamespace
        setFetchError(null)
        Promise.all([
            window.kubectl.getPods(selectedContext, nsArg),
            window.kubectl.getServices(selectedContext, nsArg),
        ]).then(([p, s]) => {
            if (cancelled) return
            setPods(p as KubePod[])
            setServices(s as KubeService[])
        }).catch(err => {
            if (cancelled) return
            setPods([])
            setServices([])
            setFetchError((err as Error).message)
        })
        setSelectedPod(null)
        setSelectedContainer('')
        return () => { cancelled = true }
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

    const previewCmd = useMemo(() => {
        if (!canRun) return null
        if (mode === 'diagnose') {
            return buildDiagSteps(targetHost, targetPort, targetPath, isIPAddress)
                .map(s => s.cmd.join(' ')).join(' → ')
        }
        return buildCommand(protocol, targetHost, targetPort, protocol === 'curl' ? targetPath : '').join(' ')
    }, [canRun, mode, protocol, targetHost, targetPort, targetPath, isIPAddress])

    // ── Run diagnose ──────────────────────────────────────────────────────────

    const runDiagnose = useCallback(async () => {
        if (!canRun) return
        cancelledRef.current = false
        setRunning(true)

        const steps = buildDiagSteps(targetHost, targetPort, targetPath, isIPAddress)
        const svcInfo = parseSvcDns(targetHost)
        const podInfo = !svcInfo ? parsePodDns(targetHost) : null
        const run: DiagRun = {
            id: nextId(),
            timestamp: new Date(),
            from: fromLabel ?? '',
            to: toLabel ?? '',
            steps,
            done: false,
            sourcePod: selectedPod!,
            sourceContext: selectedContext!,
            targetHost,
            targetNamespace: svcInfo?.namespace ?? podInfo?.namespace,
            targetServiceName: svcInfo?.name,
        }
        setActiveDiag({ ...run })

        const ns = selectedPod!.metadata.namespace || 'default'
        const podName = selectedPod!.metadata.name
        const execFn = (cmd: string[]) => window.kubectl.execCommand(
            selectedContext!, ns, podName, selectedContainer, cmd
        )

        const finishedSteps = await runSteps(
            steps, execFn,
            updatedSteps => setActiveDiag({ ...run, steps: updatedSteps }),
            cancelledRef,
            !isIPAddress
        )

        const finished: DiagRun = { ...run, steps: finishedSteps, done: true }
        setActiveDiag(null)
        setDiagHistory(prev => [finished, ...prev].slice(0, 20))
        setRunning(false)
    }, [canRun, targetHost, targetPort, targetPath, isIPAddress, selectedPod, selectedContainer, selectedContext, fromLabel, toLabel]) // eslint-disable-line react-hooks/exhaustive-deps

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
                cmd, from: fromLabel ?? '', to: toLabel ?? '',
                output: stdout, exitCode, durationMs: Date.now() - t0,
            }, ...prev].slice(0, 20))
        } catch (err) {
            setManualHistory(prev => [{
                id: nextId(), timestamp: new Date(),
                cmd, from: fromLabel ?? '', to: toLabel ?? '',
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

                        {/* Fetch error */}
                        {fetchError && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400 text-[10px] font-bold">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                Failed to load: {fetchError}
                            </div>
                        )}

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

                    {running && (
                        <button
                            onClick={() => { cancelledRef.current = true }}
                            className="px-4 py-2.5 text-xs font-black uppercase tracking-widest text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                    )}

                    <span className="text-[10px] text-slate-600 ml-auto">{isMac ? '⌘' : 'Ctrl+'}↵ to run</span>
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
