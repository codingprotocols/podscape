import React, { useState } from 'react'
import { ChevronRight } from 'lucide-react'

const MAX_DEPTH = 20

interface SpecTreeProps {
  data: unknown
  depth?: number
}

function ValueNode({ value, depth }: { value: unknown; depth: number }) {
  const [open, setOpen] = useState(depth === 0)

  if (depth >= MAX_DEPTH) {
    return <span className="text-slate-600 font-mono text-xs italic">[...]</span>
  }

  if (value === null || value === undefined) {
    return <span className="text-slate-500 font-mono text-xs">—</span>
  }
  if (typeof value !== 'object') {
    const cls =
      typeof value === 'number'
        ? 'text-purple-400'
        : typeof value === 'boolean'
          ? 'text-orange-400'
          : 'text-green-400'
    return <span className={`font-mono text-xs ${cls}`}>{String(value)}</span>
  }

  const isArray = Array.isArray(value)
  const entries: [string, unknown][] = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>)

  if (entries.length === 0) {
    return <span className="text-slate-500 font-mono text-xs">{isArray ? '[]' : '{}'}</span>
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ChevronRight
          size={12}
          className={`transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          {isArray ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </button>
      {open && (
        <div className="ml-4 border-l border-white/5 pl-3 mt-1 space-y-1">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-2 items-start">
              <span className={`text-[10px] font-bold shrink-0 mt-0.5 min-w-[80px] ${
                isArray
                  ? 'text-slate-600 normal-case font-mono'
                  : 'text-slate-400 uppercase tracking-widest'
              }`}>
                {k}
              </span>
              <ValueNode value={v} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function SpecTree({ data, depth = 0 }: SpecTreeProps) {
  if (!data || typeof data !== 'object') {
    return <span className="text-slate-500 font-mono text-xs">—</span>
  }
  const entries = Object.entries(data as Record<string, unknown>)
  if (entries.length === 0) {
    return <span className="text-slate-500 font-mono text-xs">{'{}'}</span>
  }
  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2 items-start">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0 mt-0.5 min-w-[100px]">
            {k}
          </span>
          <ValueNode value={v} depth={depth + 1} />
        </div>
      ))}
    </div>
  )
}
