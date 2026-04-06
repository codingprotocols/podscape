import React, { useState } from 'react'
import { X } from 'lucide-react'

const STEPS = [
  {
    title: 'Your cluster at a glance',
    description: 'The Dashboard shows health, recent events, and resource usage across your cluster.',
    section: 'dashboard',
  },
  {
    title: 'Browse all workloads',
    description: 'Click Pods in the sidebar to see all running pods. Right-click any row for quick actions.',
    section: 'pods',
  },
  {
    title: 'Stream logs in real time',
    description: 'Unified Logs lets you stream from multiple pods simultaneously with regex filtering.',
    section: 'unifiedlogs',
  },
  {
    title: 'Forward ports without a terminal',
    description: 'Port Forwards manages tunnels to your cluster services with a single click.',
    section: 'portforwards',
  },
  {
    title: 'Configure Podscape',
    description: 'Set your kubectl path, shell, theme, and Prometheus URL in Settings.',
    section: 'settings',
  },
]

interface Props {
  onDone: () => void
}

export default function TourOverlay({ onDone }: Props): JSX.Element {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none flex items-end justify-center pb-8">
      <div className="pointer-events-auto w-full max-w-md mx-4 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6 animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-blue-500' : 'w-2 bg-white/20'}`}
              />
            ))}
          </div>
          <button
            onClick={onDone}
            aria-label="Close tour"
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <h3 className="text-sm font-bold text-white mb-1">{current.title}</h3>
        <p className="text-xs text-slate-400 leading-relaxed mb-5">{current.description}</p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
            {step + 1} / {STEPS.length}
          </span>
          <div className="flex gap-2">
            {!isLast && (
              <button
                onClick={onDone}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={isLast ? onDone : () => setStep(s => s + 1)}
              className="text-[11px] font-bold bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg transition-colors"
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
