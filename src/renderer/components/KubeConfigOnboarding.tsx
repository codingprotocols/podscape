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
                // If we have at least kubectl and a config, we can try to proceed
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
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 p-8">
            <div className="max-w-3xl w-full">
                {/* Header */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl premium-gradient mb-6 shadow-2xl shadow-blue-500/20 active-glow mx-auto">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tight uppercase tracking-[0.1em] mb-4">Welcome to Podscape</h1>
                    <p className="text-slate-400 text-lg leading-relaxed max-w-xl mx-auto">
                        We couldn't find any Kubernetes clusters or a valid kubeconfig file. Let's get you set up to manage your infrastructure.
                    </p>
                </div>

                {/* Steps */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    {/* Step 1 */}
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span className="text-6xl font-black">1</span>
                        </div>
                        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-4">Step 1</h2>
                        <h3 className="text-lg font-bold text-white mb-2">Install kubectl</h3>
                        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                            The Kubernetes command-line tool allows you to run commands against clusters.
                        </p>
                        <div className="mt-auto pt-4 flex flex-col gap-3">
                            <a
                                href="https://kubernetes.io/docs/tasks/tools/"
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                            >
                                Install Guide <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
                            </a>
                            {toolsState?.kubectlOk && (
                                <span className="flex items-center gap-1.5 text-emerald-500 text-[10px] font-bold uppercase">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                                    Detected
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span className="text-6xl font-black">2</span>
                        </div>
                        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-4">Step 2</h2>
                        <h3 className="text-lg font-bold text-white mb-2">Configure Path</h3>
                        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                            By default, we look at <code className="text-slate-300">~/.kube/config</code>. If yours is elsewhere, select it.
                        </p>
                        <div className="mt-auto pt-4 space-y-3">
                            <button
                                onClick={handleSelectFile}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                Select Config File
                            </button>
                            {toolsState?.kubeconfigOk && (
                                <span className="flex items-center justify-center gap-1.5 text-emerald-500 text-[10px] font-bold uppercase">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                                    Found
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span className="text-6xl font-black">3</span>
                        </div>
                        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-4">Step 3</h2>
                        <h3 className="text-lg font-bold text-white mb-2">Install Helm</h3>
                        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                            The package manager for Kubernetes. Required for managing charts and releases.
                        </p>
                        <div className="mt-auto pt-4 flex flex-col gap-3">
                            <a
                                href="https://helm.sh/docs/intro/install/"
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                            >
                                Install Guide <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
                            </a>
                            {toolsState?.helmOk && (
                                <span className="flex items-center gap-1.5 text-emerald-500 text-[10px] font-bold uppercase">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                                    Detected
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex flex-col items-center gap-8">
                    <button
                        onClick={checkTools}
                        disabled={loading}
                        className="flex items-center gap-3 px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl transition-all hover:shadow-2xl disabled:opacity-50"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3" />
                            </svg>
                        )}
                        <span className="font-bold text-sm tracking-wide">Run Detection Again</span>
                    </button>

                    <div className="w-full h-[1px] bg-white/5" />

                    <div className="text-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600 mb-4">Option 2</p>
                        <h4 className="text-lg font-bold text-white mb-2">Manual Installation</h4>
                        <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
                            If you haven't installed Kubernetes yet, follow the official guide to install kubectl and configure a cluster.
                        </p>
                        <a
                            href="https://kubernetes.io/docs/home/"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all"
                        >
                            Read Official Docs
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></svg>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    )
}
