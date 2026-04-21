import React, { useState, useRef, useEffect } from 'react'
import { Play } from 'lucide-react'
import type { PluginRunPanelProps } from '../PluginContract'
import { usePluginRun } from '../usePluginRun'
import { NamespaceSelect } from '../NamespaceSelect'

export function RunPanel({ namespace, context: _ctx }: PluginRunPanelProps): JSX.Element {
    const [query, setQuery] = useState('')
    const [ns, setNs] = useState(namespace)
    const [container, setContainer] = useState('')
    const [include, setInclude] = useState('')
    const [autoScroll, setAutoScroll] = useState(true)
    const { lines, running, run } = usePluginRun()
    const outputRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (autoScroll && outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight
        }
    }, [lines, autoScroll])

    function handleRun() {
        if (!query.trim()) return
        const args = [query.trim(), '-n', ns]
        if (container.trim()) args.push('--container', container.trim())
        if (include.trim()) args.push('--include', include.trim())
        run('stern', args)
    }

    return (
        <div className="flex flex-col h-full">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !running) handleRun() }}
                        placeholder="pod query (e.g. my-app.*)"
                        className="bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-56"
                    />
                    <NamespaceSelect value={ns} onChange={setNs} />
                    <input
                        value={container}
                        onChange={e => setContainer(e.target.value)}
                        placeholder="container (optional)"
                        className="bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-44"
                    />
                    <input
                        value={include}
                        onChange={e => setInclude(e.target.value)}
                        placeholder="grep filter (optional)"
                        className="bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-44"
                    />
                    <button
                        onClick={handleRun}
                        disabled={running || !query.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                    >
                        <Play size={12} />
                        Tail
                    </button>
                </div>
                <p className="text-[10px] text-slate-400">
                    Note: stern streams indefinitely. Close this panel or switch away to stop tailing.
                </p>
            </div>

            <div className="flex items-center justify-between px-6 py-2 border-b border-slate-100 dark:border-white/5">
                <span className="text-[10px] text-slate-400">{lines.length} lines</span>
                <label className="flex items-center gap-2 text-[10px] text-slate-400 cursor-pointer">
                    <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="rounded" />
                    Auto-scroll
                </label>
            </div>

            <div
                ref={outputRef}
                className="flex-1 overflow-auto bg-black/80 p-4 font-mono text-[11px] space-y-0.5"
            >
                {lines.map((l, i) => (
                    <div key={i} className={l.startsWith('[stderr]') ? 'text-red-400' : 'text-slate-200'}>{l}</div>
                ))}
                {running && <div className="text-emerald-400 animate-pulse">▌</div>}
            </div>
        </div>
    )
}
