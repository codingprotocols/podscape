import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Activity } from 'lucide-react'
import jsYaml from 'js-yaml'
import YAMLViewer from './YAMLViewer'
import { useYAMLEditor } from '../../hooks/useYAMLEditor'

type Tab = 'metadata' | 'spec' | 'yaml'

interface Props {
  item: Record<string, unknown>
  context: string
  namespace: string | null
  /** CRD full name e.g. "virtualservices.networking.istio.io" — used for YAML fetch */
  crdName: string
  /** Called after a successful YAML apply so parent can refresh its list */
  onAfterSave?: () => void
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 items-start">
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0 w-28">{label}</span>
      <span className={`text-xs text-slate-300 break-all ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}

export function GenericCRDDetail({ item, context, namespace, crdName, onAfterSave }: Props) {
  const [tab, setTab] = useState<Tab>('metadata')
  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)

  const { apply: applyYAML } = useYAMLEditor()

  const meta = (item.metadata ?? {}) as Record<string, unknown>
  const spec = (item.spec ?? {}) as Record<string, unknown>
  const kind = String(item.kind ?? 'Resource')
  const name = String(meta.name ?? '—')
  const ns = String(meta.namespace ?? namespace ?? '')

  // Reset YAML state when the selected item changes so stale YAML is never shown
  const yamlFetchedRef = useRef(false)
  useEffect(() => {
    setYaml(null)
    setYamlError(null)
    setYamlLoading(false)
    yamlFetchedRef.current = false
  }, [name, crdName])

  const handleOpenYAMLTab = useCallback(async () => {
    setTab('yaml')
    if (yamlFetchedRef.current) return
    yamlFetchedRef.current = true
    setYamlLoading(true)
    setYamlError(null)
    try {
      const nsArg = ns || null
      const content = await window.kubectl.getYAML(context, nsArg, crdName, name)
      setYaml(content)
    } catch (err) {
      setYamlError((err as Error).message ?? 'Failed to fetch YAML')
      yamlFetchedRef.current = false
    } finally {
      setYamlLoading(false)
    }
  }, [context, ns, crdName, name])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'metadata', label: 'Metadata' },
    { id: 'spec', label: 'Spec' },
    { id: 'yaml', label: 'YAML Edit' },
  ]

  const handleTabClick = (id: Tab) => {
    if (id === 'yaml') {
      handleOpenYAMLTab()
    } else {
      setTab(id)
    }
  }

  return (
    <div className="flex flex-col w-full h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 shrink-0">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
          {ns} · {kind}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-100 dark:border-white/5 shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => handleTabClick(t.id)}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
              tab === t.id
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {tab === 'metadata' && (
          <div className="p-4 space-y-3">
            <Row label="Name" value={name} mono />
            <Row label="Namespace" value={ns} />
            <Row label="API Version" value={String(item.apiVersion ?? '—')} mono />
            <Row label="Kind" value={kind} />
            {!!meta.creationTimestamp && (
              <Row label="Created" value={String(meta.creationTimestamp)} />
            )}
            {!!meta.labels && typeof meta.labels === 'object' && Object.keys(meta.labels as object).length > 0 && (
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Labels</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(meta.labels as Record<string, string>).map(([k, v]) => (
                    <span
                      key={k}
                      className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-mono border border-blue-500/20"
                    >
                      {k}={v}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!!meta.annotations && typeof meta.annotations === 'object' && Object.keys(meta.annotations as object).length > 0 && (
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Annotations</p>
                <div className="space-y-1">
                  {Object.entries(meta.annotations as Record<string, string>).map(([k, v]) => (
                    <div key={k} className="flex gap-2 items-start">
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">{k}:</span>
                      <span className="text-[10px] font-mono text-slate-500 break-all">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'spec' && (
          <div className="p-4">
            {Object.keys(spec).length > 0 ? (
              <pre className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                {jsYaml.dump(spec, { indent: 2, lineWidth: -1 })}
              </pre>
            ) : (
              <p className="text-xs text-slate-500">No spec fields.</p>
            )}
          </div>
        )}

        {tab === 'yaml' && (
          <div className="h-full flex flex-col">
            {yamlLoading && (
              <div className="flex items-center justify-center flex-1 py-20">
                <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}
            {yamlError && (
              <div className="p-4 flex flex-col items-center gap-2">
                <Activity size={24} className="text-red-400" />
                <p className="text-xs text-red-400 font-bold">{yamlError}</p>
              </div>
            )}
            {yaml !== null && !yamlLoading && (
              <YAMLViewer
                editable
                content={yaml}
                onSave={async (newYaml) => {
                  try {
                    await applyYAML(newYaml)
                    setYaml(null)
                    yamlFetchedRef.current = false
                    onAfterSave?.()
                  } catch (err) {
                    setYamlError((err as Error).message ?? 'Failed to apply YAML')
                  }
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
