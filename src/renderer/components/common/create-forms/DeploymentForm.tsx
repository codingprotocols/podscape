import React, { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '../../../store'
import { DeploymentFormState, generateDeploymentYAML, DNS_LABEL_RE, KVPair } from './generateYAML'

interface Props { onChange: (yaml: string) => void }

const defaultState = (): DeploymentFormState => ({
    name: '', namespace: 'default', image: '', replicas: 1, port: '',
    envVars: [], labels: [{ key: 'app', value: '' }],
})

export default function DeploymentForm({ onChange }: Props): JSX.Element {
    const namespaces = useAppStore(s => s.namespaces)
    const selectedNamespace = useAppStore(s => s.selectedNamespace)
    const [s, setS] = useState<DeploymentFormState>(() => ({
        ...defaultState(),
        namespace: (selectedNamespace && selectedNamespace !== '_all' ? selectedNamespace : 'default'),
        labels: [{ key: 'app', value: '' }],
    }))
    const [errors, setErrors] = useState<Record<string, string>>({})

    useEffect(() => {
        // Keep app label value in sync with name
        setS(prev => ({
            ...prev,
            labels: prev.labels.map((l, i) => i === 0 && l.key === 'app' ? { ...l, value: prev.name } : l),
        }))
    }, [s.name])

    useEffect(() => {
        const hasLabel = (s.labels as KVPair[]).some(l => l.key.trim())
        if (s.name && s.image && hasLabel) onChange(generateDeploymentYAML(s))
        else onChange('')
    }, [s])

    const field = (key: keyof DeploymentFormState, val: string | number) => {
        setS(prev => ({ ...prev, [key]: val }))
        setErrors(prev => { const e = { ...prev }; delete e[key as string]; return e })
    }

    const addKV = (listKey: 'envVars' | 'labels') =>
        setS(prev => ({ ...prev, [listKey]: [...prev[listKey] as KVPair[], { key: '', value: '' }] }))

    const updateKV = (listKey: 'envVars' | 'labels', idx: number, kOrV: 'key' | 'value', val: string) =>
        setS(prev => {
            const list = [...prev[listKey] as KVPair[]]
            list[idx] = { ...list[idx], [kOrV]: val }
            return { ...prev, [listKey]: list }
        })

    const removeKV = (listKey: 'envVars' | 'labels', idx: number) =>
        setS(prev => ({ ...prev, [listKey]: (prev[listKey] as KVPair[]).filter((_, i) => i !== idx) }))

    return (
        <div className="space-y-4">
            {/* Name */}
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Name *</label>
                <input value={s.name} onChange={e => field('name', e.target.value)}
                    placeholder="my-deployment"
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono" />
                {!DNS_LABEL_RE.test(s.name) && s.name && (
                    <p className="text-[9px] text-red-400 mt-1">Must be lowercase letters, digits, or hyphens</p>
                )}
            </div>

            {/* Namespace */}
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Namespace</label>
                <select value={s.namespace} onChange={e => field('namespace', e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-slate-800 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500/50">
                    {namespaces.map(ns => (
                        <option key={ns.metadata.name} value={ns.metadata.name}>{ns.metadata.name}</option>
                    ))}
                    {namespaces.length === 0 && <option value="default">default</option>}
                </select>
            </div>

            {/* Image */}
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Container Image *</label>
                <input value={s.image} onChange={e => field('image', e.target.value)}
                    placeholder="nginx:latest"
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono" />
            </div>

            {/* Replicas + Port */}
            <div className="flex gap-3">
                <div className="flex-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Replicas</label>
                    <input type="number" min={1} value={s.replicas}
                        onChange={e => field('replicas', Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500/50" />
                </div>
                <div className="flex-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Container Port</label>
                    <input value={s.port} onChange={e => field('port', e.target.value)}
                        placeholder="80"
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500/50" />
                </div>
            </div>

            {/* Labels */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Labels</label>
                    <button onClick={() => addKV('labels')} className="text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                        <Plus size={10} /> Add
                    </button>
                </div>
                {(s.labels as KVPair[]).map((l, i) => (
                    <div key={i} className="flex gap-1 mb-1">
                        <input value={l.key} onChange={e => updateKV('labels', i, 'key', e.target.value)}
                            placeholder="key"
                            className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono" />
                        <span className="text-slate-500 self-center">=</span>
                        <input value={l.value} onChange={e => updateKV('labels', i, 'value', e.target.value)}
                            placeholder="value"
                            className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono" />
                        <button onClick={() => removeKV('labels', i)} className="text-slate-500 hover:text-red-400 transition-colors">
                            <Trash2 size={11} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Env Vars */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Environment Variables</label>
                    <button onClick={() => addKV('envVars')} className="text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                        <Plus size={10} /> Add
                    </button>
                </div>
                {(s.envVars as KVPair[]).map((e, i) => (
                    <div key={i} className="flex gap-1 mb-1">
                        <input value={e.key} onChange={ev => updateKV('envVars', i, 'key', ev.target.value)}
                            placeholder="NAME"
                            className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono" />
                        <span className="text-slate-500 self-center">=</span>
                        <input value={e.value} onChange={ev => updateKV('envVars', i, 'value', ev.target.value)}
                            placeholder="value"
                            className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono" />
                        <button onClick={() => removeKV('envVars', i)} className="text-slate-500 hover:text-red-400 transition-colors">
                            <Trash2 size={11} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}
