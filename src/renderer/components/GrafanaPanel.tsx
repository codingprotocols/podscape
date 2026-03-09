import React, { useState } from 'react'
import { useAppStore } from '../store'

export default function GrafanaPanel(): JSX.Element {
  const { grafanaUrl, setGrafanaUrl } = useAppStore()
  const [inputUrl, setInputUrl] = useState(grafanaUrl)
  const [editMode, setEditMode] = useState(!grafanaUrl)

  const handleSave = () => {
    let url = inputUrl.trim()
    if (url && !url.startsWith('http')) url = 'http://' + url
    setGrafanaUrl(url)
    setEditMode(false)
  }

  // Predefined Grafana dashboard paths for common Kubernetes dashboards
  const quickLinks = [
    { label: 'Cluster Overview', path: '/d/efa86fd1d0c121a26444b636a3f509a8' },
    { label: 'Node Exporter', path: '/d/rYdddlPWk' },
    { label: 'Namespace Workloads', path: '/d/a87fb0d919ec0ea5f6543124e16c42a5' },
    { label: 'Pod Overview', path: '/d/6581e46e4e5c7ba40a07646395ef7b23' }
  ]

  return (
    <div className="flex flex-col flex-1 bg-slate-50 dark:bg-slate-950 h-full transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-950">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Grafana</h2>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">Embedded observability</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditMode(e => !e)}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300
                       bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg shadow-sm
                       border border-slate-200 dark:border-slate-800 transition-all active:scale-95"
          >
            {editMode ? 'CANCEL' : 'CONFIGURE'}
          </button>
        </div>
      </div>

      {/* URL configuration */}
      {editMode && (
        <div className="px-8 py-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shrink-0 animate-in fade-in slide-in-from-top-2">
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-600 uppercase tracking-[0.2em] mb-3">Grafana Instance URL</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder="e.g., http://grafana.local:3000"
              className="flex-1 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-bold rounded-xl px-4 py-2.5 
                         border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder-slate-400 font-mono transition-all"
            />
            <button
              onClick={handleSave}
              className="px-6 py-2.5 text-sm font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/20
                         transition-all active:scale-95"
            >
              CONNECT
            </button>
          </div>
          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-600 mt-3 max-w-2xl leading-relaxed">
            Anonymous access or an active session is required for embedding. Use <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-blue-500">?korgId=1</code> or similar if needed.
          </p>

          {/* Quick dashboard links */}
          {grafanaUrl && (
            <div className="mt-6">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-600 mb-3 uppercase tracking-widest">Recommended Dashboards</p>
              <div className="flex flex-wrap gap-2.5">
                {quickLinks.map(ql => (
                  <button
                    key={ql.path}
                    onClick={() => {
                      const url = grafanaUrl.replace(/\/$/, '') + ql.path
                      setGrafanaUrl(url)
                      setEditMode(false)
                      // Don't overwrite inputUrl — keep user's base URL intact
                    }}
                    className="text-[10px] font-bold px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all"
                  >
                    {ql.label.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Iframe or empty state */}
      <div className="flex-1 min-h-0 relative">
        {grafanaUrl ? (
          <webview
            src={grafanaUrl}
            className="w-full h-full border-0"
            style={{ display: 'block' }}
            // @ts-ignore
            allowpopups="false"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="w-20 h-20 rounded-full bg-slate-50 dark:bg-slate-900/60 flex items-center justify-center text-slate-300 dark:text-slate-700">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">No Grafana Configured</p>
              <p className="text-[11px] mt-1.5 text-slate-400 dark:text-slate-600 max-w-xs mx-auto">
                Embed your existing Grafana dashboards directly into Podscape for unified observability.
              </p>
            </div>
            <button
              onClick={() => setEditMode(true)}
              className="px-6 py-2.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/20
                         transition-all active:scale-95"
            >
              CONFIGURE ENDPOINT
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
