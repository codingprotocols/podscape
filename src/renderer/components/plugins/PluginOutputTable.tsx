import React from 'react'

function parseTextTable(lines: string[]): { headers: string[]; rows: string[][] } {
    const dataLines = lines.filter(l => !l.startsWith('[stderr]') && l.trim())
    if (dataLines.length < 1) return { headers: [], rows: [] }
    const headers = dataLines[0].trim().split(/\s{2,}/)
    const rows = dataLines.slice(1).map(l => {
        const parts = l.trim().split(/\s{2,}/)
        while (parts.length < headers.length) parts.push('')
        return parts
    })
    return { headers, rows }
}

export function PluginOutputTable({ lines }: { lines: string[] }): JSX.Element | null {
    const { headers, rows } = parseTextTable(lines)
    if (!headers.length) return null

    return (
        <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl">
                <tr className="border-b border-slate-100 dark:border-white/5">
                    {headers.map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                            {h}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        {row.map((cell, j) => (
                            <td key={j} className="px-4 py-3 text-[11px] font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                {cell}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    )
}
