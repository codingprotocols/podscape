import React from 'react'

export default function LoadingAnimation() {
    return (
        <div className="flex flex-col items-center justify-center p-12 gap-8 animate-in fade-in zoom-in duration-500">
            <div className="relative w-24 h-24">
                {/* Background glow */}
                <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl animate-pulse" />

                {/* Inner static circle with brand icon feel */}
                <div className="absolute inset-4 rounded-xl glass-heavy flex items-center justify-center shadow-lg transform rotate-45 border border-white/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                </div>

                {/* Outer Orbit 1 */}
                <div className="absolute inset-0 rounded-full border-t-2 border-l-2 border-blue-500/30 animate-orbit" />

                {/* Outer Orbit 2 */}
                <div className="absolute -inset-2 rounded-full border-r-2 border-b-2 border-blue-400/20 animate-orbit-reverse" />

                {/* Orbit Dots */}
                <div className="absolute inset-0 animate-orbit">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_12px_#3b82f6]" />
                </div>

                <div className="absolute -inset-2 animate-orbit-reverse">
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-600 shadow-md" />
                </div>
            </div>

            <div className="flex flex-col items-center gap-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-900 dark:text-white animate-pulse">
                    Syncing Cluster
                </h3>
                <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest animate-float">
                    Retrieving state from control plane
                </p>
            </div>
        </div>
    )
}
