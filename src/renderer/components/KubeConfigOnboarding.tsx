import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store'

export default function KubeConfigOnboarding(): JSX.Element {
    const { init } = useAppStore()
    const [loading, setLoading] = useState(false)
    const [toolsState, setToolsState] = useState<{ kubectlOk: boolean; helmOk: boolean; kubeconfigOk: boolean } | null>(null)

    const checkTools = async () => {
        setLoading(true)
        try {
            const state = await window.settings.checkTools()
            setToolsState(state)
            if (state.kubectlOk && state.kubeconfigOk) {
                await init()
            }
        } catch (e) {
            console.error('[checkTools] Failed:', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        window.settings.checkTools().then(setToolsState).catch(console.error)
    }, [])

    const handleSelectFile = async () => {
        try {
            const path = await window.kubeconfig.selectPath()
            if (path) {
                await checkTools()
            }
        } catch (e) {
            console.error('[handleSelectFile] Failed:', e)
        }
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen w-full bg-[#020617] text-slate-200 p-12 overflow-y-auto">
            {/* Background elements for premium feel */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]" />
            </div>

            <div className="max-w-5xl w-full z-10">
                {/* Header */}
                <div className="text-center mb-16 animate-in fade-in slide-in-from-top-8 duration-700">
                    <div className="inline-flex items-center justify-center w-24 h-24 rounded-[2rem] premium-gradient mb-8 shadow-[0_20px_50px_rgba(37,99,235,0.3)] rotate-[-4deg] hover:rotate-0 transition-transform duration-500">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                    </div>
                    <h1 className="text-5xl font-black text-white tracking-widest uppercase mb-6 drop-shadow-2xl">
                        Welcome to Podscape
                    </h1>
                    <p className="text-slate-400 text-xl leading-relaxed max-w-2xl mx-auto font-medium">
                        Setup your Kubernetes environment to begin managing clusters with precision and speed.
                    </p>
                </div>

                {/* Steps Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                    {/* Step 1: Install kubectl */}
                    <div className="group relative bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 flex flex-col transition-all duration-500 hover:bg-white/[0.05] hover:border-white/20 hover:translate-y-[-8px] hover:shadow-2xl hover:shadow-blue-500/10 animate-in fade-in slide-in-from-bottom-8 delay-100 duration-700">
                        <div className="absolute top-6 right-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span className="text-8xl font-black italic">1</span>
                        </div>

                        <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-400 mb-6">Step 1</h2>
                        <h3 className="text-2xl font-black text-white mb-4">Install kubectl</h3>
                        <p className="text-slate-400 text-sm leading-relaxed mb-8 font-medium">
                            The Kubernetes command-line tool allows you to run commands against clusters.
                        </p>

                        <div className="mt-auto space-y-4">
                            {toolsState?.kubectlOk ? (
                                <div className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                                    DETECTED
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                        </svg>
                                        NOT FOUND
                                    </div>
                                    <a
                                        href="https://kubernetes.io/docs/tasks/tools/"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center justify-center gap-2 px-6 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all"
                                    >
                                        INSTALL GUIDE
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
                                    </a>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Step 2: Install Helm */}
                    <div className="group relative bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 flex flex-col transition-all duration-500 hover:bg-white/[0.05] hover:border-white/20 hover:translate-y-[-8px] hover:shadow-2xl hover:shadow-indigo-500/10 animate-in fade-in slide-in-from-bottom-8 delay-200 duration-700">
                        <div className="absolute top-6 right-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span className="text-8xl font-black italic">2</span>
                        </div>

                        <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-400 mb-6">Step 2</h2>
                        <h3 className="text-2xl font-black text-white mb-4">Install Helm</h3>
                        <p className="text-slate-400 text-sm leading-relaxed mb-8 font-medium">
                            The package manager for Kubernetes. Required for managing charts and releases.
                        </p>

                        <div className="mt-auto space-y-4">
                            {toolsState?.helmOk ? (
                                <div className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                                    DETECTED
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                        </svg>
                                        NOT FOUND
                                    </div>
                                    <a
                                        href="https://helm.sh/docs/intro/install/"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center justify-center gap-2 px-6 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all"
                                    >
                                        INSTALL GUIDE
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
                                    </a>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Step 3: Configure Path */}
                    <div className="group relative bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 flex flex-col transition-all duration-500 hover:bg-white/[0.05] hover:border-white/20 hover:translate-y-[-8px] hover:shadow-2xl hover:shadow-purple-500/10 animate-in fade-in slide-in-from-bottom-8 delay-300 duration-700">
                        <div className="absolute top-6 right-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span className="text-8xl font-black italic">3</span>
                        </div>

                        <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-400 mb-6">Step 3</h2>
                        <h3 className="text-2xl font-black text-white mb-4">Configure Path</h3>
                        <p className="text-slate-400 text-sm leading-relaxed mb-8 font-medium">
                            By default, we look at <code className="text-blue-400/80 font-mono font-bold bg-blue-400/5 px-2 py-0.5 rounded">~/.kube/config</code>. If yours is elsewhere, select it.
                        </p>

                        <div className="mt-auto space-y-4">
                            <button
                                onClick={handleSelectFile}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-[0_10px_30px_rgba(37,99,235,0.3)] transition-all active:scale-95"
                            >
                                SELECT CONFIG FILE
                            </button>
                            {toolsState?.kubeconfigOk && (
                                <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest font-mono">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                                    FOUND
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Action */}
                <div className="flex flex-col items-center gap-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500">
                    <button
                        onClick={checkTools}
                        disabled={loading}
                        className="group flex items-center gap-4 px-10 py-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-[2rem] transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="group-hover:rotate-180 transition-transform duration-700" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3" />
                            </svg>
                        )}
                        <span className="font-black text-sm tracking-[0.2em] uppercase">Run Detection Again</span>
                    </button>

                    <p className="text-slate-600 text-[9px] font-black uppercase tracking-[0.5em]">
                        Podscape Engine — v1.1.0
                    </p>
                </div>
            </div>
        </div>
    )
}

