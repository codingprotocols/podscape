import React, { useState, lazy, Suspense } from 'react'
import { Play } from 'lucide-react'
import type { PluginRunPanelProps } from '../PluginContract'
import { usePluginRun } from '../usePluginRun'
import { NamespaceSelect } from '../NamespaceSelect'

const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })))

const COMMON_KINDS = ['pod', 'deployment', 'statefulset', 'service', 'configmap', 'secret', 'ingress', 'daemonset']
const FORMATS = ['yaml', 'json'] as const
type Format = typeof FORMATS[number]

export function RunPanel({ namespace, context: _ctx }: PluginRunPanelProps): JSX.Element {
    const [kind, setKind] = useState('deployment')
    const [name, setName] = useState('')
    const [ns, setNs] = useState(namespace)
    const [format, setFormat] = useState<Format>('yaml')
    const { lines, running, run } = usePluginRun()

    // kubectl neat get -- <kind> <name> -n <ns> -o<format>
    const stdout = lines.filter(l => !l.startsWith('[stderr]')).join('\n').replace(/\t/g, '  ')
    const stderr = lines.filter(l => l.startsWith('[stderr]'))

    function handleRun() {
        if (!name.trim()) return
        const args = ['get', '--', kind, name.trim(), '-n', ns, '--output', format]
        run('neat', args)
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
                <select
                    value={format}
                    onChange={e => setFormat(e.target.value as Format)}
                    className="bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                    {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <button
                    onClick={handleRun}
                    disabled={running || !name.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                    <Play size={12} />
                    {running ? 'Running...' : 'Run'}
                </button>
            </div>

            <div className="flex-1 min-h-0 cursor-default">
                {stderr.length > 0 && (
                    <div className="m-4 bg-red-500/10 rounded-xl p-4 space-y-1">
                        {stderr.map((l, i) => (
                            <p key={i} className="text-[11px] text-red-400 font-mono">{l.replace('[stderr] ', '')}</p>
                        ))}
                    </div>
                )}
                {stdout && (
                    <Suspense fallback={<div className="p-6 text-[11px] text-slate-400">Loading editor...</div>}>
                        <MonacoEditor
                            height="100%"
                            language={format}
                            value={stdout}
                            theme="vs-dark"
                            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, tabSize: 2, insertSpaces: true }}
                        />
                    </Suspense>
                )}
            </div>
        </div>
    )
}
