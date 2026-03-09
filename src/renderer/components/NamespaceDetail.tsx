import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { KubeNamespace, KubeEvent } from '../types'
import { formatAge } from '../types'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 w-28">{label}</span>
      <span className="text-xs font-medium text-slate-800 dark:text-slate-200 text-right break-all">{value}</span>
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
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
    : phase === 'Terminating'
      ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'

  useEffect(() => {
    if (!selectedContext || tab !== 'events') return
    window.kubectl.getResourceEvents(selectedContext, ns.metadata.name, 'Namespace', ns.metadata.name)
      .then(setEvents).catch(() => setEvents([]))
  }, [tab, ns.metadata.uid, selectedContext])

  return (
    <div className="flex flex-col w-full h-full transition-colors duration-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono truncate">{ns.metadata.name}</h3>
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${phaseColor}`}>{phase}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Age: {formatAge(ns.metadata.creationTimestamp)}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 -mb-px">
          {(['overview', 'events'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors capitalize ${tab === t
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
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
                <div className="space-y-1.5">
                  {Object.entries(ns.metadata.annotations)
                    .filter(([k]) => !k.startsWith('kubectl.kubernetes.io'))
                    .map(([k, v]) => (
                      <div key={k} className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{k}</span>
                        <span className="text-[11px] font-mono text-slate-700 dark:text-slate-300 break-all bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded">{v}</span>
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
