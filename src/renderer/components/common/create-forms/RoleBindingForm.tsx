import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useAppStore } from '../../../store'
import { RoleBindingFormState, RoleSubject, generateRoleBindingYAML, DNS_LABEL_RE } from './generateYAML'

interface Props { onChange: (yaml: string) => void }

function newSubject(id: number): RoleSubject {
    return { kind: 'ServiceAccount', name: '', namespace: 'default', _rowId: id }
}

export default function RoleBindingForm({ onChange }: Props): JSX.Element {
    const namespaces = useAppStore(s => s.namespaces)
    const selectedNamespace = useAppStore(s => s.selectedNamespace)
    const rowId = useRef(0)
    const [s, setS] = useState<RoleBindingFormState>({
        name: '',
        namespace: selectedNamespace && selectedNamespace !== '_all' ? selectedNamespace : 'default',
        roleRefKind: 'Role',
        roleRefName: '',
        subjects: [newSubject(rowId.current++)],
    })

    const isValid = s.name && s.roleRefName && s.subjects.some(sub => sub.name.trim())
    useEffect(() => {
        if (isValid) onChange(generateRoleBindingYAML(s))
        else onChange('')
    }, [s, onChange, isValid])

    const updateSubject = <K extends keyof RoleSubject>(idx: number, field: K, value: RoleSubject[K]) =>
        setS(p => {
            const subjects = [...p.subjects]
            subjects[idx] = { ...subjects[idx], [field]: value }
            return { ...p, subjects }
        })

    return (
        <div className="space-y-4">
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Name *</label>
                <input value={s.name} onChange={e => setS(p => ({ ...p, name: e.target.value }))} placeholder="my-rolebinding"
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

            <div className="border border-white/10 rounded-lg p-3 bg-white/[0.02] space-y-2">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Role Ref</span>
                <div className="flex gap-2">
                    <div className="w-32 shrink-0">
                        <label className="text-[9px] text-slate-500 uppercase tracking-widest">Kind</label>
                        <select value={s.roleRefKind} onChange={e => setS(p => ({ ...p, roleRefKind: e.target.value as 'Role' | 'ClusterRole' }))}
                            className="w-full mt-0.5 px-2 py-1 text-[10px] bg-slate-800 border border-white/10 rounded text-slate-200 focus:outline-none">
                            <option value="Role">Role</option>
                            <option value="ClusterRole">ClusterRole</option>
                        </select>
                    </div>
                    <div className="flex-1">
                        <label className="text-[9px] text-slate-500 uppercase tracking-widest">Name *</label>
                        <input value={s.roleRefName} onChange={e => setS(p => ({ ...p, roleRefName: e.target.value }))}
                            placeholder="my-role"
                            className="w-full mt-0.5 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none font-mono" />
                    </div>
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Subjects</label>
                    <button onClick={() => setS(p => ({ ...p, subjects: [...p.subjects, newSubject(rowId.current++)] }))}
                        className="text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus size={10} /> Add</button>
                </div>
                <div className="space-y-2">
                    {s.subjects.map((sub, i) => (
                        <div key={sub._rowId} className="border border-white/10 rounded-lg p-3 bg-white/[0.02] space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex gap-2 flex-1">
                                    <div className="w-36 shrink-0">
                                        <label className="text-[9px] text-slate-500 uppercase tracking-widest">Kind</label>
                                        <select value={sub.kind} onChange={e => updateSubject(i, 'kind', e.target.value as RoleSubject['kind'])}
                                            className="w-full mt-0.5 px-2 py-1 text-[10px] bg-slate-800 border border-white/10 rounded text-slate-200 focus:outline-none">
                                            <option value="ServiceAccount">ServiceAccount</option>
                                            <option value="User">User</option>
                                            <option value="Group">Group</option>
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-[9px] text-slate-500 uppercase tracking-widest">Name *</label>
                                        <input value={sub.name} onChange={e => updateSubject(i, 'name', e.target.value)}
                                            placeholder="subject-name"
                                            className="w-full mt-0.5 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none font-mono" />
                                    </div>
                                </div>
                                {s.subjects.length > 1 && (
                                    <button onClick={() => setS(p => ({ ...p, subjects: p.subjects.filter((_, j) => j !== i) }))}
                                        className="text-slate-600 hover:text-red-400 ml-2 self-start mt-4 transition-colors"><Trash2 size={10} /></button>
                                )}
                            </div>
                            {sub.kind === 'ServiceAccount' && (
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase tracking-widest">Namespace</label>
                                    <select value={sub.namespace} onChange={e => updateSubject(i, 'namespace', e.target.value)}
                                        className="w-full mt-0.5 px-2 py-1 text-[10px] bg-slate-800 border border-white/10 rounded text-slate-200 focus:outline-none">
                                        {namespaces.map(ns => <option key={ns.metadata.name} value={ns.metadata.name}>{ns.metadata.name}</option>)}
                                        {namespaces.length === 0 && <option value="default">default</option>}
                                    </select>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
