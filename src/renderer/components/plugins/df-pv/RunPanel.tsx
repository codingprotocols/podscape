import React from 'react'
import { Play } from 'lucide-react'
import type { PluginRunPanelProps } from '../PluginContract'
import { usePluginRun } from '../usePluginRun'

// df-pv emits ANSI color codes — strip before parsing
const ANSI_RE = /\x1b\[[0-9;]*m/g
function stripAnsi(s: string): string { return s.replace(ANSI_RE, '') }

// df-pv columns (0-indexed after splitting on 2+ spaces):
// PV NAME | PVC NAME | NAMESPACE | NODE NAME | POD NAME | VOLUME MOUNT NAME | SIZE | USED | AVAILABLE | %USED | IUSED | IFREE | %IUSED
// We display a focused subset that fits the panel width.
const SHOW_COLS = ['PVC NAME', 'NAMESPACE', 'SIZE', 'USED', 'AVAILABLE', '%USED']

interface DfRow { pvcName: string; namespace: string; size: string; used: string; available: string; pctUsed: number; pctUsedRaw: string }

function parseDfPv(lines: string[]): DfRow[] {
    const clean = lines
        .filter(l => !l.startsWith('[stderr]') && l.trim())
        .map(l => stripAnsi(l))

    if (clean.length < 2) return []

    const header = clean[0].trim().split(/\s{2,}/)
    const idxPvc  = header.findIndex(h => h === 'PVC NAME')
    const idxNs   = header.findIndex(h => h === 'NAMESPACE')
    const idxSize = header.findIndex(h => h === 'SIZE')
    const idxUsed = header.findIndex(h => h === 'USED')
    const idxAvail= header.findIndex(h => h === 'AVAILABLE')
    const idxPct  = header.findIndex(h => h === '%USED')

    // If the header doesn't match expected df-pv format, bail
    if ([idxPvc, idxNs, idxSize, idxUsed, idxAvail, idxPct].some(i => i < 0)) return []

    return clean.slice(1).map(line => {
        const cols = line.trim().split(/\s{2,}/)
        const pctRaw = cols[idxPct] ?? '0'
        const pct = parseFloat(pctRaw) || 0
        return {
            pvcName:    cols[idxPvc]  ?? '',
            namespace:  cols[idxNs]   ?? '',
            size:       cols[idxSize] ?? '',
            used:       cols[idxUsed] ?? '',
            available:  cols[idxAvail]?? '',
            pctUsed:    pct,
            pctUsedRaw: pctRaw,
        }
    }).filter(r => r.pvcName)
}

function pctColor(pct: number): string {
    if (pct >= 85) return 'text-red-400'
    if (pct >= 60) return 'text-amber-400'
    return 'text-emerald-400'
}

function PctBar({ pct }: { pct: number }) {
    const color = pct >= 85 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
    return (
        <div className="flex items-center gap-2 min-w-0">
            <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 shrink-0 overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className={`text-[11px] font-mono tabular-nums ${pctColor(pct)}`}>{pct.toFixed(1)}%</span>
        </div>
    )
}

export function RunPanel({ namespace: _ns, context: _ctx }: PluginRunPanelProps): JSX.Element {
    const { lines, running, run } = usePluginRun()

    const stderr = lines.filter(l => l.startsWith('[stderr]'))
    const stdout = lines.filter(l => !l.startsWith('[stderr]'))
    const rows = parseDfPv(stdout)
    const showRaw = stdout.length > 0 && rows.length === 0

    return (
        <div className="flex flex-col h-full">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center gap-3">
                <button
                    onClick={() => run('df-pv', [])}
                    disabled={running}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                    <Play size={12} />
                    {running ? 'Running...' : 'Run'}
                </button>
                <span className="text-[10px] text-slate-400">Disk usage across all PVCs cluster-wide</span>
            </div>

            <div className="flex-1 overflow-auto">
                {stderr.length > 0 && (
                    <div className="m-4 bg-red-500/10 rounded-xl p-4 space-y-1">
                        {stderr.map((l, i) => (
                            <p key={i} className="text-[11px] text-red-400 font-mono">{l.replace('[stderr] ', '')}</p>
                        ))}
                    </div>
                )}

                {rows.length > 0 && (
                    <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl">
                            <tr className="border-b border-slate-100 dark:border-white/5">
                                {SHOW_COLS.map(h => (
                                    <th key={h} className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                            {rows.map((row, i) => (
                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                    <td className="px-4 py-3 text-[11px] font-mono text-slate-700 dark:text-slate-300 max-w-[220px] truncate" title={row.pvcName}>{row.pvcName}</td>
                                    <td className="px-4 py-3 text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.namespace}</td>
                                    <td className="px-4 py-3 text-[11px] font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap tabular-nums">{row.size}</td>
                                    <td className="px-4 py-3 text-[11px] font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap tabular-nums">{row.used}</td>
                                    <td className="px-4 py-3 text-[11px] font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap tabular-nums">{row.available}</td>
                                    <td className="px-4 py-3 whitespace-nowrap"><PctBar pct={row.pctUsed} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Fallback: unrecognised format — show raw lines */}
                {showRaw && (
                    <div className="p-4 font-mono text-[11px] text-slate-300 whitespace-pre overflow-x-auto">
                        {stdout.map((l, i) => <div key={i}>{stripAnsi(l)}</div>)}
                    </div>
                )}
            </div>
        </div>
    )
}
