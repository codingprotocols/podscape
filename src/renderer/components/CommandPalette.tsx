import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useAppStore } from '../store'
import { ICONS, Icon } from './Icons'
import { ResourceKind, AnyKubeResource } from '../types'

export default function CommandPalette() {
  const {
    isSearchOpen, setSearchOpen,
    searchQuery, setSearchQuery,
    pods, deployments, services, configmaps, secrets,
    setSection, selectNamespace, selectResource
  } = useAppStore()

  const [selectedIndex, setSelectedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      })
    }
  }, [selectedIndex])

  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isSearchOpen])

  const close = () => {
    setSearchOpen(false)
    setSearchQuery('')
    setSelectedIndex(0)
  }

  const select = (r: AnyKubeResource & { kind: ResourceKind }) => {
    selectNamespace(r.metadata.namespace ?? '_all')
    setSection(r.kind)
    selectResource(r as AnyKubeResource)
    close()
  }

  const q = searchQuery.toLowerCase()

  const results = useMemo(() => {
    if (!q) return []
    return [
      ...pods.map(r => ({ ...r, kind: 'pods' as ResourceKind, icon: ICONS.pod })),
      ...deployments.map(r => ({ ...r, kind: 'deployments' as ResourceKind, icon: ICONS.deploy })),
      ...services.map(r => ({ ...r, kind: 'services' as ResourceKind, icon: ICONS.service })),
      ...configmaps.map(r => ({ ...r, kind: 'configmaps' as ResourceKind, icon: ICONS.configmap })),
      ...secrets.map(r => ({ ...r, kind: 'secrets' as ResourceKind, icon: ICONS.secret })),
    ].filter(r => r.metadata.name.toLowerCase().includes(q))
      .slice(0, 15)
  }, [pods, deployments, services, configmaps, secrets, q])

  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  useEffect(() => {
    const handleEvents = (e: KeyboardEvent) => {
      if (!isSearchOpen) return

      if (e.key === 'Escape') {
        close()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (results.length > 0) {
          setSelectedIndex(prev => (prev + 1) % results.length)
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (results.length > 0) {
          setSelectedIndex(prev => (prev - 1 + results.length) % results.length)
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (results[selectedIndex]) {
          select(results[selectedIndex] as any)
        }
      }
    }
    window.addEventListener('keydown', handleEvents)
    return () => window.removeEventListener('keydown', handleEvents)
  }, [isSearchOpen, results, selectedIndex])

  if (!isSearchOpen) return null

  return (
    <div 
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4 pointer-events-auto"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={close}
      />

      {/* Palette Container */}
      <div 
        ref={overlayRef}
        className="relative w-full max-w-[640px] bg-slate-900/90 backdrop-blur-2xl border border-white/10 
                   rounded-2xl shadow-[0_32px_128px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col
                   animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Search Input Area */}
        <div className="relative group border-b border-white/5">
          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search resources (Pods, Services, etc.)..."
            className="w-full bg-transparent text-slate-100 text-[16px] font-medium
                       pl-14 pr-16 py-5 focus:outline-none placeholder:text-slate-600"
          />
          <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <kbd className="bg-white/5 text-slate-500 text-[10px] font-black px-1.5 py-0.5 rounded border border-white/10">ESC</kbd>
          </div>
        </div>

        {/* Results / Empty State */}
        <div className="flex-1 max-h-[420px] overflow-y-auto py-2 scrollbar-hide">
          {!q ? (
            <div className="px-5 py-8 text-center">
              <p className="text-slate-500 text-sm font-medium">Type to search for resources across the cluster</p>
            </div>
          ) : results.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-slate-400 text-sm font-bold">No resources found matching "{searchQuery}"</p>
            </div>
          ) : (
            <div className="px-2 space-y-1">
              <p className="px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                Found {results.length} resources
              </p>
              {results.map((r, i) => (
                <button
                  ref={el => itemRefs.current[i] = el}
                  key={`${r.kind}-${r.metadata.uid}`}
                  onClick={() => select(r as any)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`flex items-center gap-4 w-full px-4 py-3.5 text-[14px] font-bold transition-all group rounded-xl text-left
                             ${i === selectedIndex ? 'bg-blue-500/10 text-slate-100 ring-1 ring-blue-500/20' : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]'}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${i === selectedIndex ? 'bg-blue-500/20' : 'bg-white/5 group-hover:bg-blue-500/10'}`}>
                    <Icon path={r.icon} size={18} className={i === selectedIndex ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`truncate leading-none mb-1.5 ${i === selectedIndex ? 'text-white' : 'text-slate-200'}`}>{r.metadata.name}</p>
                    <p className={`text-[11px] font-semibold truncate uppercase tracking-widest ${i === selectedIndex ? 'text-blue-400/80' : 'text-slate-500'}`}>
                      {r.kind.slice(0, -1)} • {r.metadata.namespace ?? 'cluster'}
                    </p>
                  </div>
                  <div className={`transition-opacity ${i === selectedIndex ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-blue-500">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <kbd className="bg-white/5 text-slate-400 font-black px-1 py-0.5 rounded border border-white/10 text-[9px]">↵</kbd>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">to select</span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="bg-white/5 text-slate-400 font-black px-1 py-0.5 rounded border border-white/10 text-[9px]">↑↓</kbd>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">to navigate</span>
            </div>
          </div>
          <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.2em]">Resource Quick Find</p>
        </div>
      </div>
    </div>
  )
}
