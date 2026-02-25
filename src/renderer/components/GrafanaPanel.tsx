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
    <div className="flex flex-col flex-1 bg-gray-900/50 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-white">Grafana</h2>
          <p className="text-xs text-gray-400 mt-0.5">Embedded dashboard viewer</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditMode(e => !e)}
            className="px-3 py-1.5 text-xs text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-colors"
          >
            {editMode ? 'Cancel' : 'Configure'}
          </button>
        </div>
      </div>

      {/* URL configuration */}
      {editMode && (
        <div className="px-5 py-4 border-b border-white/10 bg-gray-900/80 shrink-0">
          <label className="block text-xs font-medium text-gray-400 mb-2">Grafana Base URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              placeholder="http://localhost:3000"
              className="flex-1 bg-gray-800 text-white text-sm rounded px-3 py-2 border border-white/10
                         focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600 font-mono"
            />
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors"
            >
              Connect
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Point to your Grafana instance. Anonymous access or a shared user session is required for embedding.
          </p>

          {/* Quick dashboard links */}
          {grafanaUrl && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-2">Quick links (common K8s dashboards):</p>
              <div className="flex flex-wrap gap-2">
                {quickLinks.map(ql => (
                  <button
                    key={ql.path}
                    onClick={() => {
                      const url = (grafanaUrl || inputUrl).replace(/\/$/, '') + ql.path
                      setInputUrl(url)
                      setGrafanaUrl(url)
                      setEditMode(false)
                    }}
                    className="text-xs px-2.5 py-1 bg-orange-500/10 text-orange-300 border border-orange-500/20 rounded hover:bg-orange-500/20 transition-colors"
                  >
                    {ql.label}
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
            // @ts-ignore - webview is an Electron-specific element
            allowpopups="false"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
            <span className="text-5xl opacity-30">📈</span>
            <div className="text-center">
              <p className="text-sm font-medium">No Grafana URL configured</p>
              <p className="text-xs mt-1 text-gray-600">
                Click <strong>Configure</strong> to connect your Grafana instance.
              </p>
            </div>
            <button
              onClick={() => setEditMode(true)}
              className="px-4 py-2 text-sm text-white bg-orange-600/80 hover:bg-orange-600 rounded-lg transition-colors mt-2"
            >
              Configure Grafana
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
