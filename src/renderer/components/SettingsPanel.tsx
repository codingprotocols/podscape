import React, { useEffect, useState } from 'react'

interface Settings {
  kubectlPath: string
  shellPath: string
}

export default function SettingsPanel(): JSX.Element {
  const [form, setForm] = useState<Settings>({ kubectlPath: '', shellPath: '' })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.settings.get().then(s => setForm(s)).catch(() => {})
  }, [])

  const handleSave = async () => {
    setError(null)
    setSaved(false)
    try {
      await window.settings.set(form)
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
            Configure binary paths. Leave blank to use auto-detection.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
          {/* kubectl path */}
          <div className="p-6">
            <label className="block mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              kubectl path
            </label>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
              Absolute path to the kubectl binary.
              Auto-detected from <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">/opt/homebrew/bin</code>,{' '}
              <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">/usr/local/bin</code>,{' '}
              <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">/usr/bin</code>.
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
                title="Clear (use auto-detect)"
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
              Absolute path to the shell used for terminals and exec sessions.
              Auto-detected from the <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">SHELL</code> environment variable.
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
                title="Clear (use auto-detect)"
                className="px-3 py-2 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200
                           bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                           rounded-lg transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm">
            {error && <span className="text-red-500">{error}</span>}
            {saved && <span className="text-emerald-600 dark:text-emerald-400 font-medium">Saved. Restart the app to apply changes.</span>}
          </div>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                       text-white rounded-xl shadow-sm shadow-blue-500/20 transition-all active:scale-95"
          >
            Save
          </button>
        </div>

        {/* Help */}
        <div className="mt-8 p-5 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-2xl">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2 uppercase tracking-wide">
            Tip — exec into container keeps failing?
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
            Set the <strong>kubectl path</strong> to the absolute path shown by{' '}
            <code className="bg-blue-100 dark:bg-blue-900/60 px-1 rounded">which kubectl</code> in your terminal,
            then save and fully restart Podscape. This bypasses PATH resolution issues in the Electron process.
          </p>
        </div>
      </div>
    </div>
  )
}
