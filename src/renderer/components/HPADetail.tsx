import React from 'react'
import type { KubeHPA } from '../types'
import { formatAge } from '../types'

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-xs text-slate-700 dark:text-slate-200 font-medium">{value}</span>
    </div>
  )
}

export default function HPADetail({ hpa }: { hpa: KubeHPA }) {
  const current = hpa.status.currentReplicas
  const desired = hpa.status.desiredReplicas
  const max = hpa.spec.maxReplicas
  const min = hpa.spec.minReplicas ?? 1
  const scalePct = max > min ? Math.round(((current - min) / (max - min)) * 100) : 0

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600/10 dark:bg-purple-500/20 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-600 dark:text-purple-400">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono truncate">{hpa.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
              {hpa.metadata.namespace} · HPA · {formatAge(hpa.metadata.creationTimestamp)} old
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Replica gauge */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Replicas</p>
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-4 space-y-3">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
              <span>Min: {min}</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">Current: {current} → Desired: {desired}</span>
              <span>Max: {max}</span>
            </div>
            <div className="relative h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="absolute left-0 h-full bg-purple-500 rounded-full transition-all"
                style={{ width: `${scalePct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
              <span>{min}</span>
              <span>{max}</span>
            </div>
          </div>
        </div>

        {/* Target ref */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Target</p>
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl px-4 py-2">
            <InfoRow label="Kind" value={hpa.spec.scaleTargetRef.kind} />
            <InfoRow label="Name" value={<span className="font-mono">{hpa.spec.scaleTargetRef.name}</span>} />
            {hpa.spec.scaleTargetRef.apiVersion && (
              <InfoRow label="API Version" value={<span className="font-mono">{hpa.spec.scaleTargetRef.apiVersion}</span>} />
            )}
          </div>
        </div>

        {/* Conditions */}
        {(hpa.status.conditions ?? []).length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Conditions</p>
            <div className="space-y-2">
              {hpa.status.conditions!.map((c, i) => (
                <div key={i} className="bg-slate-50 dark:bg-slate-900/60 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${c.status === 'True' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{c.type}</span>
                  </div>
                  {c.message && <p className="text-[10px] text-slate-400 dark:text-slate-500">{c.message}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last scale time */}
        {hpa.status.lastScaleTime && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Timing</p>
            <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl px-4 py-2">
              <InfoRow label="Last Scale" value={new Date(hpa.status.lastScaleTime).toLocaleString()} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
