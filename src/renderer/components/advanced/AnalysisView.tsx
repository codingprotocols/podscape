import React from 'react'
import { ScanResult } from '../../utils/scanner/types'
import { AlertTriangle, Info, AlertCircle, CheckCircle2 } from 'lucide-react'

interface Props {
    result: ScanResult
}

export default function AnalysisView({ result }: Props): JSX.Element {
    if (result.issues.length === 0) {
        return (
            <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/10 flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                    <h4 className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-1">Clean Slate</h4>
                    <p className="text-[10px] text-emerald-600/70 font-medium">No security or best practice violations detected.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {result.issues.map((issue, i) => (
                <div key={i} className={`p-4 rounded-2xl border flex gap-4 transition-all hover:translate-x-1
          ${issue.level === 'error' ? 'bg-red-500/5 border-red-500/10' :
                        issue.level === 'warning' ? 'bg-amber-500/5 border-amber-500/10' :
                            'bg-blue-500/5 border-blue-500/10'}`}>
                    <div className="shrink-0 mt-0.5">
                        {issue.level === 'error' ? <AlertCircle className="w-4 h-4 text-red-500" /> :
                            issue.level === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-500" /> :
                                <Info className="w-4 h-4 text-blue-500" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <h5 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider truncate">
                                {issue.message}
                            </h5>
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter
                ${issue.level === 'error' ? 'bg-red-500/10 text-red-500' :
                                    issue.level === 'warning' ? 'bg-amber-500/10 text-amber-500' :
                                        'bg-blue-500/10 text-blue-500'}`}>
                                {issue.level}
                            </span>
                        </div>
                        {issue.path && (
                            <p className="text-[9px] font-mono text-slate-400 dark:text-slate-600 mb-2 truncate">
                                {issue.path}
                            </p>
                        )}
                        {issue.suggestion && (
                            <div className="bg-white/5 p-2 rounded-lg mt-1 border border-white/5">
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium italic">
                                    Tip: {issue.suggestion}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}
