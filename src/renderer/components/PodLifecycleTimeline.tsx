import React, { useMemo } from 'react'
import { KubeEvent, KubePod } from '../types'
import { formatAge } from '../types'
import { Clock, CheckCircle2, AlertCircle, Zap, XCircle, Loader2 } from 'lucide-react'
import { buildTimelineItems, TimelineItem, TimelineItemType } from '../utils/buildTimelineItems'

interface Props {
    pod: KubePod
    events: KubeEvent[]
}

function itemIcon(item: TimelineItem): React.ReactNode {
    if (item.isLive) return <Loader2 className="w-3.5 h-3.5 animate-spin" />
    if (item.type === 'error') return <XCircle className="w-3.5 h-3.5" />
    if (item.type === 'success') return <CheckCircle2 className="w-3.5 h-3.5" />
    if (item.type === 'warning') return <AlertCircle className="w-3.5 h-3.5" />
    if (item.title === 'Pod Created' || item.title === 'Scheduled') return <Clock className="w-3.5 h-3.5" />
    return <Zap className="w-3.5 h-3.5" />
}

function dotClass(type: TimelineItemType, isLive?: boolean): string {
    if (isLive) return 'bg-amber-500/10 border-amber-500 text-amber-400 animate-pulse'
    switch (type) {
        case 'success': return 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
        case 'warning': return 'bg-amber-500/10 border-amber-500 text-amber-500'
        case 'error':   return 'bg-red-500/10 border-red-500 text-red-500'
        default:        return 'bg-blue-500/10 border-blue-500 text-blue-500'
    }
}

export default function PodLifecycleTimeline({ pod, events }: Props): JSX.Element {
    const timelineItems = useMemo(() => buildTimelineItems(pod, events), [pod, events])

    if (timelineItems.length === 0) {
        return (
            <div className="text-center py-20">
                <Clock className="mx-auto w-8 h-8 text-slate-700 mb-4 opacity-20" />
                <p className="text-sm text-slate-500 font-medium">No timeline events yet</p>
            </div>
        )
    }

    return (
        <div className="relative pl-8 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-slate-200 dark:before:bg-white/5">
            {timelineItems.map((item, i) => (
                <div
                    key={i}
                    className="relative animate-in fade-in slide-in-from-left-2 duration-300"
                    style={{ animationDelay: `${i * 50}ms` }}
                >
                    <div className={`absolute -left-[25px] top-1 w-5 h-5 rounded-full flex items-center justify-center border-2 z-10 ${dotClass(item.type, item.isLive)}`}>
                        {itemIcon(item)}
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider">{item.title}</h5>
                            {item.isLive && (
                                <span className="text-[8px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-full px-1.5 py-0.5 uppercase tracking-widest animate-pulse">
                                    LIVE
                                </span>
                            )}
                            {item.count && item.count > 1 && (
                                <span className="text-[9px] font-black bg-slate-700/60 text-slate-400 rounded-full px-1.5 py-0.5">
                                    ×{item.count}
                                </span>
                            )}
                            {!item.isLive && (
                                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-600">
                                    {formatAge(item.time)} ago
                                </span>
                            )}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed font-medium">
                            {item.message}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    )
}
