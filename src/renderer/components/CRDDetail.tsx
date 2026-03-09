import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { KubeCRD } from '../types'
import { formatAge } from '../types'
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
  const { selectedContext: ctx, selectedNamespace: ns } = useAppStore()
  const [instances, setInstances] = useState<CRDInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [yamlTarget, setYamlTarget] = useState<CRDInstance | null>(null)
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)

  const plural = crd.spec.names.plural
  const isNamespaced = crd.spec.scope === 'Namespaced'
  const nsArg = isNamespaced ? (ns === '_all' ? null : ns) : null

  useEffect(() => {
    if (!ctx) return
    setLoading(true)
    setError(null)
    setInstances([])
    setYamlTarget(null)
    setYaml(null)
    window.kubectl.getCustomResource(ctx, nsArg, plural)
      .then(items => setInstances(items as CRDInstance[]))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [ctx, ns, plural])

  const handleViewYAML = async (instance: CRDInstance) => {
    setYamlTarget(instance)
    setYaml(null)
    setYamlLoading(true)
    try {
      const nsForYAML = isNamespaced ? (instance.metadata.namespace ?? null) : null
      const result = await window.kubectl.getYAML(ctx!, nsForYAML, plural, instance.metadata.name)
      setYaml(result)
    } catch (e) {
      setYaml(`# Error: ${(e as Error).message}`)
    } finally {
      setYamlLoading(false)
    }
  }

  // ── YAML viewer overlay ──────────────────────────────────────────────────────
  if (yamlTarget) {
    return (
      <>
        <div className="px-8 py-5 border-b border-slate-200 dark:border-white/5 shrink-0 flex items-center gap-3">
          <button
            onClick={() => { setYamlTarget(null); setYaml(null) }}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          </button>
          <div>
            <p className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">{yamlTarget.metadata.name}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-0.5">{crd.spec.names.kind}</p>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          {yamlLoading ? (
            <div className="flex items-center justify-center h-full text-xs text-slate-400">Loading…</div>
          ) : yaml !== null ? (
            <YAMLViewer content={yaml} />
          ) : null}
        </div>
      </>
    )
  }

  // ── Main panel ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="px-8 py-6 border-b border-slate-200 dark:border-white/5 shrink-0 bg-white/5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_#a855f7]" />
          <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono truncate">
            {crd.spec.names.kind}
          </h3>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-5">
          <span>Group: <span className="text-slate-600 dark:text-slate-300 font-mono normal-case">{crd.spec.group}</span></span>
          <span>Plural: <span className="text-slate-600 dark:text-slate-300 font-mono normal-case">{plural}</span></span>
          <span>Scope: <span className={isNamespaced ? 'text-blue-500' : 'text-orange-500'}>{crd.spec.scope}</span></span>
        </div>
      </div>

      {/* Instances */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-xs text-slate-400">
            Fetching {crd.spec.names.kind} instances…
          </div>
        ) : error ? (
          <div className="px-8 py-6">
            <p className="text-xs font-bold text-red-400 mb-1">Failed to load instances</p>
            <p className="text-xs text-slate-400 break-words">{error}</p>
          </div>
        ) : instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-slate-400">
            <span className="text-2xl">◻</span>
            <p className="text-xs font-bold uppercase tracking-widest">No {crd.spec.names.kind} resources found</p>
            {isNamespaced && ns !== '_all' && (
              <p className="text-[10px] text-slate-500">Try switching to "All Namespaces"</p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-white/70 dark:bg-[hsl(var(--bg-dark),_0.7)] backdrop-blur-xl z-10">
              <tr className="border-b border-slate-100 dark:border-white/5">
                <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                {isNamespaced && (
                  <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Namespace</th>
                )}
                <th className="text-left px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Age</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
              {instances.map(inst => (
                <tr
                  key={inst.metadata.uid || inst.metadata.name}
                  className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                >
                  <td className="px-6 py-3 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                    {inst.metadata.name}
                  </td>
                  {isNamespaced && (
                    <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500 font-mono">
                      {inst.metadata.namespace ?? '—'}
                    </td>
                  )}
                  <td className="px-6 py-3 text-xs text-slate-400 dark:text-slate-500">
                    {formatAge(inst.metadata.creationTimestamp)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleViewYAML(inst)}
                      className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      YAML
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
