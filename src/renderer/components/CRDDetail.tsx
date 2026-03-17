import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { KubeCRD } from '../types'
import { formatAge } from '../types'
import { FileCode, X, Activity, Database, Info, Layers } from 'lucide-react'
import YAMLViewer from './YAMLViewer'

interface CRDInstance {
  metadata: {
    name: string
    namespace?: string
    creationTimestamp: string
    uid: string
  }
  [key: string]: unknown
}

export default function CRDDetail({ crd }: { crd: KubeCRD }) {
  const { selectedContext: ctx, selectedNamespace: ns, getYAML, applyYAML, refresh } = useAppStore()
  const [instances, setInstances] = useState<CRDInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [yamlContextName, setYamlContextName] = useState<string>('')

  const plural = crd.spec.names.plural
  const isNamespaced = crd.spec.scope === 'Namespaced'
  const nsArg = isNamespaced ? (ns === '_all' ? null : ns) : null

  useEffect(() => {
    if (!ctx) return
    setLoading(true)
    setError(null)
    window.kubectl.getCustomResource(ctx, nsArg, plural)
      .then(items => setInstances(items as CRDInstance[]))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [ctx, ns, plural])

  const handleViewDefinitionYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    setYamlContextName(`Definition: ${crd.metadata.name}`)
    try {
      const content = await getYAML('customresourcedefinition', crd.metadata.name, false)
      setYaml(content)
    } catch (err) {
      setYamlError((err as Error).message ?? 'Failed to fetch YAML')
    } finally {
      setYamlLoading(false)
    }
  }

  const handleViewInstanceYAML = async (instance: CRDInstance) => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    setYamlContextName(`Instance: ${instance.metadata.name}`)
    try {
      const nsForYAML = isNamespaced ? (instance.metadata.namespace ?? null) : null
      const content = await window.kubectl.getYAML(ctx!, nsForYAML, plural, instance.metadata.name)
      setYaml(content)
    } catch (err) {
      setYamlError((err as Error).message ?? 'Failed to fetch YAML')
    } finally {
      setYamlLoading(false)
    }
  }

  const handleApplyYAML = async (newYaml: string) => {
    try {
      await applyYAML(newYaml)
      refresh()
      setYaml(null)
    } catch (err) {
      throw err
    }
  }

  return (
    <div className="flex flex-col w-full h-full relative font-sans">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
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
          <span className="flex items-center gap-1.5"><Layers size={12} className="text-slate-600" /> Instances: <span className="text-slate-300">{instances.length}</span></span>
        </div>
      </div>

      {/* Instances */}
      <div className="flex-1 overflow-auto p-4 scrollbar-hide">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-8 text-center bg-red-500/5 rounded-3xl border border-red-500/10">
            <Activity size={32} className="mx-auto text-red-400 mb-4" />
            <p className="text-sm font-bold text-red-400 uppercase tracking-widest mb-2">Discovery Failed</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">{error}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.01] overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                  <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Instance Name</th>
                  {isNamespaced && (
                    <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Namespace</th>
                  )}
                  <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Age</th>
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {instances.map(inst => (
                  <tr key={inst.metadata.uid || inst.metadata.name} className="hover:bg-white/5 transition-colors group">
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold text-slate-300 font-mono break-all">{inst.metadata.name}</span>
                    </td>
                    {isNamespaced && (
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{inst.metadata.namespace || '-'}</span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold text-slate-400">{formatAge(inst.metadata.creationTimestamp)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleViewInstanceYAML(inst)}
                        className="opacity-0 group-hover:opacity-100 px-3 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-widest border border-blue-500/20 hover:bg-blue-500/20 transition-all"
                      >
                        Edit YAML
                      </button>
                    </td>
                  </tr>
                ))}
                {instances.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-20 text-center">
                      <Database size={32} className="mx-auto text-slate-700 mb-4 opacity-20" />
                      <p className="text-sm text-slate-500 font-medium">No resource instances found</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Premium YAML Modal */}
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
                  {yamlLoading ? 'Loading YAML…' : `${yamlContextName}`}
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
                  onSave={handleApplyYAML}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
