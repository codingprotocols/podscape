import React, { useState } from 'react'
import { FileCode, X } from 'lucide-react'
import YAMLViewer from './YAMLViewer'
import { useYAMLEditor } from '../../hooks/useYAMLEditor'
import { AnyKubeResource } from '../../types'

type Tab = 'overview' | 'yaml'

interface Props {
  resource: AnyKubeResource
  /** Exact kind string the sidecar's getYAML endpoint expects, e.g. "mutatingwebhookconfiguration" */
  kind: string
  clusterScoped: boolean
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 items-start">
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0 w-28">{label}</span>
      <span className="text-xs text-slate-300 break-all font-mono">{value || '—'}</span>
    </div>
  )
}

export function GenericResourceDetail({ resource, kind, clusterScoped }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('overview')
  const { yaml, loading, error, open, apply, close } = useYAMLEditor()

  const meta = resource.metadata
  const labels = meta.labels ?? {}
  // Every field on the resource except the ones metadata/kind/apiVersion already
  // cover — this is what makes the component generic across resource kinds.
  const { metadata: _m, kind: _k, apiVersion: _a, ...rest } = resource as unknown as Record<string, unknown>

  const handleOpenYaml = () => {
    setTab('yaml')
    void open(kind, meta.name, clusterScoped, clusterScoped ? undefined : meta.namespace)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 shrink-0">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{meta.name}</h3>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
          {resource.kind ?? kind}
          {!clusterScoped && meta.namespace ? ` · ${meta.namespace}` : ''}
        </p>
      </div>

      <div className="flex gap-1 px-6 pt-3 border-b border-slate-100 dark:border-white/5 shrink-0">
        <button
          onClick={() => setTab('overview')}
          className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-t-lg ${tab === 'overview' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}
        >
          Overview
        </button>
        <button
          onClick={handleOpenYaml}
          className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-t-lg flex items-center gap-1.5 ${tab === 'yaml' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-500'}`}
        >
          <FileCode size={12} /> YAML
        </button>
        {tab === 'yaml' && yaml !== null && (
          <button
            onClick={() => { close(); setTab('overview') }}
            className="ml-auto px-2 py-1.5 text-slate-500 hover:text-slate-300"
            aria-label="Close YAML view"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && (
          <div className="space-y-4">
            <Row label="Name" value={meta.name} />
            {!clusterScoped && <Row label="Namespace" value={meta.namespace ?? ''} />}
            <Row label="Created" value={meta.creationTimestamp ?? ''} />
            {Object.keys(labels).length > 0 && (
              <div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Labels</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(labels).map(([k, v]) => (
                    <span key={k} className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/5 border border-white/10">
                      {k}={String(v)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Fields</span>
              <pre className="mt-2 text-[11px] font-mono text-slate-300 bg-black/20 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(rest, null, 2)}
              </pre>
            </div>
          </div>
        )}
        {tab === 'yaml' && (
          <>
            {loading && <p className="text-xs text-slate-500">Loading YAML…</p>}
            {error && <p className="text-xs text-red-400">{error}</p>}
            {yaml !== null && !loading && !error && <YAMLViewer editable content={yaml} onSave={apply} />}
          </>
        )}
      </div>
    </div>
  )
}

export default GenericResourceDetail
