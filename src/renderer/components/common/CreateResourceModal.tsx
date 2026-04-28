import React, { useState } from 'react'
import { Editor } from '@monaco-editor/react'
import { useAppStore } from '../../store'
import { useShallow } from 'zustand/react/shallow'
import { X } from 'lucide-react'
import DeploymentForm from './create-forms/DeploymentForm'
import ServiceForm from './create-forms/ServiceForm'
import ConfigMapForm from './create-forms/ConfigMapForm'
import SecretForm from './create-forms/SecretForm'
import NamespaceForm from './create-forms/NamespaceForm'

export type CreatableKind = 'deployment' | 'service' | 'configmap' | 'secret' | 'namespace'

interface Props {
    kind: CreatableKind
    onClose: () => void
}

const TITLES: Record<CreatableKind, string> = {
    deployment: 'New Deployment',
    service: 'New Service',
    configmap: 'New ConfigMap',
    secret: 'New Secret',
    namespace: 'New Namespace',
}

export default function CreateResourceModal({ kind, onClose }: Props): JSX.Element {
    const { selectedContext, applyYAML, loadSection, section } = useAppStore(useShallow(s => ({
        selectedContext: s.selectedContext,
        applyYAML: s.applyYAML,
        loadSection: s.loadSection,
        section: s.section,
    })))

    const [generatedYaml, setGeneratedYaml] = useState('')
    const [applying, setApplying] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const handleCreate = async () => {
        if (!generatedYaml || !selectedContext) return
        setApplying(true)
        setError(null)
        try {
            await applyYAML(generatedYaml)
            setSuccess(true)
            await loadSection(section)
            setTimeout(onClose, 800)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setApplying(false)
        }
    }

    const theme = document.documentElement.classList.contains('dark') ? 'vs-dark' : 'light'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-[900px] max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">
                        {TITLES[kind]}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                        <X size={16} className="text-slate-400" />
                    </button>
                </div>

                {/* Body: form left + YAML right */}
                <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Form column */}
                    <div className="w-[380px] shrink-0 overflow-y-auto border-r border-slate-100 dark:border-white/5 p-5">
                        {kind === 'deployment' && <DeploymentForm onChange={setGeneratedYaml} />}
                        {kind === 'service'    && <ServiceForm    onChange={setGeneratedYaml} />}
                        {kind === 'configmap'  && <ConfigMapForm  onChange={setGeneratedYaml} />}
                        {kind === 'secret'     && <SecretForm     onChange={setGeneratedYaml} />}
                        {kind === 'namespace'  && <NamespaceForm  onChange={setGeneratedYaml} />}
                    </div>

                    {/* YAML preview column */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <div className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-white/5 shrink-0">
                            YAML Preview
                        </div>
                        <div className="flex-1">
                            <Editor
                                height="100%"
                                language="yaml"
                                value={generatedYaml}
                                theme={theme}
                                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, lineNumbers: 'on' }}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 dark:border-white/5 shrink-0 flex items-center justify-between">
                    <div className="text-[10px]">
                        {error && <span className="text-red-400 font-bold">{error}</span>}
                        {success && <span className="text-emerald-400 font-bold">Created successfully!</span>}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all">
                            Cancel
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={!generatedYaml || applying}
                            className="text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {applying ? 'Creating…' : 'Create'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
