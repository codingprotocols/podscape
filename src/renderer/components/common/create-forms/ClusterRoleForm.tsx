import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ClusterRoleFormState, PolicyRule, RBAC_VERBS, generateClusterRoleYAML, DNS_LABEL_RE } from './generateYAML'

interface Props { onChange: (yaml: string) => void }

function newRule(id: number): PolicyRule {
    return { apiGroups: '', resources: '', verbs: [], _rowId: id }
}

export default function ClusterRoleForm({ onChange }: Props): JSX.Element {
    const rowId = useRef(0)
    const [s, setS] = useState<ClusterRoleFormState>({
        name: '',
        rules: [newRule(rowId.current++)],
    })

    useEffect(() => {
        if (s.name) onChange(generateClusterRoleYAML(s))
        else onChange('')
    }, [s, onChange])

    const toggleVerb = (ruleIdx: number, verb: string) =>
        setS(p => {
            const rules = [...p.rules]
            const r = { ...rules[ruleIdx] }
            r.verbs = r.verbs.includes(verb) ? r.verbs.filter(v => v !== verb) : [...r.verbs, verb]
            rules[ruleIdx] = r
            return { ...p, rules }
        })

    const updateRule = (ruleIdx: number, field: 'apiGroups' | 'resources', value: string) =>
        setS(p => {
            const rules = [...p.rules]
            rules[ruleIdx] = { ...rules[ruleIdx], [field]: value }
            return { ...p, rules }
        })

    return (
        <div className="space-y-4">
            <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Name *</label>
                <input value={s.name} onChange={e => setS(p => ({ ...p, name: e.target.value }))} placeholder="my-clusterrole"
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono" />
                {s.name && !DNS_LABEL_RE.test(s.name) && <p className="text-[9px] text-red-400 mt-1">Must be lowercase letters, digits, or hyphens</p>}
            </div>

            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Rules</label>
                    <button onClick={() => setS(p => ({ ...p, rules: [...p.rules, newRule(rowId.current++)] }))}
                        className="text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus size={10} /> Add rule</button>
                </div>
                <div className="space-y-3">
                    {s.rules.map((rule, i) => (
                        <div key={rule._rowId} className="border border-white/10 rounded-lg p-3 bg-white/[0.02] space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Rule {i + 1}</span>
                                {s.rules.length > 1 && (
                                    <button onClick={() => setS(p => ({ ...p, rules: p.rules.filter((_, j) => j !== i) }))}
                                        className="text-slate-600 hover:text-red-400 transition-colors"><Trash2 size={10} /></button>
                                )}
                            </div>
                            <div>
                                <label className="text-[9px] text-slate-500 uppercase tracking-widest">API Groups <span className="normal-case font-normal text-slate-600">(comma-sep, blank = core)</span></label>
                                <input value={rule.apiGroups} onChange={e => updateRule(i, 'apiGroups', e.target.value)}
                                    placeholder='apps, "" for core'
                                    className="w-full mt-0.5 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none font-mono" />
                            </div>
                            <div>
                                <label className="text-[9px] text-slate-500 uppercase tracking-widest">Resources <span className="normal-case font-normal text-slate-600">(comma-sep)</span></label>
                                <input value={rule.resources} onChange={e => updateRule(i, 'resources', e.target.value)}
                                    placeholder="pods, deployments"
                                    className="w-full mt-0.5 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-slate-200 focus:outline-none font-mono" />
                            </div>
                            <div>
                                <label className="text-[9px] text-slate-500 uppercase tracking-widest mb-1.5 block">Verbs</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {RBAC_VERBS.map(verb => {
                                        const active = rule.verbs.includes(verb)
                                        return (
                                            <button key={verb} type="button" onClick={() => toggleVerb(i, verb)}
                                                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border transition-colors ${
                                                    active
                                                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                                                        : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'
                                                }`}>
                                                {verb}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
