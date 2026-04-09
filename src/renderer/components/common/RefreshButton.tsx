import React from 'react'
import { RefreshCw } from 'lucide-react'

interface RefreshButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick: () => void | Promise<void>
  loading?: boolean
  label?: string
}

export default function RefreshButton({
  onClick,
  loading = false,
  label,
  className = '',
  disabled = false,
  ...props
}: RefreshButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        flex items-center gap-2 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider
        text-slate-600 dark:text-slate-300
        glass-panel hover:bg-white/10 dark:hover:bg-white/5 rounded-xl shadow-sm
        disabled:opacity-40 active:scale-95 transition-all
        ${className}
      `}
      {...props}
      title={props.title ?? label}
    >
      <RefreshCw
        className={`w-3.5 h-3.5 transition-transform duration-700 ${loading ? 'animate-spin' : ''}`}
      />
      {label && <span>{label}</span>}
    </button>
  )
}
