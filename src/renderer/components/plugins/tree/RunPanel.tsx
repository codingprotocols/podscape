import React, { useState, useRef, useEffect } from 'react'
import { Play } from 'lucide-react'
import type { PluginRunPanelProps } from '../PluginContract'
import { usePluginRun } from '../usePluginRun'
import { NamespaceSelect } from '../NamespaceSelect'

const COMMON_KINDS = ['deployment', 'statefulset', 'daemonset', 'job', 'cronjob', 'pod', 'replicaset']

export function RunPanel({ namespace, context: _ctx }: PluginRunPanelProps): JSX.Element {
    const [kind, setKind] = useState('deployment')
    const [name, setName] = useState('')
    const [ns, setNs] = useState(namespace)
    const { lines, running, run } = usePluginRun()
    const outputRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
    }, [lines])

    function handleRun() {
        if (!name.trim()) return
        run('tree', [kind, name.trim(), '-n', ns])
    }

    return (
        <div className="flex flex-col h-full">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center gap-3 flex-wrap">
                <select
                    value={kind}
                    onChange={e => setKind(e.target.value)}
                    className="bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                    {COMMON_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRun() }}
                    placeholder="resource name"
                    className="bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-48"
                />
                <NamespaceSelect value={ns} onChange={setNs} />
                <button
                    onClick={handleRun}
                    disabled={running || !name.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                    <Play size={12} />
                    {running ? 'Running...' : 'Run'}
                </button>
            </div>

            {lines.length > 0 && (
                <div
                    ref={outputRef}
                    className="flex-1 overflow-auto p-6 bg-slate-50 dark:bg-black/30 font-mono text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre"
                >
                    {lines.map((l, i) => (
                        <div key={i} className={l.startsWith('[stderr]') ? 'text-red-400' : ''}>{l}</div>
                    ))}
                    {running && <div className="text-blue-400 animate-pulse">▌</div>}
                </div>
            )}
        </div>
    )
}
