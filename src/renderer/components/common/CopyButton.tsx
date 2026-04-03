import React, { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'

interface Props {
  value: string
  size?: number
  className?: string
}

export default function CopyButton({ value, size = 13, className = '' }: Props): JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }, [value])

  return (
    <button
      onClick={handleClick}
      data-copied={String(copied)}
      title={copied ? 'Copied!' : 'Copy'}
      className={`inline-flex items-center justify-center rounded p-0.5 text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors ${className}`}
    >
      {copied
        ? <Check size={size} className="text-emerald-400 animate-pop" />
        : <Copy size={size} />
      }
    </button>
  )
}
