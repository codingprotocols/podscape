import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { KubeNamespace, KubeEvent } from '../types'
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

interface Props {
  namespace: KubeNamespace
}

export default function NamespaceDetail({ namespace: ns }: Props): JSX.Element {
  const { selectedContext } = useAppStore()
  const [events, setEvents] = useState<KubeEvent[]>([])
  const [tab, setTab] = useState<'overview' | 'events'>('overview')

  const phase = ns.status.phase
  const phaseColor = phase === 'Active'
    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
    : phase === 'Terminating'
      ? 'bg-red-500/10 text-red-500 border border-red-500/20'
      : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'

  useEffect(() => {
    if (!selectedContext || tab !== 'events') return
    window.kubectl.getResourceEvents(selectedContext, ns.metadata.name, 'Namespace', ns.metadata.name)
      .then(setEvents).catch(() => setEvents([]))
  }, [tab, ns.metadata.uid, selectedContext])

  return (
    <div className="flex flex-col w-full h-full transition-colors duration-200">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 bg-white/5 shrink-0">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono truncate">{ns.metadata.name}</h3>
            <div className="flex items-center gap-3 mt-2">
              <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest ${phaseColor}`}>{phase}</span>
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Age: {formatAge(ns.metadata.creationTimestamp)}</span>
            </div>
          </div>
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
            <Section title="Overview">
              <Row label="Phase" value={<span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${phaseColor}`}>{phase}</span>} />
              <Row label="Created" value={formatAge(ns.metadata.creationTimestamp) + ' ago'} />
            </Section>

            {ns.metadata.labels && Object.keys(ns.metadata.labels).length > 0 && (
              <Section title="Labels">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(ns.metadata.labels).map(([k, v]) => (
                    <span key={k} className="text-[10px] font-mono bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-800/40">
                      {k}={v}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {ns.metadata.annotations && Object.keys(ns.metadata.annotations).filter(k => !k.startsWith('kubectl.kubernetes.io')).length > 0 && (
              <Section title="Annotations">
                <div className="space-y-3 px-1">
                  {Object.entries(ns.metadata.annotations)
                    .filter(([k]) => !k.startsWith('kubectl.kubernetes.io'))
                    .map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-1.5 p-3 rounded-2xl bg-white/[0.03] border border-white/5">
                        <span className="text-[10px] font-black font-mono text-slate-400 dark:text-slate-600 uppercase tracking-widest leading-none">{k}</span>
                        <span className="text-[11px] font-bold font-mono text-slate-700 dark:text-slate-300 break-all leading-relaxed">{v}</span>
                      </div>
                    ))}
                </div>
              </Section>
            )}
          </>
        )}

        {tab === 'events' && (
          <Section title="Events">
            {events.length === 0 ? (
              <p className="text-[11px] font-black text-slate-500 dark:text-slate-500 text-center py-12 uppercase tracking-widest opacity-40">No events found</p>
            ) : (
              <div className="space-y-2.5">
                {events.map((ev, i) => (
                  <div key={i} className={`rounded-xl p-3 text-[11px] border transition-all ${ev.type === 'Warning'
                    ? 'bg-orange-500/5 border-orange-500/20 shadow-[inset_0_0_12px_rgba(249,115,22,0.05)]'
                    : 'bg-white/[0.02] border-slate-100 dark:border-white/5'
                    }`}>
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className={`font-black uppercase tracking-wider ${ev.type === 'Warning' ? 'text-orange-400' : 'text-slate-700 dark:text-slate-400'}`}>{ev.reason}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-600 font-bold shrink-0">{ev.lastTimestamp ? formatAge(ev.lastTimestamp) + ' ago' : ''}</span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{ev.message}</p>
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
