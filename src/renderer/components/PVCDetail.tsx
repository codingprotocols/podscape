import React from 'react'
import type { KubePVC } from '../types'
import { formatAge } from '../types'

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-white/[0.02] last:border-0">
      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-xs text-slate-700 dark:text-slate-200 font-bold">{value}</span>
    </div>
  )
}

function PhaseBadge({ phase }: { phase: string }) {
  const cls =
    phase === 'Bound' ? 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/20' :
      phase === 'Pending' ? 'bg-amber-500/10 text-amber-500 ring-amber-500/20' :
        phase === 'Lost' ? 'bg-red-500/10 text-red-500 ring-red-500/20' :
          'bg-slate-500/10 text-slate-500 ring-slate-500/20'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ring-1 ring-inset ${cls}`}>
      {phase}
    </span>
  )
}

export default function PVCDetail({ pvc }: { pvc: KubePVC }) {
  const phase = pvc.status.phase ?? 'Unknown'
  const capacity = Object.values(pvc.status.capacity ?? {})[0] ?? pvc.spec.resources?.requests?.storage ?? '—'
  const accessModes = (pvc.status.accessModes ?? pvc.spec.accessModes ?? []).join(', ')

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-6 border-b border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-600/10 dark:bg-orange-500/20 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-600 dark:text-orange-400">
              <path d="M22 13V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h7" /><path d="M17 17l2 2 4-4" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{pvc.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
              {pvc.metadata.namespace} · PVC · {formatAge(pvc.metadata.creationTimestamp)} old
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Phase + capacity hero */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 shadow-[inset_0_0_12px_rgba(0,0,0,0.1)] text-center">
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">Phase</p>
            <PhaseBadge phase={phase} />
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 shadow-[inset_0_0_12px_rgba(0,0,0,0.1)] text-center">
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">Capacity</p>
            <span className="text-2xl font-black text-slate-800 dark:text-white tabular-nums drop-shadow-[0_0_12px_rgba(255,255,255,0.1)]">{capacity}</span>
          </div>
        </div>

        {/* Details */}
        <div>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 px-1">Details</p>
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl px-5 py-3">
            <InfoRow label="Access Modes" value={accessModes || '—'} />
            <InfoRow label="Storage Class" value={pvc.spec.storageClassName ?? '—'} />
            <InfoRow label="Volume Mode" value={pvc.spec.volumeMode ?? 'Filesystem'} />
            {pvc.spec.volumeName && (
              <InfoRow label="Bound PV" value={<span className="font-mono text-blue-400">{pvc.spec.volumeName}</span>} />
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
