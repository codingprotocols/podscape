import React from 'react'
import type { KubePVC } from '../types'
import { formatAge } from '../types'

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-xs text-slate-700 dark:text-slate-200 font-medium">{value}</span>
    </div>
  )
}

function PhaseBadge({ phase }: { phase: string }) {
  const cls =
    phase === 'Bound' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 ring-emerald-500/30' :
    phase === 'Pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 ring-yellow-500/30' :
    phase === 'Lost' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 ring-red-500/30' :
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 ring-slate-500/30'

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ring-1 ${cls}`}>
      {phase}
    </span>
  )
}

export default function PVCDetail({ pvc }: { pvc: KubePVC }) {
  const phase = pvc.status.phase ?? 'Unknown'
  const capacity = Object.values(pvc.status.capacity ?? {})[0] ?? pvc.spec.resources?.requests?.storage ?? '—'
  const accessModes = (pvc.status.accessModes ?? pvc.spec.accessModes ?? []).join(', ')

  return (
    <div className="flex flex-col w-[520px] min-w-[400px] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 h-full shadow-2xl overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-600/10 dark:bg-orange-500/20 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-600 dark:text-orange-400">
              <path d="M2 20h20M4 20V8m16 12V8M8 20v-6h8v6M12 8V4M4 8h16" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono truncate">{pvc.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
              {pvc.metadata.namespace} · PVC · {formatAge(pvc.metadata.creationTimestamp)} old
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Phase + capacity hero */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-4 text-center">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Phase</p>
            <PhaseBadge phase={phase} />
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-4 text-center">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Capacity</p>
            <span className="text-2xl font-bold text-slate-800 dark:text-white">{capacity}</span>
          </div>
        </div>

        {/* Details */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Details</p>
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl px-4 py-2">
            <InfoRow label="Access Modes" value={accessModes || '—'} />
            <InfoRow label="Storage Class" value={pvc.spec.storageClassName ?? '—'} />
            <InfoRow label="Volume Mode" value={pvc.spec.volumeMode ?? 'Filesystem'} />
            {pvc.spec.volumeName && (
              <InfoRow label="Bound PV" value={<span className="font-mono text-blue-600 dark:text-blue-400">{pvc.spec.volumeName}</span>} />
            )}
            {pvc.spec.resources?.requests?.storage && (
              <InfoRow label="Requested" value={pvc.spec.resources.requests.storage} />
            )}
          </div>
        </div>

        {/* Labels */}
        {pvc.metadata.labels && Object.keys(pvc.metadata.labels).length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Labels</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(pvc.metadata.labels).map(([k, v]) => (
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
