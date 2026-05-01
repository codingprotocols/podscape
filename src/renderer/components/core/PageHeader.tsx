import React from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string | React.ReactNode
  children?: React.ReactNode
}

export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div
      className="flex items-center justify-between pl-8 pr-6 py-7 border-b border-slate-200 dark:border-white/5 shrink-0 bg-white/5 backdrop-blur-md sticky top-0 z-30"
    >
      <div className="flex items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none uppercase">
            {title}
          </h2>
          {subtitle && (
            <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mt-2.5 flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {children}
      </div>
    </div>
  )
}
