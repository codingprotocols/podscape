import React, { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '../../../store'
import { ServiceFormState, generateServiceYAML } from './generateYAML'

interface Props { onChange: (yaml: string) => void }

export default function ServiceForm({ onChange }: Props): JSX.Element {
    const namespaces = useAppStore(s => s.namespaces)
    const selectedNamespace = useAppStore(s => s.selectedNamespace)
    const [s, setS] = useState<ServiceFormState>({
        name: '',
        namespace: (selectedNamespace && selectedNamespace !== '_all' ? selectedNamespace : 'default'),
        type: 'ClusterIP',
        selectorLabels: [{ key: 'app', value: '' }],
        ports: [{ protocol: 'TCP', port: '80', targetPort: '80' }],
    })

    useEffect(() => {
        if (s.name) onChange(generateServiceYAML(s))
        else onChange('')
    }, [s])

    const field = (key: keyof ServiceFormState, val: unknown) => setS(prev => ({ ...prev, [key]: val }))

    const updatePort = (idx: number, key: 'protocol' | 'port' | 'targetPort', val: string) =>
        setS(prev => {
            const ports = [...prev.ports]
            ports[idx] = { ...ports[idx], [key]: val }
            return { ...prev, ports }
        })

    const updateSel = (idx: number, kOrV: 'key' | 'value', val: string) =>
        setS(prev => {
            const selectorLabels = [...prev.selectorLabels]
            selectorLabels[idx] = { ...selectorLabels[idx], [kOrV]: val }
            return { ...prev, selectorLabels }
        })

    return (
        <div className="space-y-4">
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Name *</label>
                <input value={s.name} onChange={e => field('name', e.target.value)} placeholder="my-service"
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono" />
            </div>
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Namespace</label>
                <select value={s.namespace} onChange={e => field('namespace', e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-slate-800 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500/50">
                    {namespaces.map(ns => <option key={ns.metadata.name} value={ns.metadata.name}>{ns.metadata.name}</option>)}
                    {namespaces.length === 0 && <option value="default">default</option>}
                </select>
            </div>
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Type</label>
                <select value={s.type} onChange={e => field('type', e.target.value as ServiceFormState['type'])}
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-slate-800 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500/50">
                    <option value="ClusterIP">ClusterIP</option>
                    <option value="NodePort">NodePort</option>
                    <option value="LoadBalancer">LoadBalancer</option>
                </select>
            </div>
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Selector Labels</label>
                {s.selectorLabels.map((l, i) => (
                    <div key={i} className="flex gap-1 mt-1">
                        <input value={l.key} onChange={e => updateSel(i, 'key', e.target.value)} placeholder="app"
                            className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none font-mono" />
                        <span className="text-slate-500 self-center">=</span>
                        <input value={l.value} onChange={e => updateSel(i, 'value', e.target.value)} placeholder="my-app"
                            className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none font-mono" />
                        <button onClick={() => setS(prev => ({ ...prev, selectorLabels: prev.selectorLabels.filter((_, j) => j !== i) }))}
                            className="text-slate-500 hover:text-red-400"><Trash2 size={11} /></button>
                    </div>
                ))}
                <button onClick={() => setS(prev => ({ ...prev, selectorLabels: [...prev.selectorLabels, { key: '', value: '' }] }))}
                    className="mt-1 text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus size={10} /> Add label</button>
            </div>
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ports</label>
                {s.ports.map((p, i) => (
                    <div key={i} className="flex gap-1 mt-1 items-center">
                        <select value={p.protocol} onChange={e => updatePort(i, 'protocol', e.target.value as 'TCP' | 'UDP')}
                            className="w-16 px-1 py-1 text-[10px] bg-slate-800 border border-white/10 rounded text-slate-200 focus:outline-none">
                            <option>TCP</option><option>UDP</option>
                        </select>
                        <input value={p.port} onChange={e => updatePort(i, 'port', e.target.value)} placeholder="port"
                            className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none font-mono" />
                        <span className="text-slate-500 text-[9px]">→</span>
                        <input value={p.targetPort} onChange={e => updatePort(i, 'targetPort', e.target.value)} placeholder="targetPort"
                            className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none font-mono" />
                        <button onClick={() => setS(prev => ({ ...prev, ports: prev.ports.filter((_, j) => j !== i) }))}
                            className="text-slate-500 hover:text-red-400"><Trash2 size={11} /></button>
                    </div>
                ))}
                <button onClick={() => setS(prev => ({ ...prev, ports: [...prev.ports, { protocol: 'TCP', port: '', targetPort: '' }] }))}
                    className="mt-1 text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus size={10} /> Add port</button>
            </div>
        </div>
    )
}
