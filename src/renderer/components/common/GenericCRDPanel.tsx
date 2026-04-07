import React, { useEffect, useState, useCallback } from 'react'
import { Database, Activity } from 'lucide-react'
import { useDragResize } from '../../hooks/useDragResize'
import { GenericCRDDetail } from './GenericCRDDetail'
import { formatAge } from '../../types'

interface CRDInstance {
  metadata: {
    name: string
    namespace?: string
    uid?: string
    creationTimestamp?: string
  }
  [key: string]: unknown
}

const getInstanceKey = (inst: CRDInstance | null): string | null => {
  if (!inst) return null
  const { metadata } = inst
  return metadata.uid ?? `${metadata.namespace ?? ''}/${metadata.name}`
}

const getMetadataKey = (meta: CRDInstance['metadata'] | null): string | null => {
  if (!meta) return null
  return meta.uid ?? `${meta.namespace ?? ''}/${meta.name}`
}

interface Props {
  /** CRD full name e.g. "virtualservices.networking.istio.io" */
  crdName: string
  context: string
  namespace: string | null
  onCountLoaded?: (count: number) => void
}

export function GenericCRDPanel({ crdName, context, namespace, onCountLoaded }: Props) {
  const [items, setItems] = useState<CRDInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<CRDInstance | null>(null)
  const { width: detailWidth, onMouseDown: handleResizeMouseDown } = useDragResize(380, 280, 600)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.kubectl.getCustomResource(context, namespace, crdName)
      const loaded = Array.isArray(result) ? (result as CRDInstance[]) : []
      setItems(loaded)
      onCountLoaded?.(loaded.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [context, namespace, crdName])

  useEffect(() => {
    setSelected(null)
    load()
  }, [load])

  const showNamespaceCol = !namespace || namespace === '_all'

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <div className="flex-1 overflow-auto scrollbar-hide">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="p-8 text-center bg-red-500/5 rounded-3xl border border-red-500/10 m-4">
            <Activity size={32} className="mx-auto text-red-400 mb-4" />
            <p className="text-sm font-bold text-red-400 uppercase tracking-widest mb-2">Discovery Failed</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">{error}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.01] overflow-hidden m-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-white/10">
                  <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Name</th>
                  {showNamespaceCol && (
                    <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Namespace</th>
                  )}
                  <th className="px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {items.map(inst => (
                  <tr
                    key={getInstanceKey(inst) ?? ''}
                    onClick={() => {
                      const key = getInstanceKey(inst)
                      const selKey = getInstanceKey(selected ?? null)
                      setSelected(selKey === key ? null : inst)
                    }}
                    className={`cursor-pointer hover:bg-white/5 transition-colors ${
                      getInstanceKey(selected ?? null) === getInstanceKey(inst) ? 'bg-blue-500/5' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold text-slate-300 font-mono break-all">{inst.metadata.name}</span>
                    </td>
                    {showNamespaceCol && (
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          {inst.metadata.namespace ?? '—'}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold text-slate-400">
                        {inst.metadata.creationTimestamp ? formatAge(inst.metadata.creationTimestamp) : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={showNamespaceCol ? 3 : 2} className="py-20 text-center">
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

      {/* Resize handle + detail pane */}
      {selected && (
        <>
          <div
            onMouseDown={handleResizeMouseDown}
            className="w-1 cursor-col-resize bg-slate-100 dark:bg-white/5 hover:bg-blue-500/40 transition-colors shrink-0 select-none"
            title="Drag to resize"
          />
          <div
            style={{ width: detailWidth }}
            className="shrink-0 overflow-y-auto border-l border-slate-100 dark:border-white/5"
          >
            <GenericCRDDetail
              item={selected as Record<string, unknown>}
              context={context}
              namespace={namespace ?? selected.metadata.namespace ?? null}
              crdName={crdName}
              onAfterSave={load}
            />
          </div>
        </>
      )}
    </div>
  )
}
