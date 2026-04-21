import React, { useState } from 'react'
import { Play } from 'lucide-react'
import type { PluginRunPanelProps } from '../PluginContract'
import { usePluginRun } from '../usePluginRun'
import { NamespaceSelect } from '../NamespaceSelect'

interface ImageRow { pod: string; container: string; image: string; isInit: boolean }

/**
 * kubectl-images outputs a box-drawing ASCII table with merged (spanning) cells.
 * Separator lines start with '+', data lines start with '|'.
 * Empty cells in data rows inherit the value from the previous row.
 */
function parseImagesOutput(lines: string[]): ImageRow[] {
    const rows: ImageRow[] = []
    let lastPod = ''
    let lastImage = ''
    let headerSkipped = false

    for (const line of lines) {
        if (line.startsWith('[stderr]') || line.startsWith('+')) continue
        if (!line.startsWith('|')) continue

        // Split on '|', trim each cell, drop first and last empty entries
        const cells = line.split('|').slice(1, -1).map(c => c.trim())
        if (cells.length < 3) continue

        const [pod, container, image] = cells

        // Skip the header row
        if (!headerSkipped && pod === 'Pod') {
            headerSkipped = true
            continue
        }

        const resolvedPod   = pod   || lastPod
        const resolvedImage = image || lastImage

        if (container) {
            const isInit = container.startsWith('(init)')
            rows.push({
                pod:       resolvedPod,
                container: isInit ? container.replace(/^\(init\)\s*/, '') : container,
                image:     resolvedImage,
                isInit,
            })
        }

        if (pod)   lastPod   = pod
        if (image) lastImage = image
    }

    return rows
}

// Group consecutive rows by pod so we can show the pod name once
interface PodGroup { pod: string; containers: Omit<ImageRow, 'pod'>[] }

function groupByPod(rows: ImageRow[]): PodGroup[] {
    const groups: PodGroup[] = []
    for (const row of rows) {
        const last = groups[groups.length - 1]
        if (last && last.pod === row.pod) {
            last.containers.push({ container: row.container, image: row.image, isInit: row.isInit })
        } else {
            groups.push({ pod: row.pod, containers: [{ container: row.container, image: row.image, isInit: row.isInit }] })
        }
    }
    return groups
}

export function RunPanel({ namespace, context: _ctx }: PluginRunPanelProps): JSX.Element {
    const [ns, setNs] = useState(namespace)
    const { lines, running, exitCode, run } = usePluginRun()

    const stderr = lines.filter(l => l.startsWith('[stderr]'))
    const stdout = lines.filter(l => !l.startsWith('[stderr]'))
    const rows   = parseImagesOutput(stdout)
    const groups = groupByPod(rows)

    return (
        <div className="flex flex-col h-full">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center gap-3">
                <NamespaceSelect value={ns} onChange={setNs} />
                <button
                    onClick={() => run('images', ns ? ['-n', ns] : [])}
                    disabled={running}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                    <Play size={12} />
                    {running ? 'Running...' : 'Run'}
                </button>
            </div>

            <div className="flex-1 overflow-auto">
                {stderr.length > 0 && exitCode !== 0 && (
                    <div className="m-4 bg-red-500/10 rounded-xl p-4 space-y-1">
                        {stderr.map((l, i) => (
                            <p key={i} className="text-[11px] text-red-400 font-mono">{l.replace('[stderr] ', '')}</p>
                        ))}
                    </div>
                )}

                {groups.length > 0 && (
                    <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl">
                            <tr className="border-b border-slate-100 dark:border-white/5">
                                {['Pod', 'Container', 'Image'].map(h => (
                                    <th key={h} className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map((group, gi) => (
                                group.containers.map((c, ci) => (
                                    <tr
                                        key={`${gi}-${ci}`}
                                        className={`border-b border-slate-50 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${ci === 0 ? 'border-t border-slate-100 dark:border-white/10' : ''}`}
                                    >
                                        {/* Pod name only on first container row */}
                                        <td className="px-4 py-2.5 text-[11px] font-mono text-slate-700 dark:text-slate-300 max-w-[220px] align-top">
                                            {ci === 0 && (
                                                <span className="truncate block" title={group.pod}>{group.pod}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-[11px] font-mono whitespace-nowrap">
                                            <span className={c.isInit ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}>
                                                {c.container}
                                            </span>
                                            {c.isInit && (
                                                <span className="ml-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded">
                                                    init
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                            {c.image}
                                        </td>
                                    </tr>
                                ))
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
