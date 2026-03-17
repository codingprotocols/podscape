import React, { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useAppStore } from '../store'
import { Save, CheckCircle, Monitor, Terminal, FileCode, Activity } from 'lucide-react'

interface SettingsForm {
  shellPath: string
  theme: string
  kubeconfigPath: string
  prodContexts: string[]
  prometheusUrls: Record<string, string>
}

export default function SettingsPanel(): JSX.Element {
  const { theme, setTheme, init, prodContexts, probePrometheus, prometheusAvailable, selectedContext } = useAppStore()
  const [form, setForm] = useState<SettingsForm>({ shellPath: '', theme, kubeconfigPath: '', prodContexts: [], prometheusUrls: {} })
  const [probing, setProbing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Kubeconfig editor state ────────────────────────────────────────────────
  const [kubeconfigPath, setKubeconfigPath] = useState('')
  const [kubeconfigContent, setKubeconfigContent] = useState('')
  const [kubeconfigOriginal, setKubeconfigOriginal] = useState('')
  const [kubeconfigSaving, setKubeconfigSaving] = useState(false)
  const [kubeconfigSaved, setKubeconfigSaved] = useState(false)
  const [kubeconfigError, setKubeconfigError] = useState<string | null>(null)
  const [showEditor, setShowEditor] = useState(false)

  useEffect(() => {
    window.settings.get().then(s => setForm({ ...s, prodContexts: s.prodContexts ?? prodContexts, prometheusUrls: s.prometheusUrls ?? {} })).catch(err => {
      console.error('[SettingsPanel] Failed to load settings:', err)
      setForm(f => ({ ...f, prodContexts }))
    })
    window.kubeconfig.get().then(({ path, content }) => {
      setKubeconfigPath(path)
      setKubeconfigContent(content)
      setKubeconfigOriginal(content)
    }).catch(err => {
      console.error('[SettingsPanel] Failed to load kubeconfig:', err)
    })
  }, [])

  // Keep form.theme in sync with store theme
  useEffect(() => {
    setForm(f => ({ ...f, theme }))
  }, [theme])

  const handleSave = async () => {
    setError(null)
    setSaved(false)
    try {
      await window.settings.set(form)
      // Apply theme change immediately
      if (form.theme === 'light' || form.theme === 'dark') setTheme(form.theme)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  const handleSaveKubeconfig = async () => {
    setKubeconfigError(null)
    setKubeconfigSaved(false)
    setKubeconfigSaving(true)
    try {
      await window.kubeconfig.set(kubeconfigContent)
      setKubeconfigOriginal(kubeconfigContent)
      setKubeconfigSaved(true)
      setTimeout(() => setKubeconfigSaved(false), 2500)
      // Reload contexts so changes take effect immediately
      await init()
    } catch (e) {
      setKubeconfigError(e instanceof Error ? e.message : 'Failed to save kubeconfig')
    } finally {
      setKubeconfigSaving(false)
    }
  }

  const handleSelectKubeconfigPath = async () => {
    const path = await window.kubeconfig.selectPath()
    if (path) {
      setForm(f => ({ ...f, kubeconfigPath: path }))
      setKubeconfigPath(path)
      // Trigger reload
      await init()
    }
  }

  const handleClearKubeconfigPath = async () => {
    await window.kubeconfig.clearPath()
    setForm(f => ({ ...f, kubeconfigPath: '' }))
    const { path } = await window.kubeconfig.get()
    setKubeconfigPath(path)
    await init()
  }

  const kubeconfigDirty = kubeconfigContent !== kubeconfigOriginal

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-[hsl(var(--bg-dark))] h-screen overflow-hidden transition-colors duration-200">
      {/* Scrollable Content (No PageHeader) */}
      <div className="flex-1 overflow-auto scrollbar-hide">
        <div className="max-w-4xl mx-auto px-8 md:px-12 py-10 space-y-12">
          
          {/* ── Status Bar for Saves ────────────────────────────────────────── */}
          <div className="flex items-center justify-between sticky top-0 z-10 py-4 mb-4 bg-white/10 backdrop-blur-xl border-b border-white/5 rounded-2xl px-6">
            <div className="min-w-0">
               <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Application Control</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                {error && <span className="text-red-500 text-[10px] font-bold uppercase tracking-tight">{error}</span>}
                {saved && (
                  <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-200">
                    <CheckCircle className="w-3 h-3" />
                    Saved
                  </span>
                )}
              </div>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-white
                           premium-gradient rounded-xl shadow-lg shadow-blue-500/20
                           transition-all active:scale-95 group"
              >
                <Save className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                Apply Changes
              </button>
            </div>
          </div>

          {/* ── Appearance ──────────────────────────────────────────────────── */}
          <section className="space-y-6">
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] flex items-center gap-3">
              <Monitor size={14} />
              Appearance
              <span className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {(['light', 'dark'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setForm(f => ({ ...f, theme: t })); setTheme(t) }}
                  className={`flex flex-col items-center justify-center gap-4 p-8 rounded-3xl border-2 transition-all group
                    ${form.theme === t
                      ? 'border-blue-500 bg-blue-600/10 text-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.1)]'
                      : 'border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] text-slate-500 hover:border-slate-200 dark:hover:border-white/10'
                    }`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${form.theme === t ? 'bg-blue-500/20' : 'bg-slate-200 dark:bg-white/5'}`}>
                    {t === 'light'
                      ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
                      : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
                    }
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                    {t} Mode
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* ── Terminal ──────────────────────────────────────────────────── */}
          <section className="space-y-6 text-slate-400">
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] flex items-center gap-3">
              <Terminal size={14} />
              Console Prefs
              <span className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
            </h3>
            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-3xl p-8 space-y-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">Shell Interpreter</label>
                  <code className="text-[10px] bg-white dark:bg-black/40 px-2 py-1 rounded text-blue-400 font-mono">$SHELL</code>
                </div>
                <div className="flex gap-4">
                  <input
                    type="text"
                    value={form.shellPath}
                    onChange={e => setForm(f => ({ ...f, shellPath: e.target.value }))}
                    placeholder="/bin/zsh"
                    className="flex-1 text-[11px] bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10
                               text-slate-800 dark:text-slate-100 placeholder-slate-500
                               rounded-xl px-5 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono transition-all shadow-inner"
                  />
                  <button
                    onClick={() => setForm(f => ({ ...f, shellPath: '' }))}
                    className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 dark:hover:text-white
                               bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10
                               rounded-xl transition-all"
                  >
                    Reset
                  </button>
                </div>
            </div>
          </section>

          {/* ── Kubeconfig ──────────────────────────────────────────────────── */}
          <section className="space-y-6">
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] flex items-center gap-3">
              <FileCode size={14} />
              Kubeconfig
              <span className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
            </h3>
            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-100/30 dark:bg-white/5 flex items-center justify-between">
                <div className="min-w-0">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Active File Path</span>
                  <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate max-w-[400px]">{kubeconfigPath}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => window.kubeconfig.reveal()} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-200 bg-white/5 border border-white/5 rounded-lg transition-all">Reveal</button>
                  <button onClick={handleSelectKubeconfigPath} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-400 bg-blue-500/10 border border-blue-500/10 rounded-lg transition-all">Change</button>
                  {form.kubeconfigPath && (
                    <button onClick={handleClearKubeconfigPath} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-400 bg-rose-500/10 border border-rose-500/10 rounded-lg transition-all">Reset</button>
                  )}
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-sm">Manage cluster configurations or edit the YAML manifest directly.</p>
                  <button
                    onClick={() => setShowEditor(!showEditor)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showEditor ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-200 dark:bg-white/5 text-slate-500'}`}
                  >
                    {showEditor ? 'Close YAML Editor' : 'Open YAML Editor'}
                  </button>
                </div>

                {showEditor && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 bg-[#1e1e1e] ring-1 ring-black/5" style={{ height: 400 }}>
                      <Editor
                        height="400px"
                        language="yaml"
                        theme="vs-dark"
                        value={kubeconfigContent}
                        onChange={v => setKubeconfigContent(v ?? '')}
                        options={{
                          fontSize: 12,
                          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          lineNumbers: 'on',
                          wordWrap: 'off',
                          tabSize: 2,
                          padding: { top: 20, bottom: 20 }
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between p-2">
                      <div className="text-[10px] font-bold">
                        {kubeconfigError && <span className="text-rose-500 uppercase tracking-tight">{kubeconfigError}</span>}
                        {kubeconfigSaved && <span className="text-emerald-500 uppercase tracking-widest animate-pulse">Saved Successfully</span>}
                        {!kubeconfigError && !kubeconfigSaved && kubeconfigDirty && (
                          <span className="text-amber-500 uppercase tracking-widest">Modified — Unsaved Changes</span>
                        )}
                      </div>
                      <div className="flex gap-3">
                        {kubeconfigDirty && (
                          <button onClick={() => { setKubeconfigContent(kubeconfigOriginal); setKubeconfigError(null) }} className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors">Discard</button>
                        )}
                        <button
                          onClick={handleSaveKubeconfig}
                          disabled={kubeconfigSaving || !kubeconfigDirty}
                          className="px-6 py-2.5 text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-xl shadow-lg shadow-blue-500/20 transition-all font-sans"
                        >
                          {kubeconfigSaving ? 'Saving…' : 'Update Manifest'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Prometheus ──────────────────────────────────────────────────── */}
          <section className="space-y-6 pb-20">
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] flex items-center gap-3">
              <Activity size={14} />
              Performance Metrics
              <span className="flex-1 h-px bg-slate-100 dark:bg-white/5" />
            </h3>
            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
               <div className="px-8 py-6 bg-slate-100/30 dark:bg-white/5 flex items-center justify-between border-b border-slate-100 dark:border-white/5">
                <div>
                  <h4 className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Prometheus Integration</h4>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-tighter">Per-context time-series data source</p>
                </div>
                <div className="flex items-center gap-3">
                   {prometheusAvailable === true && <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-widest">Connected</span>}
                   {prometheusAvailable === false && <span className="text-[10px] font-black text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1 rounded-full uppercase tracking-widest">Unavailable</span>}
                   {prometheusAvailable === null && <span className="text-[10px] font-black text-slate-500 bg-slate-500/10 border border-slate-500/20 px-3 py-1 rounded-full uppercase tracking-widest">Not Probed</span>}
                </div>
               </div>
               
               <div className="p-8 space-y-6">
                  <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 space-y-3">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Cloud Cluster Guide (EKS/GKE/AKS)</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed font-medium">Use Built-in Port Forwards for easy access. Map your prometheus service to local port <code className="bg-blue-500/20 px-1 rounded text-blue-300">9090</code>, and it will be auto-detected.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Manual Endpoint URL</label>
                      <span className="text-[10px] font-mono text-slate-400 opacity-60">{selectedContext}</span>
                    </div>
                    <div className="flex gap-4">
                      <input
                        type="text"
                        value={selectedContext ? (form.prometheusUrls[selectedContext] ?? '') : ''}
                        onChange={e => {
                          if (!selectedContext) return
                          const url = e.target.value
                          setForm(f => ({ ...f, prometheusUrls: { ...f.prometheusUrls, [selectedContext]: url } }))
                        }}
                        placeholder="http://127.0.0.1:9090"
                        className="flex-1 text-[11px] bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10
                                   text-slate-800 dark:text-slate-100 placeholder-slate-700
                                   rounded-xl px-5 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-mono shadow-inner"
                      />
                      <button
                        onClick={async () => {
                          setProbing(true)
                          try {
                            const current = await window.settings.get()
                            await window.settings.set({ ...current, prometheusUrls: form.prometheusUrls })
                          } catch (err) {
                            console.error('[SettingsPanel] Failed to save Prometheus URL:', err)
                          }
                          await probePrometheus()
                          setProbing(false)
                        }}
                        disabled={probing}
                        className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300
                                   bg-blue-500/10 border border-blue-500/20 rounded-xl transition-all"
                      >
                         {probing ? 'Probing...' : 'Detect Now'}
                      </button>
                    </div>
                  </div>
               </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
