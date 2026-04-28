import React, { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '../../../store'
import { SecretFormState, generateSecretYAML, DNS_LABEL_RE } from './generateYAML'

interface Props { onChange: (yaml: string) => void }

export default function SecretForm({ onChange }: Props): JSX.Element {
    const namespaces = useAppStore(s => s.namespaces)
    const selectedNamespace = useAppStore(s => s.selectedNamespace)
    const [s, setS] = useState<SecretFormState>({
        name: '',
        namespace: (selectedNamespace && selectedNamespace !== '_all' ? selectedNamespace : 'default'),
        type: 'Opaque',
        data: [{ key: '', value: '' }],
    })

    useEffect(() => {
        if (s.name) onChange(generateSecretYAML(s))
        else onChange('')
    }, [s])

    return (
        <div className="space-y-4">
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Name *</label>
                <input value={s.name} onChange={e => setS(p => ({ ...p, name: e.target.value }))} placeholder="my-secret"
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono" />
                {s.name && !DNS_LABEL_RE.test(s.name) && <p className="text-[9px] text-red-400 mt-1">Must be lowercase letters, digits, or hyphens</p>}
            </div>
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Namespace</label>
                <select value={s.namespace} onChange={e => setS(p => ({ ...p, namespace: e.target.value }))}
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-slate-800 border border-white/10 rounded-lg text-slate-200 focus:outline-none">
                    {namespaces.map(ns => <option key={ns.metadata.name} value={ns.metadata.name}>{ns.metadata.name}</option>)}
                    {namespaces.length === 0 && <option value="default">default</option>}
                </select>
            </div>
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Type</label>
                <select value={s.type} onChange={e => setS(p => ({ ...p, type: e.target.value as SecretFormState['type'] }))}
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-slate-800 border border-white/10 rounded-lg text-slate-200 focus:outline-none">
                    <option value="Opaque">Opaque</option>
                    <option value="kubernetes.io/dockerconfigjson">dockerconfigjson</option>
                    <option value="kubernetes.io/tls">TLS</option>
                </select>
            </div>
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Data <span className="text-slate-500 normal-case font-normal">(values auto-base64 encoded)</span></label>
                    <button onClick={() => setS(p => ({ ...p, data: [...p.data, { key: '', value: '' }] }))}
                        className="text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus size={10} /> Add</button>
                </div>
                {s.data.map((d, i) => (
                    <div key={i} className="flex gap-1 mb-1">
                        <input value={d.key} onChange={e => setS(p => { const data = [...p.data]; data[i] = { ...data[i], key: e.target.value }; return { ...p, data } })}
                            placeholder="key"
                            className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none font-mono" />
                        <span className="text-slate-500 self-center">=</span>
                        <input value={d.value} onChange={e => setS(p => { const data = [...p.data]; data[i] = { ...data[i], value: e.target.value }; return { ...p, data } })}
                            placeholder="value (plain text)"
                            className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none font-mono" />
                        <button onClick={() => setS(p => ({ ...p, data: p.data.filter((_, j) => j !== i) }))}
                            className="text-slate-500 hover:text-red-400"><Trash2 size={11} /></button>
                    </div>
                ))}
            </div>
        </div>
    )
}
