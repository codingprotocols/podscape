import React from 'react'
import { useAppStore } from '../../store'

interface Props {
    value: string
    onChange: (ns: string) => void
    includeAll?: boolean  // prepend an "all namespaces" blank option
    className?: string
}

export function NamespaceSelect({ value, onChange, includeAll = false, className }: Props): JSX.Element {
    const namespaces = useAppStore(s => s.namespaces)
    const names = namespaces.map(n => n.metadata.name).filter(Boolean)

    if (names.length === 0) {
        // Namespaces not yet loaded — fall back to text input
        return (
            <input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="namespace"
                className={className ?? 'bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-48'}
            />
        )
    }

    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className={className ?? 'bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-48'}
        >
            {includeAll && <option value="">all namespaces</option>}
            {names.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
    )
}
