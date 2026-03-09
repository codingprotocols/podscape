import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { KubeReplicaSet, KubeEvent } from '../types'
import { formatAge } from '../types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5">
      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">{title}</p>
      <div className="px-1">
        {children}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/[0.02] last:border-0">
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-500 shrink-0 w-28 uppercase tracking-wider">{label}</span>
      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 text-right break-all">{value}</span>
    </div>
  )
}

function ReplicaCounter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-white/[0.03] border border-white/5 rounded-2xl px-4 py-3 min-w-[80px] transition-all hover:bg-white/[0.05]">
      <span className={`text-xl font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</span>
    </div>
  )
}

interface Props {
  replicaSet: KubeReplicaSet
}

export default function ReplicaSetDetail({ replicaSet: rs }: Props): JSX.Element {
  const { selectedContext } = useAppStore()
  const [events, setEvents] = useState<KubeEvent[]>([])
  const [tab, setTab] = useState<'overview' | 'events'>('overview')

  const desired = rs.spec.replicas ?? 0
  const ready = rs.status.readyReplicas ?? 0
  const available = rs.status.availableReplicas ?? 0
  const current = rs.status.replicas ?? 0

  // Owner reference (usually a Deployment)
  const ownerName = (rs.metadata as unknown as { ownerReferences?: Array<{ kind: string; name: string }> })
    .ownerReferences?.find(o => o.kind === 'Deployment')?.name

  useEffect(() => {
    if (!selectedContext || tab !== 'events') return
    window.kubectl.getResourceEvents(selectedContext, rs.metadata.namespace ?? 'default', 'ReplicaSet', rs.metadata.name)
      .then(setEvents).catch(() => setEvents([]))
  }, [tab, rs.metadata.uid, selectedContext])

  return (
    <div className="flex flex-col w-full h-full transition-colors duration-200">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono truncate">{rs.metadata.name}</h3>
            {rs.metadata.namespace && (
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{rs.metadata.namespace} · REPLICSET</p>
            )}
          </div>
          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {formatAge(rs.metadata.creationTimestamp)} old
          </span>
        </div>

        {/* Replica counters */}
        <div className="flex gap-2 flex-wrap mb-4">
          <ReplicaCounter label="Desired" value={desired} color="text-slate-700 dark:text-slate-200" />
          <ReplicaCounter label="Ready" value={ready} color={ready >= desired ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} />
          <ReplicaCounter label="Current" value={current} color="text-slate-600 dark:text-slate-300" />
          <ReplicaCounter label="Available" value={available} color={available >= desired ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'} />
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(['overview', 'events'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${tab === t
                ? 'bg-blue-600/10 text-blue-400 shadow-[inset_0_0_12px_rgba(59,130,246,0.1)]'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/5'
                }`}
            >{t}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && (
          <>
            {ownerName && (
              <Section title="Owner">
                <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2 border border-blue-100 dark:border-blue-800/40">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-blue-500 shrink-0">
                    <path d="M4 17l6-5-6-5M12 19h8" />
                  </svg>
                  <span className="text-xs font-mono text-blue-700 dark:text-blue-300">{ownerName}</span>
                  <span className="text-[10px] text-blue-500 dark:text-blue-400 ml-auto">Deployment</span>
                </div>
              </Section>
            )}

            <Section title="Spec">
              <Row label="Desired Replicas" value={desired} />
              <Row label="Service Name" value={rs.spec.selector.matchLabels ? Object.keys(rs.spec.selector.matchLabels).length + ' selectors' : '—'} />
              <Row label="Created" value={formatAge(rs.metadata.creationTimestamp) + ' ago'} />
            </Section>

            {rs.spec.selector.matchLabels && Object.keys(rs.spec.selector.matchLabels).length > 0 && (
              <Section title="Selector">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(rs.spec.selector.matchLabels).map(([k, v]) => (
                    <span key={k} className="text-[10px] font-mono bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-800/40">
                      {k}={v}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {rs.metadata.labels && Object.keys(rs.metadata.labels).length > 0 && (
              <Section title="Labels">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(rs.metadata.labels).map(([k, v]) => (
                    <span key={k} className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">
                      {k}={v}
                    </span>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {tab === 'events' && (
          <Section title="Events">
            {events.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">No events found</p>
            ) : (
              <div className="space-y-2">
                {events.map((ev, i) => (
                  <div key={i} className={`rounded-lg px-3 py-2 text-xs ${ev.type === 'Warning'
                    ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40'
                    : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800'
                    }`}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={`font-bold text-[10px] uppercase ${ev.type === 'Warning' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>{ev.reason}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{ev.lastTimestamp ? formatAge(ev.lastTimestamp) + ' ago' : ''}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 leading-snug">{ev.message}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  )
}
