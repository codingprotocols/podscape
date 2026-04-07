import React, { useState } from 'react'
import { useAppStore } from '../../../store'
import { KubeCRD } from '../../../types'
import { FileCode, Info, Layers, X, Activity, ChevronLeft } from 'lucide-react'
import { useYAMLEditor } from '../../../hooks/useYAMLEditor'
import YAMLViewer from '../../common/YAMLViewer'
import { GenericCRDPanel } from '../../common/GenericCRDPanel'

export default function CRDDetail({ crd, onBack }: { crd: KubeCRD; onBack?: () => void }) {
  const { selectedContext: ctx, selectedNamespace: ns, getYAML } = useAppStore()
  const { apply: applyYAML } = useYAMLEditor()

  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [instanceCount, setInstanceCount] = useState<number | null>(null)

  const plural = crd.spec.names.plural
  const crdFullName = `${crd.spec.names.plural}.${crd.spec.group}`
  const isNamespaced = crd.spec.scope === 'Namespaced'
  const nsArg = isNamespaced ? (ns === '_all' ? null : ns) : null

  const handleViewDefinitionYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    try {
      const content = await getYAML('customresourcedefinition', crd.metadata.name, false)
      setYaml(content)
    } catch (err) {
      setYamlError((err as Error).message ?? 'Failed to fetch YAML')
    } finally {
      setYamlLoading(false)
    }
  }

  return (
    <div className="flex flex-col w-full h-full relative font-sans">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors mb-4 group"
          >
            <ChevronLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
            CRDs
          </button>
        )}
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{crd.spec.names.kind}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{crd.spec.group}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleViewDefinitionYAML}
              disabled={yamlLoading}
              className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2 group disabled:opacity-50"
            >
              <FileCode size={14} className="group-hover:text-blue-400 transition-colors" />
              Definition YAML
            </button>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold outline outline-1 ${isNamespaced ? 'bg-blue-500/10 text-blue-500 outline-blue-500/20' : 'bg-orange-500/10 text-orange-500 outline-orange-500/20'}`}>
              {crd.spec.scope.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          <span className="flex items-center gap-1.5"><Info size={12} className="text-slate-600" /> Plural: <span className="text-slate-300 font-mono normal-case">{plural}</span></span>
          <span className="flex items-center gap-1.5"><Layers size={12} className="text-slate-600" /> Full Name: <span className="text-slate-300 font-mono normal-case">{crdFullName}</span></span>
          {instanceCount !== null && (
            <span className="flex items-center gap-1.5 text-slate-400">Instances: <span className="text-slate-300">{instanceCount}</span></span>
          )}
        </div>
      </div>

      {/* Instances — GenericCRDPanel handles list + resizable detail + YAML edit */}
      <div className="flex-1 overflow-hidden">
        {ctx && (
          <GenericCRDPanel
            crdName={crdFullName}
            context={ctx}
            namespace={nsArg}
            onCountLoaded={setInstanceCount}
          />
        )}
      </div>

      {/* Definition YAML Modal */}
      {(yamlLoading || yaml !== null || yamlError !== null) && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-[hsl(var(--bg-dark))] rounded-3xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-5xl h-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 dark:border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                  {yamlLoading
                    ? <div className="w-4 h-4 border-2 border-slate-400 border-t-blue-500 rounded-full animate-spin" />
                    : <FileCode size={18} className="text-blue-500" />
                  }
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">
                  {yamlLoading ? 'Loading YAML…' : `Definition: ${crd.metadata.name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setYaml(null); setYamlError(null); setYamlLoading(false) }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 transition-colors focus:outline-none"
              >
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 min-h-0 bg-slate-950">
              {yamlError ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                    <Activity size={20} className="text-red-400" />
                  </div>
                  <p className="text-sm font-bold text-red-400 uppercase tracking-widest">Failed to load manifest</p>
                  <pre className="text-xs text-slate-400 max-w-lg break-words whitespace-pre-wrap font-mono bg-white/5 p-4 rounded-xl border border-white/5">{yamlError}</pre>
                </div>
              ) : yamlLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : yaml !== null ? (
                <YAMLViewer editable
                  content={yaml}
                  onSave={async (newYaml) => { await applyYAML(newYaml); setYaml(null) }}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
