import React, { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { NamespaceFormState, generateNamespaceYAML, DNS_LABEL_RE, KVPair } from './generateYAML'

interface Props { onChange: (yaml: string) => void }

export default function NamespaceForm({ onChange }: Props): JSX.Element {
    const [s, setS] = useState<NamespaceFormState>({ name: '', labels: [] })

    useEffect(() => {
        if (s.name) onChange(generateNamespaceYAML(s))
        else onChange('')
    }, [s])

    return (
        <div className="space-y-4">
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Name *</label>
                <input value={s.name} onChange={e => setS(p => ({ ...p, name: e.target.value }))} placeholder="my-namespace"
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono" />
                {s.name && !DNS_LABEL_RE.test(s.name) && <p className="text-[9px] text-red-400 mt-1">Must be lowercase letters, digits, or hyphens</p>}
            </div>
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Labels <span className="text-slate-500 normal-case font-normal">(optional)</span></label>
                    <button onClick={() => setS(p => ({ ...p, labels: [...p.labels, { key: '', value: '' }] }))}
                        className="text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus size={10} /> Add</button>
                </div>
                {(s.labels as KVPair[]).map((l, i) => (
                    <div key={i} className="flex gap-1 mb-1">
                        <input value={l.key} onChange={e => setS(p => { const labels = [...p.labels as KVPair[]]; labels[i] = { ...labels[i], key: e.target.value }; return { ...p, labels } })}
                            placeholder="key"
                            className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none font-mono" />
                        <span className="text-slate-500 self-center">=</span>
                        <input value={l.value} onChange={e => setS(p => { const labels = [...p.labels as KVPair[]]; labels[i] = { ...labels[i], value: e.target.value }; return { ...p, labels } })}
                            placeholder="value"
                            className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none font-mono" />
                        <button onClick={() => setS(p => ({ ...p, labels: (p.labels as KVPair[]).filter((_, j) => j !== i) }))}
                            className="text-slate-500 hover:text-red-400"><Trash2 size={11} /></button>
                    </div>
                ))}
            </div>
        </div>
    )
}
