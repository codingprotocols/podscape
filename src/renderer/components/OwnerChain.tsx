import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import type { OwnerRef } from '../types'

interface Props {
  uid: string
  kind: string
  name: string
  namespace: string
}

/**
 * Renders a compact breadcrumb strip showing the ownership chain of a resource.
 * Ancestors are displayed root-first (furthest owner on the left).
 * Missing owners (not found in cache) are greyed and non-clickable.
 * Returns null when the resource has no owners.
 */
export default function OwnerChain({ uid, kind, name, namespace }: Props): JSX.Element | null {
  const { ownerChains, navigateToResource } = useAppStore()
  const [loading, setLoading] = useState(false)
  const chain = ownerChains[uid]

  useEffect(() => {
    if (chain !== undefined || loading) return
    if (!window.kubectl.getOwnerChain) return
    setLoading(true)
    window.kubectl.getOwnerChain(kind, name, namespace)
      .then((result: any) => {
        useAppStore.setState(s => ({
          ownerChains: { ...s.ownerChains, [uid]: result }
        }))
      })
      .catch(() => {
        // Mark as empty so we don't retry endlessly
        useAppStore.setState(s => ({
          ownerChains: { ...s.ownerChains, [uid]: { ancestors: [], descendants: {} } }
        }))
      })
      .finally(() => setLoading(false))
  }, [uid, kind, name, namespace, chain, loading])

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-100 dark:border-white/5 shrink-0">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-5 w-16 bg-slate-100 dark:bg-white/5 rounded-full animate-pulse" />
        ))}
      </div>
    )
  }

  if (!chain || chain.ancestors.length === 0) return null

  // Display ancestors in root→leaf order (reversed from storage)
  const displayOrder = [...chain.ancestors].reverse()

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 dark:border-white/5 shrink-0 overflow-x-auto scrollbar-hide">
      {displayOrder.map((ref: OwnerRef, i: number) => (
        <React.Fragment key={`${ref.kind}-${ref.name}`}>
          <OwnerChip
            ref_={ref}
            onNavigate={() => {
              if (ref.found) navigateToResource(ref.kind, ref.name, ref.namespace)
            }}
          />
          <ChevronRight />
        </React.Fragment>
      ))}
      {/* Current resource chip */}
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20">
        <span className="text-[8px] opacity-60">{kind}</span>
        <span>{name}</span>
      </span>
    </div>
  )
}

function OwnerChip({ ref_, onNavigate }: { ref_: OwnerRef; onNavigate: () => void }) {
  const kindColor = kindColorMap[ref_.kind] ?? 'text-slate-400 bg-slate-100/50 dark:bg-white/5 border-slate-200 dark:border-white/10'

  if (!ref_.found) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider opacity-40 border border-dashed border-slate-300 dark:border-white/10 text-slate-400"
        title="Not found in cache"
      >
        <span className="text-[8px]">{ref_.kind}</span>
        <span>{ref_.name}</span>
      </span>
    )
  }

  return (
    <button
      onClick={onNavigate}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border transition-all hover:opacity-80 active:scale-95 ${kindColor}`}
    >
      <span className="text-[8px] opacity-60">{ref_.kind}</span>
      <span>{ref_.name}</span>
    </button>
  )
}

function ChevronRight() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      className="text-slate-300 dark:text-white/20 shrink-0">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

const kindColorMap: Record<string, string> = {
  Deployment:  'text-blue-500 bg-blue-500/10 border-blue-500/20',
  ReplicaSet:  'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
  DaemonSet:   'text-violet-500 bg-violet-500/10 border-violet-500/20',
  StatefulSet: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  Job:         'text-amber-500 bg-amber-500/10 border-amber-500/20',
  CronJob:     'text-orange-500 bg-orange-500/10 border-orange-500/20',
  Pod:         'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
}
