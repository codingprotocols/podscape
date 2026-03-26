import React, { useEffect, useState, useMemo } from 'react'
import type { KubePod, KubeEvent } from '../../types'
import { formatAge } from '../../types'
import { AlertCircle, History, Zap, ShieldAlert, Activity } from 'lucide-react'

interface Props {
    pod: KubePod
}

export default function PodRestartAnalyzer({ pod }: Props): JSX.Element {
    const [events, setEvents] = useState<KubeEvent[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        let mounted = true
        const fetchEvents = async () => {
            setLoading(true)
            try {
                // Fetch events specifically for this pod
                const podEvents = await (window as any).kubectl.getResourceEvents(
                    (window as any).selectedContext,
                    pod.metadata.namespace,
                    'Pod',
                    pod.metadata.name
                )
                if (mounted) setEvents(podEvents)
            } catch (err) {
                console.error('[PodRestartAnalyzer] Failed to fetch events:', err)
            } finally {
                if (mounted) setLoading(false)
            }
        }

        fetchEvents()
        return () => { mounted = false }
    }, [pod.metadata.name, pod.metadata.namespace])

    const diagnostics = useMemo(() => {
        if (loading) return []
        const findings: { type: 'error' | 'warning' | 'info'; title: string; message: string; icon: React.ReactNode }[] = []

        // 1. Check Container Statuses for Terminated states
        pod.status.containerStatuses?.forEach(cs => {
            const term = cs.lastState?.terminated || cs.state.terminated
            if (term) {
                if (term.reason === 'OOMKilled') {
                    findings.push({
                        type: 'error',
                        title: `Memory Limit Exceeded (${cs.name})`,
                        message: 'Container was killed by the kernel because it exceeded its memory limit. Consider increasing resource limits.',
                        icon: <ShieldAlert className="w-4 h-4 text-red-500" />
                    })
                } else if (term.exitCode !== 0) {
                    findings.push({
                        type: 'warning',
                        title: `Application Crash (${cs.name})`,
                        message: `Container exited with non-zero exit code ${term.exitCode}. Check application logs for stack traces.`,
                        icon: <Activity className="w-4 h-4 text-amber-500" />
                    })
                }
            }
        })

        // 2. Correlate with Events
        events.forEach(e => {
            if (e.reason === 'Unhealthy') {
                findings.push({
                    type: 'warning',
                    title: 'Probe Failure',
                    message: e.message || 'Liveness/Readiness probe failed, causing a restart.',
                    icon: <Zap className="w-4 h-4 text-amber-500" />
                })
            } else if (e.reason === 'BackOff') {
                findings.push({
                    type: 'error',
                    title: 'CrashLoopBackOff',
                    message: 'Pod is in a crash loop. Kubernetes is delaying restarts to avoid excessive load.',
                    icon: <ShieldAlert className="w-4 h-4 text-red-500" />
                })
            }
        })

        return findings
    }, [pod.status.containerStatuses, events])

    return (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Diagnostic Summary */}
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <AlertCircle className="w-4 h-4 text-blue-500" />
                    <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Diagnostic Summary</h4>
                </div>

                <div className="grid gap-3">
                    {diagnostics.length === 0 ? (
                        <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-500/80 text-[11px] font-medium flex items-center gap-3">
                            <Zap className="w-4 h-4" />
                            Everything looks stable! No unusual restart reasons detected.
                        </div>
                    ) : (
                        diagnostics.map((f, i) => (
                            <div key={i} className={`p-4 rounded-2xl border flex gap-4 transition-all hover:translate-x-1 ${f.type === 'error' ? 'bg-red-500/5 border-red-500/10' : 'bg-amber-500/5 border-amber-500/10'
                                }`}>
                                <div className="shrink-0 mt-1">{f.icon}</div>
                                <div>
                                    <h5 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider mb-1">{f.title}</h5>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{f.message}</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>

            {/* Restart History */}
            <section>
                <div className="flex items-center gap-2 mb-4">
                    <History className="w-4 h-4 text-blue-500" />
                    <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Last Termination States</h4>
                </div>

                <div className="space-y-3">
                    {pod.status.containerStatuses?.map(cs => (
                        <div key={cs.name} className="bg-slate-50/50 dark:bg-white/[0.03] p-4 rounded-2xl border border-slate-100 dark:border-white/5">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[11px] font-black text-slate-900 dark:text-white font-mono uppercase">{cs.name}</span>
                                <span className="text-[10px] font-bold text-slate-400">{cs.restartCount} total restarts</span>
                            </div>

                            {cs.lastState?.terminated ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <dt className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-tighter mb-1">Reason</dt>
                                        <dd className={`text-[10px] font-black ${cs.lastState.terminated.reason === 'OOMKilled' ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                            {cs.lastState.terminated.reason}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-tighter mb-1">Exit Code</dt>
                                        <dd className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">{cs.lastState.terminated.exitCode}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-tighter mb-1">Finished At</dt>
                                        <dd className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                            {cs.lastState.terminated.finishedAt ? formatAge(cs.lastState.terminated.finishedAt) + ' ago' : '—'}
                                        </dd>
                                    </div>
                                    {cs.lastState.terminated.message && (
                                        <div className="col-span-2">
                                            <dt className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-tighter mb-1">Message</dt>
                                            <dd className="text-[10px] text-slate-500 dark:text-slate-400 italic bg-white/5 p-2 rounded-lg mt-1 truncate">
                                                {cs.lastState.terminated.message}
                                            </dd>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-[10px] text-slate-500 font-medium">No previous termination state recorded.</p>
                            )}
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}
