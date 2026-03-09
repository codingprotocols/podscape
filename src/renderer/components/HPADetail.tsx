import React from 'react'
import type { KubeHPA } from '../types'
import { formatAge } from '../types'

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-white/[0.02] last:border-0">
      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-xs text-slate-700 dark:text-slate-200 font-bold">{value}</span>
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
      <div className="px-6 py-6 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-600/10 dark:bg-purple-500/20 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-600 dark:text-purple-400">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{hpa.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
              {hpa.metadata.namespace} · HPA · {formatAge(hpa.metadata.creationTimestamp)} old
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Replica gauge */}
        <div>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 px-1">Replicas</p>
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 shadow-[inset_0_0_20px_rgba(0,0,0,0.1)]">
            <div className="flex justify-between items-end text-[11px] font-bold mb-4">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Current</span>
                <span className="text-xl tabular-nums text-purple-400">{current}</span>
              </div>
              <div className="text-center pb-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest px-2 py-0.5 bg-white/5 rounded-lg border border-white/5">
                  Desired: {desired}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Range</span>
                <span className="text-slate-300 tabular-nums">{min} — {max}</span>
              </div>
            </div>
            <div className="relative h-2.5 bg-white/5 rounded-full overflow-hidden mb-2">
              <div
                className="absolute left-0 h-full bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.4)] rounded-full transition-all duration-700 ease-out"
                style={{ width: `${scalePct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Target ref */}
        <div>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 px-1">Target</p>
          <div className="bg-white/[0.03] border border-white/5 rounded-2xl px-5 py-3">
            <InfoRow label="Kind" value={hpa.spec.scaleTargetRef.kind} />
            <InfoRow label="Name" value={<span className="font-mono text-blue-400">{hpa.spec.scaleTargetRef.name}</span>} />
            {hpa.spec.scaleTargetRef.apiVersion && (
              <InfoRow label="API Version" value={<span className="font-mono text-slate-400">{hpa.spec.scaleTargetRef.apiVersion}</span>} />
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
