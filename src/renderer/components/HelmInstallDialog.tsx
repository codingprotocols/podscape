import React, { useState, useEffect, useRef } from 'react'
import { X, Tag, ChevronDown } from 'lucide-react'
import YAMLEditor from './YAMLEditor'
import { useAppStore } from '../store'

interface ChartVersion {
  version: string
  appVersion: string
  description: string
}

interface Props {
  chartName: string
  repoName: string
  onClose: () => void
}

export default function HelmInstallDialog({ chartName, repoName, onClose }: Props): JSX.Element {
  const { selectedContext } = useAppStore()
  const shortName = chartName.includes('/') ? chartName.split('/').slice(1).join('/') : chartName

  const [versions, setVersions] = useState<ChartVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [releaseName, setReleaseName] = useState(shortName)
  const [namespace, setNamespace] = useState('default')
  const [values, setValues] = useState('')
  const [loadingVersions, setLoadingVersions] = useState(true)
  const [loadingValues, setLoadingValues] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const progressEndRef = useRef<HTMLDivElement>(null)

  // Load versions on mount
  useEffect(() => {
    if (!window.helm.repoVersions) return
    setLoadingVersions(true)
    window.helm.repoVersions(repoName, shortName)
      .then((v: unknown) => {
        const list = v as ChartVersion[]
        setVersions(list)
        if (list.length > 0) setSelectedVersion(list[0].version)
      })
      .catch(() => setError('Failed to load chart versions'))
      .finally(() => setLoadingVersions(false))
  }, [repoName, shortName])

  // Load default values when version changes
  useEffect(() => {
    if (!selectedVersion || !window.helm.repoValues) return
    setLoadingValues(true)
    window.helm.repoValues(repoName, shortName, selectedVersion)
      .then((v: unknown) => setValues(v as string))
      .catch(() => setValues(''))
      .finally(() => setLoadingValues(false))
  }, [repoName, shortName, selectedVersion])

  // Auto-scroll progress log
  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [progress])

  const handleInstall = async () => {
    if (!window.helm.install) return
    setInstalling(true)
    setProgress([])
    setError(null)

    try {
      const unsubProgress = window.helm.onInstallProgress((msg: string) => {
        setProgress(prev => [...prev.slice(-49), msg])
      })
      await window.helm.install(chartName, selectedVersion, releaseName, namespace, values, selectedContext ?? '')
      unsubProgress()
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[680px] max-h-[85vh] flex flex-col bg-white dark:bg-[hsl(222,47%,10%)] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-blue-500" />
            <span className="text-sm font-black text-slate-800 dark:text-slate-100">Install Chart</span>
            <span className="text-[10px] font-bold text-slate-400 font-mono ml-1">{chartName}</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-white/5"
          >
            <X size={14} />
          </button>
        </div>

        {done ? (
          /* Success state */
          <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-slate-800 dark:text-slate-100">Installed successfully</p>
              <p className="text-[11px] text-slate-500 mt-1">
                Release <span className="font-mono font-bold text-blue-500">{releaseName}</span> is now deployed in{' '}
                <span className="font-mono font-bold">{namespace}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-5 py-2 text-[10px] font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Form */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-6 py-4 grid grid-cols-2 gap-4 border-b border-slate-100 dark:border-white/5 shrink-0">
                {/* Release name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Release Name</label>
                  <input
                    type="text"
                    value={releaseName}
                    onChange={e => setReleaseName(e.target.value)}
                    disabled={installing}
                    className="px-3 py-2 text-[11px] font-bold bg-slate-100 dark:bg-slate-900 border border-transparent focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-slate-900 dark:text-slate-100 outline-none transition-all disabled:opacity-50 font-mono"
                  />
                </div>

                {/* Namespace */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Namespace</label>
                  <input
                    type="text"
                    value={namespace}
                    onChange={e => setNamespace(e.target.value)}
                    disabled={installing}
                    className="px-3 py-2 text-[11px] font-bold bg-slate-100 dark:bg-slate-900 border border-transparent focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-slate-900 dark:text-slate-100 outline-none transition-all disabled:opacity-50 font-mono"
                  />
                </div>

                {/* Version */}
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Version</label>
                  {loadingVersions ? (
                    <div className="h-9 bg-slate-100 dark:bg-slate-900 rounded-xl animate-pulse" />
                  ) : (
                    <div className="relative">
                      <select
                        value={selectedVersion}
                        onChange={e => setSelectedVersion(e.target.value)}
                        disabled={installing || versions.length === 0}
                        className="w-full appearance-none px-3 py-2 pr-8 text-[11px] font-bold bg-slate-100 dark:bg-slate-900 border border-transparent focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-slate-900 dark:text-slate-100 outline-none transition-all disabled:opacity-50 font-mono"
                      >
                        {versions.map(v => (
                          <option key={v.version} value={v.version}>
                            {v.version}{v.appVersion ? ` (app: ${v.appVersion})` : ''}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  )}
                </div>
              </div>

              {/* Values YAML editor */}
              <div className="flex flex-col px-6 py-4" style={{ height: 280 }}>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 shrink-0">Values (YAML)</label>
                {loadingValues ? (
                  <div className="flex-1 bg-slate-100 dark:bg-slate-900 rounded-xl animate-pulse" />
                ) : (
                  <div className="flex-1 rounded-xl overflow-hidden border border-slate-100 dark:border-white/5">
                    <YAMLEditor
                      value={values}
                      onChange={setValues}
                      readOnly={installing}
                      height="100%"
                    />
                  </div>
                )}
              </div>

              {/* Progress log */}
              {(installing || progress.length > 0) && (
                <div className="mx-6 mb-4 rounded-xl bg-slate-950 dark:bg-black/40 border border-white/5 p-3 max-h-32 overflow-y-auto scrollbar-hide">
                  {progress.map((line, i) => (
                    <p key={i} className="text-[9px] font-mono text-slate-400 leading-relaxed">{line}</p>
                  ))}
                  {installing && (
                    <p className="text-[9px] font-mono text-blue-400 animate-pulse">Installing...</p>
                  )}
                  <div ref={progressEndRef} />
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mx-6 mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-[10px] font-bold text-red-400">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-white/5 shrink-0">
              <button
                onClick={onClose}
                disabled={installing}
                className="px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleInstall}
                disabled={installing || !releaseName.trim() || !namespace.trim() || !selectedVersion || loadingVersions}
                className="px-5 py-2 text-[10px] font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all disabled:opacity-50 shadow-sm active:scale-95 flex items-center gap-2"
              >
                {installing ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Installing...
                  </>
                ) : (
                  'Install'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
