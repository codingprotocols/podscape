import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'

interface SettingsForm {
  kubectlPath: string
  shellPath: string
  helmPath: string
  theme: string
}

export default function SettingsPanel(): JSX.Element {
  const { theme, setTheme } = useAppStore()
  const [form, setForm] = useState<SettingsForm>({ kubectlPath: '', shellPath: '', helmPath: '', theme })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.settings.get().then(s => setForm({ ...s })).catch(() => {})
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

  return (
    <div className="flex-1 overflow-auto p-8 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure appearance and binary paths.
          </p>
        </div>

        <div className="space-y-4">
          {/* ── Appearance ──────────────────────────────────────────────────── */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Appearance</h2>
            </div>
            <div className="p-6">
              <label className="block mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                Theme
              </label>
              <div className="flex gap-3">
                {(['light', 'dark'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setForm(f => ({ ...f, theme: t }))}
                    className={`flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl border-2 text-sm font-semibold transition-all
                      ${form.theme === t
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-sm shadow-blue-500/10'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                  >
                    {t === 'light'
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
                    }
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ── Binary Paths ────────────────────────────────────────────────── */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            <div className="px-6 py-4">
              <h2 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Binary Paths</h2>
            </div>

            {/* kubectl path */}
            <div className="p-6">
              <label className="block mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                kubectl path
              </label>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
                Absolute path to kubectl. Leave blank to auto-detect from{' '}
                <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">/opt/homebrew/bin</code>,{' '}
                <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">/usr/local/bin</code>.
                Run <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">which kubectl</code> in your terminal to get the path.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.kubectlPath}
                  onChange={e => setForm(f => ({ ...f, kubectlPath: e.target.value }))}
                  placeholder="/opt/homebrew/bin/kubectl"
                  className="flex-1 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                             text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600
                             rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                />
                <button
                  onClick={() => setForm(f => ({ ...f, kubectlPath: '' }))}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200
                             bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                             rounded-lg transition-colors"
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

          {/* ── Exec tip ────────────────────────────────────────────────────── */}
          <div className="p-5 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1.5 uppercase tracking-wide">
              Exec into container not working?
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
              Set <strong>kubectl path</strong> to the output of{' '}
              <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">which kubectl</code>{' '}
              in your terminal. Save, then fully quit and relaunch Podscape (Cmd+Q, not just close window).
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2">
            <div className="text-sm min-h-5">
              {error && <span className="text-red-500 text-xs">{error}</span>}
              {saved && <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Saved. Restart the app to apply path changes.</span>}
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
