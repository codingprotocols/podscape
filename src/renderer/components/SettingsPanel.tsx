import React, { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useAppStore } from '../store'

interface SettingsForm {
  kubectlPath: string
  shellPath: string
  helmPath: string
  theme: string
  kubeconfigPath: string
  prodContexts: string[]
}

export default function SettingsPanel(): JSX.Element {
  const { theme, setTheme, init, prodContexts } = useAppStore()
  const [form, setForm] = useState<SettingsForm>({ kubectlPath: '', shellPath: '', helmPath: '', theme, kubeconfigPath: '', prodContexts: [] })
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
    window.settings.get().then(s => setForm({ ...s, prodContexts: s.prodContexts ?? prodContexts })).catch(() => {
      setForm(f => ({ ...f, prodContexts }))
    })
    window.kubeconfig.get().then(({ path, content }) => {
      setKubeconfigPath(path)
      setKubeconfigContent(content)
      setKubeconfigOriginal(content)
    }).catch(() => { })
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
    <div className="flex-1 overflow-auto p-4 md:p-12 bg-white dark:bg-[hsl(var(--bg-dark))] transition-colors duration-300">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-10 px-2">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase tracking-[0.05em]">Settings</h1>
          <p className="text-sm font-bold text-slate-500 dark:text-slate-500 mt-2 uppercase tracking-widest">
            Identity, Preferences, and System Paths
          </p>
        </div>

        <div className="space-y-4">
          {/* ── Appearance ──────────────────────────────────────────────────── */}
          <section className="bg-white/[0.03] dark:bg-white/[0.03] backdrop-blur-md rounded-3xl border border-slate-200 dark:border-white/5 overflow-hidden shadow-2xl">
            <div className="px-8 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5">
              <h2 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Appearance</h2>
            </div>
            <div className="p-8">
              <label className="block mb-4 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Interface Color Scheme
              </label>
              <div className="flex gap-4">
                {(['light', 'dark'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => { setForm(f => ({ ...f, theme: t })); setTheme(t) }}
                    className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-2xl border-2 text-[11px] font-black uppercase tracking-[0.15em] transition-all
                      ${form.theme === t
                        ? 'border-blue-500 bg-blue-600/10 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/20'
                        : 'border-white/5 bg-white/[0.02] text-slate-500 hover:border-white/10 hover:bg-white/[0.05]'
                      }`}
                  >
                    {t === 'light'
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
                    }
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ── Binary Paths ────────────────────────────────────────────────── */}
          <section className="bg-white/[0.03] dark:bg-white/[0.03] backdrop-blur-md rounded-3xl border border-slate-200 dark:border-white/5 overflow-hidden divide-y divide-slate-100 dark:divide-white/5 shadow-2xl">
            <div className="px-8 py-5 bg-white/5">
              <h2 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Binary Paths</h2>
            </div>

            {/* kubectl path */}
            <div className="p-8">
              <label className="block mb-1 text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                kubectl path
              </label>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-4 uppercase tracking-tight">
                Absolute path to kubectl.
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={form.kubectlPath}
                  onChange={e => setForm(f => ({ ...f, kubectlPath: e.target.value }))}
                  placeholder="/opt/homebrew/bin/kubectl"
                  className="flex-1 text-sm bg-white/[0.05] border border-white/10
                             text-slate-900 dark:text-slate-100 placeholder-slate-700
                             rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono transition-all"
                />
                <button
                  onClick={() => setForm(f => ({ ...f, kubectlPath: '' }))}
                  className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white
                             bg-white/[0.05] border border-white/10
                             rounded-xl transition-all hover:bg-white/10"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Shell path */}
            <div className="p-6">
              <label className="block mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Shell path
              </label>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
                Absolute path to the shell for terminals and exec sessions.
                Defaults to your <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">$SHELL</code> environment variable.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.shellPath}
                  onChange={e => setForm(f => ({ ...f, shellPath: e.target.value }))}
                  placeholder="/bin/zsh"
                  className="flex-1 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                             text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600
                             rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                />
                <button
                  onClick={() => setForm(f => ({ ...f, shellPath: '' }))}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200
                             bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                             rounded-lg transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Helm path */}
            <div className="p-6">
              <label className="block mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Helm path
              </label>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
                Absolute path to helm. Leave blank to auto-detect from{' '}
                <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">/opt/homebrew/bin</code>,{' '}
                <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">/usr/local/bin</code>.
                Run <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">which helm</code> in your terminal to get the path.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.helmPath}
                  onChange={e => setForm(f => ({ ...f, helmPath: e.target.value }))}
                  placeholder="/opt/homebrew/bin/helm"
                  className="flex-1 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                             text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600
                             rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                />
                <button
                  onClick={() => setForm(f => ({ ...f, helmPath: '' }))}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200
                             bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                             rounded-lg transition-colors"
                >
                  Reset
                </button>
              </div>
            </div>
          </section>

          {/* ── Kubeconfig ──────────────────────────────────────────────────── */}
          <section className="bg-white/[0.03] dark:bg-white/[0.03] backdrop-blur-md rounded-3xl border border-slate-200 dark:border-white/5 overflow-hidden shadow-2xl">
            <div className="px-8 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 flex items-center justify-between">
              <div>
                <h2 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Kubeconfig</h2>
                {kubeconfigPath && (
                  <p className="text-[10px] font-mono text-slate-500 dark:text-slate-600 mt-1 truncate max-w-[400px]">{kubeconfigPath}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => window.kubeconfig.reveal()}
                  className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest
                             text-slate-400 hover:text-slate-200 bg-white/[0.04] hover:bg-white/[0.08]
                             border border-white/10 rounded-xl transition-all"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  Reveal
                </button>
                <button
                  onClick={handleSelectKubeconfigPath}
                  className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest
                             text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20
                             border border-blue-500/20 rounded-xl transition-all"
                >
                  Change Path
                </button>
                {form.kubeconfigPath && (
                  <button
                    onClick={handleClearKubeconfigPath}
                    className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest
                              text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20
                              border border-red-500/20 rounded-xl transition-all"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="p-8">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] text-slate-500 font-medium">
                  Manage your cluster configurations by selecting a different kubeconfig file or editing the current one manually.
                </p>
                <button
                  onClick={() => setShowEditor(!showEditor)}
                  className="text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showEditor ? 'Hide Manual Editor' : 'Edit Manually'}
                </button>
              </div>

              {showEditor && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="rounded-xl overflow-hidden border border-white/10 bg-[#1e1e1e]" style={{ height: 360 }}>
                    <Editor
                      height="360px"
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
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs min-h-5">
                      {kubeconfigError && <span className="text-red-500 text-xs">{kubeconfigError}</span>}
                      {kubeconfigSaved && <span className="text-emerald-500 text-xs font-medium">Saved. Contexts reloaded.</span>}
                      {!kubeconfigError && !kubeconfigSaved && kubeconfigDirty && (
                        <span className="text-amber-500 text-xs font-medium">Unsaved changes</span>
                      )}
                    </div>
                    <div className="flex gap-3">
                      {kubeconfigDirty && (
                        <button
                          onClick={() => { setKubeconfigContent(kubeconfigOriginal); setKubeconfigError(null) }}
                          className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-200
                                     bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl transition-all"
                        >
                          Discard
                        </button>
                      )}
                      <button
                        onClick={handleSaveKubeconfig}
                        disabled={kubeconfigSaving || !kubeconfigDirty}
                        className="px-5 py-2 text-[10px] font-black uppercase tracking-widest
                                   bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                                   text-white rounded-xl shadow-sm shadow-blue-500/20 transition-all"
                      >
                        {kubeconfigSaving ? 'Saving…' : 'Save & Reload'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>


          {/* ── Exec tip ────────────────────────────────────────────────────── */}
          <div className="p-5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-2xl">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1.5 uppercase tracking-wide">
              Exec into container not working?
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
              Set <strong>kubectl path</strong> to the output of{' '}
              <code className="bg-amber-100 dark:bg-amber-900/20 px-1 rounded">which kubectl</code>{' '}
              in your terminal. Save, then fully quit and relaunch Podscape (Cmd+Q, not just close window).
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2">
            <div className="text-sm min-h-5">
              {error && <span className="text-red-500 text-xs">{error}</span>}
              {saved && <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                {(form.kubectlPath || form.shellPath || form.helmPath)
                  ? 'Saved. Restart the app to apply path changes.'
                  : 'Saved.'}
              </span>}
            </div>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                         text-white rounded-xl shadow-sm shadow-blue-500/20 transition-all active:scale-95"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
