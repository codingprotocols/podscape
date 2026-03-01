import React from 'react'
import type { KubeDaemonSet } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-xs text-slate-700 dark:text-slate-200 font-medium">{value}</span>
    </div>
  )
}

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}</span>
        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function DaemonSetDetail({ daemonSet: ds }: { daemonSet: KubeDaemonSet }) {
  const { getYAML } = useAppStore()
  const [yaml, setYaml] = React.useState<string | null>(null)
  const desired = ds.status.desiredNumberScheduled

  React.useEffect(() => {
    getYAML('daemonset', ds.metadata.name, false, ds.metadata.namespace)
      .then(setYaml)
      .catch(() => setYaml('# Unable to fetch YAML'))
  }, [ds.metadata.uid])

  return (
    <div className="flex flex-col w-[520px] min-w-[400px] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 h-full shadow-2xl overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600 dark:text-blue-400">
              <path d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono truncate">{ds.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
              {ds.metadata.namespace} · DaemonSet · {formatAge(ds.metadata.creationTimestamp)} old
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Status bars */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Status</p>
          <div className="space-y-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl p-4">
            <StatBar label="Ready" value={ds.status.numberReady} max={desired} color="bg-emerald-500" />
            <StatBar label="Available" value={ds.status.numberAvailable ?? 0} max={desired} color="bg-blue-500" />
            {(ds.status.numberUnavailable ?? 0) > 0 && (
              <StatBar label="Unavailable" value={ds.status.numberUnavailable ?? 0} max={desired} color="bg-red-500" />
            )}
          </div>
        </div>

        {/* Update strategy */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Configuration</p>
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl px-4 py-2">
            <InfoRow label="Update Strategy" value={ds.spec.updateStrategy?.type ?? 'RollingUpdate'} />
            {ds.spec.updateStrategy?.rollingUpdate?.maxUnavailable !== undefined && (
              <InfoRow label="Max Unavailable" value={String(ds.spec.updateStrategy.rollingUpdate.maxUnavailable)} />
            )}
            <InfoRow label="Selector" value={
              Object.entries(ds.spec.selector.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`).join(', ') || '—'
            } />
          </div>
        </div>

        {/* Pod template containers */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Containers</p>
          <div className="space-y-2">
            {ds.spec.template.spec.containers.map(c => (
              <div key={c.name} className="bg-slate-50 dark:bg-slate-900/60 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 font-mono">{c.name}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-mono truncate">{c.image}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Labels */}
        {ds.metadata.labels && Object.keys(ds.metadata.labels).length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Labels</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(ds.metadata.labels).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-[10px] font-mono">
                  <span className="text-slate-400 dark:text-slate-500">{k}</span>
                  <span className="text-slate-600 dark:text-slate-300">=</span>
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">{v}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
