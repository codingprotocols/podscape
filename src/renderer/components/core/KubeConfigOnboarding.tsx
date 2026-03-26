import React, { useState, useEffect } from 'react'
import { useAppStore } from '../../store'

export default function KubeConfigOnboarding(): JSX.Element {
    const { init } = useAppStore()
    const [loading, setLoading] = useState(false)

    const checkTools = async () => {
        setLoading(true)
        try {
            const state = await window.settings.checkTools()
            if (state.kubeconfigOk) {
                // Sidecar started in no-kubeconfig mode — restart it now so it
                // loads the newly configured kubeconfig before init() runs.
                await (window as any).sidecar?.restart()
                await init()
            }
        } catch (e) {
            console.error('[checkTools] Failed:', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        checkTools()
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

            <div className="max-w-6xl w-full z-10 flex flex-col md:flex-row items-center gap-16">
                
                {/* Left side: branding and showcase */}
                <div className="flex-1 space-y-10 animate-in fade-in slide-in-from-left-8 duration-700">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl premium-gradient shadow-[0_20px_40px_rgba(37,99,235,0.2)] mb-2">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                    </div>
                    
                    <div className="space-y-4">
                        <h1 className="text-6xl font-black text-white tracking-tight leading-none">
                            Precision <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">Kubernetes</span>
                        </h1>
                        <p className="text-slate-400 text-lg max-w-lg font-medium">
                            Experience the next generation of cluster management. Podscape provides the speed and visibility you need to scale with confidence.
                        </p>
                    </div>

                    {/* Features List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <FeatureItem 
                            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>}
                            title="Resource Control"
                            desc="Real-time workload management."
                        />
                        <FeatureItem 
                            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /><path d="M2 12h20" /></svg>}
                            title="Network Probe"
                            desc="Built-in DNS and TCP tester."
                        />
                         <FeatureItem 
                            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>}
                            title="Unified Logs"
                            desc="High-speed stream explorer."
                        />
                        <FeatureItem 
                            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m18 16 4-4-4-4" /><path d="m6 8-4 4 4 4" /><path d="m14.5 4-5 16" /></svg>}
                            title="Go Core"
                            desc="No local CLI tools required."
                        />
                    </div>
                </div>

                {/* Right side: onboarding action */}
                <div className="w-full md:w-[400px] animate-in fade-in slide-in-from-right-8 duration-700 delay-200">
                    <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[2.5rem] p-10 space-y-8 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
                        
                        <div className="space-y-2">
                            <h3 className="text-2xl font-black text-white">Get Started</h3>
                            <p className="text-slate-400 text-sm font-medium leading-relaxed">
                                Select your Kubernetes configuration file to connect to your clusters.
                            </p>
                        </div>

                        <div className="space-y-4 pt-4">
                            <button
                                onClick={handleSelectFile}
                                disabled={loading}
                                className="w-full group relative flex flex-col items-center justify-center gap-2 p-6 rounded-3xl bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-[0_20px_50px_rgba(37,99,235,0.3)] active:scale-95 disabled:opacity-50"
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mb-1 group-hover:scale-110 transition-transform">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="12" y1="18" x2="12" y2="12" />
                                    <line x1="9" y1="15" x2="15" y2="15" />
                                </svg>
                                <span className="font-black text-xs uppercase tracking-[0.2em]">Select Kubeconfig</span>
                            </button>

                            <div className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/[0.03] border border-white/5">
                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Awaiting Configuration</span>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/5">
                            <div className="flex items-center gap-3 text-slate-500">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                                <p className="text-[10px] font-medium leading-relaxed">
                                    Usually located at <code className="text-blue-400 font-bold bg-blue-400/5 px-1.5 py-0.5 rounded">~/.kube/config</code>. We'll handle the rest.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 flex flex-col items-center gap-6">
                        <button
                            onClick={checkTools}
                            className="text-[10px] font-black text-slate-600 hover:text-slate-400 uppercase tracking-[0.3em] transition-colors"
                        >
                            Refresh Detection
                        </button>
                        <p className="text-[9px] font-black text-slate-700 uppercase tracking-[0.6em]">
                            Podscape Engine v1.2.0
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}

function FeatureItem({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
    return (
        <div className="flex gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                {icon}
            </div>
            <div>
                <h4 className="text-sm font-bold text-white mb-0.5">{title}</h4>
                <p className="text-xs text-slate-500 font-medium">{desc}</p>
            </div>
        </div>
    )
}

