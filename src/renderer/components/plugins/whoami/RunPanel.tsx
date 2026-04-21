import React, { useEffect } from 'react'
import type { PluginRunPanelProps } from '../PluginContract'
import { usePluginRun } from '../usePluginRun'

function parseWhoami(lines: string[]): Array<{ attr: string; value: string }> {
    return lines
        .filter(l => !l.startsWith('[stderr]') && l.trim() && !l.startsWith('ATTRIBUTE'))
        .map(l => {
            const parts = l.trim().split(/\s{2,}/)
            return { attr: parts[0] ?? '', value: parts.slice(1).join('  ') }
        })
        .filter(r => r.attr)
}

export function RunPanel({ namespace: _ns, context: _ctx }: PluginRunPanelProps): JSX.Element {
    const { lines, running, exitCode, run } = usePluginRun()

    useEffect(() => { void run('whoami', []) }, [])

    if (running) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
        )
    }

    const attrs = parseWhoami(lines)
    const stderr = lines.filter(l => l.startsWith('[stderr]'))

    return (
        <div className="p-6 space-y-4">
            {exitCode !== null && exitCode !== 0 && (
                <div className="bg-red-500/10 rounded-xl p-4 space-y-1">
                    {stderr.map((l, i) => (
                        <p key={i} className="text-[11px] text-red-400 font-mono">{l.replace('[stderr] ', '')}</p>
                    ))}
                </div>
            )}

            {attrs.length > 0 && (
                <div className="bg-slate-50 dark:bg-white/5 rounded-2xl divide-y divide-slate-100 dark:divide-white/5">
                    {attrs.map(({ attr, value }) => (
                        <div key={attr} className="flex items-start gap-6 px-5 py-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 w-24 shrink-0 pt-0.5">{attr}</span>
                            <span className="text-[12px] font-mono text-slate-700 dark:text-slate-200 break-all">{value}</span>
                        </div>
                    ))}
                </div>
            )}

            {exitCode !== null && (
                <button
                    onClick={() => run('whoami', [])}
                    className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-200 transition-colors"
                >
                    ↺ Refresh
                </button>
            )}
        </div>
    )
}
