import React, { useState } from 'react'
import type { KubeSecret } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import { Eye, EyeOff, Key, Copy, Check, FileCode, X, Activity } from 'lucide-react'
import YAMLViewer from './YAMLViewer'

interface Props { secret: KubeSecret }

export default function SecretDetail({ secret }: Props): JSX.Element {
  const { getSecretValue, getYAML, applyYAML, refresh } = useAppStore()
  const entries = Object.entries(secret.data ?? {})
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)

  const [yaml, setYaml] = useState<string | null>(null)
  const [yamlLoading, setYamlLoading] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)

  const handleReveal = async (key: string) => {
    if (revealed[key]) {
      const newRevealed = { ...revealed }
      delete newRevealed[key]
      setRevealed(newRevealed)
      return
    }

    setLoading({ ...loading, [key]: true })
    try {
      const value = await getSecretValue(secret.metadata.name, key, secret.metadata.namespace ?? 'default')
      setRevealed({ ...revealed, [key]: value })
    } catch (err) {
      console.error('Failed to reveal secret:', err)
    } finally {
      setLoading({ ...loading, [key]: false })
    }
  }

  const handleCopy = (value: string, key: string) => {
    navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleViewYAML = async () => {
    setYaml(null); setYamlError(null); setYamlLoading(true)
    try {
      const content = await getYAML('secret', secret.metadata.name, false, secret.metadata.namespace)
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
    <div className="flex flex-col w-full h-full relative">
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{secret.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
              {secret.metadata.namespace} · {secret.type} · {formatAge(secret.metadata.creationTimestamp)} ago
            </p>
          </div>
          <button
            onClick={handleViewYAML}
            disabled={yamlLoading}
            className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5 hover:border-white/10 transition-all flex items-center gap-2 group disabled:opacity-50"
          >
            <FileCode size={14} className="group-hover:text-blue-400 transition-colors" />
            {yamlLoading ? 'Loading...' : 'YAML'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Key size={14} className="text-slate-400" />
            <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-widest">Data ({entries.length} items)</h4>
          </div>

          {entries.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 dark:bg-white/[0.02] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
              <p className="text-xs text-slate-400">No data entries in this secret</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {entries.map(([key]) => (
                <div key={key} className="bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold font-mono text-slate-700 dark:text-slate-200 truncate">{key}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {revealed[key] && (
                        <button
                          onClick={() => handleCopy(revealed[key], key)}
                          className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors"
                          title="Copy value"
                        >
                          {copied === key ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </button>
                      )}
                      <button
                        onClick={() => handleReveal(key)}
                        disabled={loading[key]}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all
                          ${revealed[key]
                            ? 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700'
                          }`}
                      >
                        {loading[key] ? (
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : revealed[key] ? (
                          <><EyeOff size={14} /> Hide</>
                        ) : (
                          <><Eye size={14} /> Reveal</>
                        )}
                      </button>
                    </div>
                  </div>
                  {revealed[key] && (
                    <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                      <pre className="p-3 bg-black/30 rounded-lg text-[11px] font-mono text-emerald-400/90 break-all whitespace-pre-wrap border border-white/5 shadow-inner">
                        {revealed[key]}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
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
                  {yamlLoading ? 'Loading YAML…' : `Edit — ${secret.metadata.name}`}
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
                <YAMLViewer
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
