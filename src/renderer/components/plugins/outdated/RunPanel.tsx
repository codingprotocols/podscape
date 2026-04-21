import React, { useState } from 'react'
import { Play } from 'lucide-react'
import type { PluginRunPanelProps } from '../PluginContract'
import { usePluginRun } from '../usePluginRun'
import { NamespaceSelect } from '../NamespaceSelect'

const ANSI_RE = /\x1b\[[0-9;]*m/g
function stripAnsi(s: string): string { return s.replace(ANSI_RE, '') }

// Braille spinner chars emitted by the progress lines
const SPINNER_RE = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/

interface OutdatedRow {
    image: string
    current: string
    latest: string
    behind: number | null
    unable: boolean
}

/**
 * outdated streams each image twice:
 *   1. As it's discovered:  Image  Current
 *   2. After registry check: Image  Current  Latest  Behind   (or "Unable to get image data")
 *
 * We deduplicate by image+current key, keeping the more-complete row.
 * Progress/spinner lines are filtered out before parsing.
 */
function parseOutdated(lines: string[]): OutdatedRow[] {
    const clean = lines
        .filter(l => !l.startsWith('[stderr]'))
        .map(l => stripAnsi(l).trim())
        .filter(l => l && !SPINNER_RE.test(l) && !l.includes('Searching for images'))

    const headerIdx = clean.findIndex(l => /^image\b/i.test(l))
    if (headerIdx < 0) return []

    const rowMap = new Map<string, OutdatedRow>()

    for (const line of clean.slice(headerIdx + 1)) {
        // columns are separated by tabs or 2+ spaces
        const cols = line.split(/\t|\s{2,}/).map(c => c.trim()).filter(Boolean)
        if (cols.length < 2) continue

        const [image, current] = cols
        const key = `${image}::${current}`
        const rest = cols.slice(2)

        let row: OutdatedRow
        if (rest.length === 0) {
            row = { image, current, latest: '', behind: null, unable: false }
        } else if (rest.join(' ').includes('Unable to get image data')) {
            row = { image, current, latest: '', behind: null, unable: true }
        } else {
            const latest = rest[0] ?? ''
            const rawBehind = rest[1] ?? ''
            const behind = rawBehind ? parseInt(rawBehind, 10) : null
            row = { image, current, latest, behind: Number.isNaN(behind) ? null : behind, unable: false }
        }

        const existing = rowMap.get(key)
        // Replace only if the new row has more information than the existing one
        if (!existing || (row.latest !== '' && existing.latest === '') || row.unable) {
            rowMap.set(key, row)
        }
    }

    return Array.from(rowMap.values())
}

function BehindBadge({ behind, unable }: { behind: number | null; unable: boolean }) {
    if (unable) {
        return <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">no data</span>
    }
    if (behind === null) return null
    if (behind === 0) return <span className="text-[10px] font-mono text-emerald-500">✓ up to date</span>
    const color = behind >= 5 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
    return (
        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${color}`}>
            {behind} behind
        </span>
    )
}

export function RunPanel({ namespace, context: _ctx }: PluginRunPanelProps): JSX.Element {
    const [ns, setNs] = useState(namespace)
    const { lines, running, run } = usePluginRun()

    const stderr  = lines.filter(l => l.startsWith('[stderr]'))
    const stdout  = lines.filter(l => !l.startsWith('[stderr]'))
    const rows    = parseOutdated(stdout)
    const showRaw = stdout.length > 0 && rows.length === 0 && !running

    return (
        <div className="flex flex-col h-full">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center gap-3">
                <NamespaceSelect value={ns} onChange={setNs} includeAll />
                <button
                    onClick={() => run('outdated', ns ? ['-n', ns] : [])}
                    disabled={running}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                    <Play size={12} />
                    {running ? 'Scanning...' : 'Scan'}
                </button>
                {running && (
                    <span className="text-[10px] text-slate-400 animate-pulse">
                        Checking registries… {rows.length > 0 ? `${rows.length} found` : ''}
                    </span>
                )}
            </div>

            <div className="flex-1 overflow-auto">
                {stderr.length > 0 && (
                    <div className="m-4 bg-red-500/10 rounded-xl p-4 space-y-1">
                        {stderr.map((l, i) => (
                            <p key={i} className="text-[11px] text-red-400 font-mono">{l.replace('[stderr] ', '')}</p>
                        ))}
                    </div>
                )}

                {(rows.length > 0 || running) && (
                    <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl">
                            <tr className="border-b border-slate-100 dark:border-white/5">
                                {['Image', 'Current', 'Latest', 'Status'].map(h => (
                                    <th key={h} className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                            {rows.map((row, i) => (
                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                    <td className="px-4 py-2.5 text-[11px] font-mono text-slate-700 dark:text-slate-300 max-w-[260px]">
                                        <span className="truncate block" title={row.image}>{row.image}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                                        {row.current}
                                    </td>
                                    <td className="px-4 py-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                                        {row.latest || (row.unable ? '—' : <span className="text-slate-300 dark:text-slate-600 animate-pulse">…</span>)}
                                    </td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                        {(row.latest !== '' || row.unable) && (
                                            <BehindBadge behind={row.behind} unable={row.unable} />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Fallback for unrecognised format */}
                {showRaw && (
                    <div className="p-4 font-mono text-[11px] text-slate-300 whitespace-pre overflow-x-auto">
                        {stdout.map((l, i) => <div key={i}>{stripAnsi(l)}</div>)}
                    </div>
                )}
            </div>
        </div>
    )
}
