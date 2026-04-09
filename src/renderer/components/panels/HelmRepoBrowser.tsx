import React, { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, Package, ChevronRight, Globe, Tag, PlusCircle } from 'lucide-react'
import { RefreshButton } from '../common'
import HelmInstallDialog from './HelmInstallDialog'
import type { HelmInstallHint } from '../../store/slices/navigationSlice'

interface Repo {
  name: string
  url: string
}

interface ChartEntry {
  name: string
  repo: string
  description: string
  version: string
  appVersion: string
}

interface SearchResult {
  charts: ChartEntry[]
  total: number
}

interface Props {
  installHint?: HelmInstallHint
  onHintConsumed?: () => void
}

const PAGE_SIZE = 30

export default function HelmRepoBrowser({ installHint, onHintConsumed }: Props): JSX.Element {
  const [repos, setRepos] = useState<Repo[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult | null>(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshLog, setRefreshLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [installTarget, setInstallTarget] = useState<{ name: string; repo: string } | null>(null)
  const [addingRepo, setAddingRepo] = useState(false)
  const [addRepoError, setAddRepoError] = useState<string | null>(null)

  const loadRepos = useCallback(async () => {
    if (!window.helm.repoList) return
    try {
      const raw = await window.helm.repoList()
      setRepos(Array.isArray(raw) ? raw as Repo[] : [])
    } catch {
      setRepos([])
    }
  }, [])

  const search = useCallback(async (q: string, off: number) => {
    if (!window.helm.repoSearch) return
    setLoading(true)
    setError(null)
    try {
      const result = await window.helm.repoSearch(q, PAGE_SIZE, off)
      setResults(result as SearchResult)
      setOffset(off)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRepos()
    search('', 0)
  }, [loadRepos, search])

  // When an install hint arrives, pre-fill the search with the chart name.
  useEffect(() => {
    if (!installHint) return
    setQuery(installHint.chart)
    search(installHint.chart, 0)
    onHintConsumed?.()
  }, [installHint])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    search(query, 0)
  }

  const handleRefresh = async () => {
    if (!window.helm.repoRefresh) return
    setRefreshing(true)
    setRefreshLog([])
    try {
      const unsubProgress = window.helm.onRefreshProgress((msg: string) => {
        setRefreshLog(prev => [...prev.slice(-19), msg])
      })
      await window.helm.repoRefresh()
      unsubProgress()
      await loadRepos()
      await search(query, 0)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  // The "pending" hint passed via prop may already be cleared (onHintConsumed),
  // so we track the last seen hint separately for the "Add repo" banner.
  const [pendingHint, setPendingHint] = useState<HelmInstallHint | null>(null)
  useEffect(() => {
    if (installHint) setPendingHint(installHint)
  }, [installHint])

  const repoForBanner = pendingHint && !repos.some(r => r.name === pendingHint.repoName)
    ? pendingHint
    : null

  const handleAddRepo = async () => {
    if (!repoForBanner) return
    setAddingRepo(true)
    setAddRepoError(null)
    try {
      await window.helm.repoAdd(repoForBanner.repoName, repoForBanner.repoUrl)
      await loadRepos()
      await search(repoForBanner.chart, 0)
      setQuery(repoForBanner.chart)
      setPendingHint(null)
    } catch (err) {
      setAddRepoError((err as Error).message)
    } finally {
      setAddingRepo(false)
    }
  }

  const charts = results?.charts ?? []
  const total = results?.total ?? 0

  return (
    <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden flex-col">
      {/* Add-repo banner (shown when arriving from CostPanel and repo not yet added) */}
      {repoForBanner && (
        <div className="flex items-center gap-3 px-5 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800/50 shrink-0">
          <PlusCircle size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-[11px] text-slate-700 dark:text-slate-200 flex-1">
            Add the <span className="font-mono font-bold">{repoForBanner.repoName}</span> repository to browse and install <span className="font-mono font-bold">{repoForBanner.chart}</span>.
          </span>
          {addRepoError && (
            <span className="text-[10px] text-red-500 font-mono mr-2">{addRepoError}</span>
          )}
          <button
            onClick={handleAddRepo}
            disabled={addingRepo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-all disabled:opacity-50 active:scale-95"
          >
            {addingRepo ? <RefreshCw size={10} className="animate-spin" /> : <PlusCircle size={10} />}
            {addingRepo ? 'Adding…' : 'Add Repo'}
          </button>
        </div>
      )}

      <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
        {/* Sidebar: Repos */}
        <div className="w-52 shrink-0 border-r border-slate-100 dark:border-white/5 flex flex-col overflow-hidden">
          <div className="px-4 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Repositories</span>
              <RefreshButton
                onClick={handleRefresh}
                loading={refreshing}
                title="Update all repos"
                className="!px-2 !py-1.5"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {repos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 px-4 text-center">
                <Globe size={20} strokeWidth={1.5} className="text-slate-300 dark:text-slate-600" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No repos</p>
                <p className="text-[9px] text-slate-400">Run: helm repo add ...</p>
              </div>
            ) : (
              repos.map(r => (
                <button
                  key={r.name}
                  onClick={() => { setQuery(r.name + '/'); search(r.name + '/', 0) }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group"
                >
                  <Package size={12} className="text-slate-400 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{r.name}</span>
                  <ChevronRight size={10} className="text-slate-300 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))
            )}
          </div>

          {/* Refresh log */}
          {refreshLog.length > 0 && (
            <div className="shrink-0 border-t border-slate-100 dark:border-white/5 p-2 max-h-28 overflow-y-auto scrollbar-hide">
              {refreshLog.map((line, i) => (
                <p key={i} className="text-[9px] font-mono text-slate-500 truncate">{line}</p>
              ))}
            </div>
          )}
        </div>

        {/* Main: Search + Results */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
            <div className="relative flex-1 max-w-lg">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search charts..."
                className="w-full pl-9 pr-4 py-2 text-[11px] font-bold bg-slate-100 dark:bg-slate-900 border border-transparent focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-[10px] font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all disabled:opacity-50 shadow-sm"
            >
              Search
            </button>
            {results !== null && (
              <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{total} charts</span>
            )}
          </form>

          {/* Chart list */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {error ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">{error}</p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : charts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <Package size={24} strokeWidth={1.5} className="text-slate-300 dark:text-slate-600" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {repos.length === 0 ? 'Add a repository to browse charts' : 'No charts found'}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-white/70 dark:bg-[hsl(var(--bg-dark),0.7)] backdrop-blur-xl z-10">
                  <tr className="border-b border-slate-100 dark:border-white/5">
                    {['Chart', 'Repository', 'Version', 'App Version', 'Description'].map(h => (
                      <th key={h} className="text-left px-6 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                  {charts.map(c => {
                    const shortName = c.name.includes('/') ? c.name.split('/').slice(1).join('/') : c.name
                    return (
                      <tr key={c.name} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors group">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <Package size={12} className="text-slate-400 shrink-0" />
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 font-mono">{shortName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono">{c.repo}</td>
                        <td className="px-6 py-3">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
                            <Tag size={9} /> {c.version}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-[10px] text-slate-500 font-mono">{c.appVersion || '—'}</td>
                        <td className="px-6 py-3 text-[10px] text-slate-500 max-w-[200px] truncate">{c.description}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setInstallTarget({ name: c.name, repo: c.repo })}
                            className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all opacity-0 group-hover:opacity-100 shadow-sm active:scale-95"
                          >
                            Install
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 px-6 py-3 border-t border-slate-100 dark:border-white/5 shrink-0">
              <button
                onClick={() => search(query, Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0 || loading}
                className="px-4 py-1.5 text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-white/5 rounded-xl disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
              >
                Previous
              </button>
              <span className="text-[10px] font-bold text-slate-400">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <button
                onClick={() => search(query, offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total || loading}
                className="px-4 py-1.5 text-[10px] font-black uppercase tracking-wider bg-slate-100 dark:bg-white/5 rounded-xl disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Install dialog */}
        {installTarget && (
          <HelmInstallDialog
            chartName={installTarget.name}
            repoName={installTarget.repo}
            onClose={() => setInstallTarget(null)}
          />
        )}
      </div>
    </div>
  )
}
