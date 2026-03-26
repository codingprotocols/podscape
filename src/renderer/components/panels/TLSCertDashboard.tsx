import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useAppStore } from '../../store'
import {
  AlertTriangle, CheckCircle, Clock, X, Lock, Info, Search, RefreshCw
} from 'lucide-react'
import PageHeader from '../core/PageHeader'

interface TLSCertInfo {
  secretName: string
  namespace: string
  commonName: string
  dnsNames: string[]
  issuer: string
  notBefore: string
  notAfter: string
  daysLeft: number
  isExpired: boolean
  isExpiringSoon: boolean
  error?: string
}

// ── helpers ───────────────────────────────────────────────────────────────────

function certStatus(c: TLSCertInfo): 'error' | 'expired' | 'expiring' | 'valid' {
  if (c.error) return 'error'
  if (c.isExpired) return 'expired'
  if (c.isExpiringSoon) return 'expiring'
  return 'valid'
}

const STATUS_STYLE = {
  error:    { icon: <Lock className="w-3 h-3" />,           dot: 'bg-slate-500',   text: 'text-slate-400',   badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20',   label: 'Error'         },
  expired:  { icon: <AlertTriangle className="w-3 h-3" />, dot: 'bg-red-500',     text: 'text-red-400',     badge: 'bg-red-500/10 text-red-400 border-red-500/20',         label: 'Expired'       },
  expiring: { icon: <Clock className="w-3 h-3" />,         dot: 'bg-amber-400',   text: 'text-amber-400',   badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',   label: 'Expiring Soon' },
  valid:    { icon: <CheckCircle className="w-3 h-3" />,    dot: 'bg-emerald-400', text: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', label: 'Valid'      },
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── right panel: overview ──────────────────────────────────────────────────

function OverviewPanel({ certs }: { certs: TLSCertInfo[] }) {
  const counts = useMemo(() => ({
    expired:  certs.filter(c => c.isExpired).length,
    expiring: certs.filter(c => c.isExpiringSoon && !c.isExpired).length,
    valid:    certs.filter(c => !c.isExpired && !c.isExpiringSoon && !c.error).length,
    error:    certs.filter(c => !!c.error).length,
  }), [certs])

  const urgent = counts.expired + counts.expiring

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.05] shrink-0 flex items-center justify-between">
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-600">Overview</p>
        <Info className="w-3 h-3 text-slate-400 dark:text-slate-600" />
      </div>

      <div className="px-5 py-5 flex flex-col gap-5">
        {/* urgency hero */}
        {urgent > 0 && (
          <div className="rounded-xl bg-red-500/[0.07] border border-red-500/20 px-4 py-3.5 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-12 h-12 bg-red-500/10 blur-2xl rounded-full group-hover:bg-red-500/20 transition-all" />
            <p className="text-[9px] font-black uppercase tracking-widest text-red-500/60 mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-2.5 h-2.5" />
              Attention Required
            </p>
            <p className="text-2xl font-black text-red-400 leading-none">{urgent}</p>
            <p className="text-[10px] text-red-400/60 mt-1">
              {counts.expired > 0 && `${counts.expired} expired`}
              {counts.expired > 0 && counts.expiring > 0 && ' · '}
              {counts.expiring > 0 && `${counts.expiring} expiring soon`}
            </p>
          </div>
        )}

        {/* status breakdown */}
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600 mb-2.5">By Status</p>
          <div className="flex flex-col gap-1.5">
            {(['valid', 'expiring', 'expired', 'error'] as const).map(s => {
              const n = counts[s]
              const st = STATUS_STYLE[s]
              const total = certs.length || 1
              return (
                <div key={s} className="flex items-center gap-2.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                  <div className="flex-1 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                    <div className={`h-full rounded-full ${st.dot}`} style={{ width: `${(n / total) * 100}%` }} />
                  </div>
                  <span className={`text-[10px] font-bold w-6 text-right tabular-nums ${st.text}`}>{n}</span>
                  <span className="text-[9px] text-slate-600 w-20">{st.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* expiry timeline: next 5 expiring */}
        {(() => {
          const upcoming = [...certs]
            .filter(c => !c.isExpired && !c.error && c.notAfter)
            .sort((a, b) => a.daysLeft - b.daysLeft)
            .slice(0, 6)
          if (upcoming.length === 0) return null
          return (
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600 mb-2.5">Expiring Next</p>
              <div className="flex flex-col gap-1">
                {upcoming.map(c => {
                  const st = STATUS_STYLE[certStatus(c)]
                  return (
                    <div key={`${c.namespace}/${c.secretName}`} className="flex items-center gap-2.5 py-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                      <span className="text-[10px] font-mono text-slate-400 flex-1 truncate">{c.secretName}</span>
                      <span className={`text-[10px] font-bold tabular-nums ${st.text}`}>{c.daysLeft}d</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        <p className="text-[9px] text-slate-700 text-center mt-auto pt-2">Click a row to inspect a certificate</p>
      </div>
    </div>
  )
}

// ── right panel: cert detail ──────────────────────────────────────────────────

function CertDetail({ cert, onClose }: { cert: TLSCertInfo; onClose: () => void }) {
  const st = STATUS_STYLE[certStatus(cert)]

  // lifetime bar — where is "now" between notBefore and notAfter?
  const lifetimePct = useMemo(() => {
    if (cert.error || !cert.notBefore || !cert.notAfter) return null
    const start = new Date(cert.notBefore).getTime()
    const end   = new Date(cert.notAfter).getTime()
    const now   = Date.now()
    if (end <= start) return null
    return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100))
  }, [cert])

  const totalDays = useMemo(() => {
    if (!cert.notBefore || !cert.notAfter) return null
    const start = new Date(cert.notBefore).getTime()
    const end   = new Date(cert.notAfter).getTime()
    return Math.round((end - start) / 86400000)
  }, [cert])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* top bar */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0 border-b border-slate-200 dark:border-white/[0.05]">
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-600">Certificate</p>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-600 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* hero */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-200 dark:border-white/[0.05]">
        <div className="flex items-start justify-between mb-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${st.badge}`}>
            {st.icon}
            {st.label}
          </span>
          {!cert.error && !cert.isExpired && (
            <span className={`text-xl font-black tabular-nums ${st.text}`}>{cert.daysLeft}d</span>
          )}
          {cert.isExpired && (
            <span className="text-xl font-black text-red-400">{Math.abs(cert.daysLeft)}d ago</span>
          )}
        </div>

        <p className="font-mono text-sm font-bold text-slate-900 dark:text-white break-all leading-tight">{cert.secretName}</p>
        <p className="text-[10px] text-slate-500 font-mono mt-0.5">{cert.namespace}</p>

        {/* lifetime bar */}
        {lifetimePct !== null && (
          <div className="mt-4">
            <div className="relative h-2 rounded-full bg-slate-100 dark:bg-white/[0.07] overflow-visible">
              {/* filled portion */}
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${cert.isExpired ? 'bg-red-500' : cert.isExpiringSoon ? 'bg-amber-400' : 'bg-emerald-500'}`}
                style={{ width: `${lifetimePct}%` }}
              />
              {/* now marker */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-white/60 rounded-full"
                style={{ left: `${lifetimePct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[9px] text-slate-600">{fmtDate(cert.notBefore)}</span>
              {totalDays && <span className="text-[9px] text-slate-600">{totalDays}d total</span>}
              <span className="text-[9px] text-slate-600">{fmtDate(cert.notAfter)}</span>
            </div>
          </div>
        )}
      </div>

      {/* identity */}
      {!cert.error && (
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/[0.05]">
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-600 mb-3">Identity</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <span className="text-[10px] text-slate-500 dark:text-slate-600 w-16 shrink-0 pt-0.5">Common Name</span>
              <span className="font-mono text-[10px] text-slate-600 dark:text-slate-300 flex-1 break-all">{cert.commonName || '—'}</span>
            </div>
            {cert.dnsNames?.length > 0 && (
              <div className="flex items-start gap-3">
                <span className="text-[10px] text-slate-500 dark:text-slate-600 w-16 shrink-0 pt-0.5">SANs</span>
                <div className="flex flex-wrap gap-1 flex-1">
                  {cert.dnsNames.map(d => (
                    <span key={d} className="px-1.5 py-0.5 rounded bg-slate-50 dark:bg-white/[0.04] border border-slate-100 dark:border-white/[0.06] font-mono text-[9px] text-slate-600 dark:text-slate-400">{d}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <span className="text-[10px] text-slate-500 dark:text-slate-600 w-16 shrink-0 pt-0.5">Issuer</span>
              <span className="text-[10px] text-slate-600 dark:text-slate-400 flex-1 break-all">{cert.issuer || '—'}</span>
            </div>
          </div>
        </div>
      )}

      {/* validity dates */}
      {!cert.error && (
        <div className="px-5 py-4">
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-600 mb-3">Validity Period</p>
          <div className="rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.05] divide-y divide-slate-100 dark:divide-white/[0.04]">
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-[10px] text-slate-500 dark:text-slate-600 w-20 shrink-0">Not Before</span>
              <span className="font-mono text-[10px] text-slate-600 dark:text-slate-300">{fmtDate(cert.notBefore)}</span>
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-[10px] text-slate-500 dark:text-slate-600 w-20 shrink-0">Not After</span>
              <span className={`font-mono text-[10px] font-bold ${cert.isExpired ? 'text-red-400' : cert.isExpiringSoon ? 'text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
                {fmtDate(cert.notAfter)}
              </span>
            </div>
          </div>
        </div>
      )}

      {cert.error && (
        <div className="px-5 py-4">
          <div className="rounded-xl bg-slate-500/[0.08] border border-slate-500/20 px-3 py-3">
            <p className="text-[10px] font-bold text-slate-400 mb-1">Parse Error</p>
            <p className="text-[10px] text-slate-500 leading-relaxed">{cert.error}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── table row ─────────────────────────────────────────────────────────────────

function CertRow({ cert, selected, onClick }: { cert: TLSCertInfo; selected: boolean; onClick: () => void }) {
  const st = STATUS_STYLE[certStatus(cert)]
  return (
    <tr
      onClick={onClick}
      className={`cursor-pointer transition-colors ${selected ? 'bg-blue-500/[0.08]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'}`}
    >
      <td className="pl-5 pr-3 py-3">
        <span className={`w-1.5 h-1.5 rounded-full inline-block ${st.dot}`} />
      </td>
      <td className="px-3 py-3 max-w-0">
        <p className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">{cert.secretName}</p>
      </td>
      <td className="px-3 py-3 text-[10px] text-slate-500 font-mono whitespace-nowrap">{cert.namespace}</td>
      <td className="px-3 py-3 max-w-0">
        {cert.error
          ? <span className="text-[10px] text-slate-600 italic">parse error</span>
          : <span className="font-mono text-[10px] text-slate-400 truncate block">{cert.commonName || '—'}</span>
        }
      </td>
      <td className="px-3 py-3 max-w-0">
        <span className="text-[10px] text-slate-500 truncate block" title={cert.issuer}>{cert.issuer || '—'}</span>
      </td>
      <td className="px-3 py-3 whitespace-nowrap text-[10px] text-slate-500">{fmtDate(cert.notAfter)}</td>
      <td className="px-3 py-3 whitespace-nowrap">
        {cert.error ? <span className="text-[10px] text-slate-600">—</span>
          : cert.isExpired
            ? <span className="text-[10px] font-bold text-red-400">{Math.abs(cert.daysLeft)}d ago</span>
            : <span className={`text-[10px] font-bold tabular-nums ${st.text}`}>{cert.daysLeft}d</span>
        }
      </td>
      <td className="px-3 pr-5 py-3 whitespace-nowrap">
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${st.badge}`}>
          {st.icon}
          {st.label}
        </span>
      </td>
    </tr>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function TLSCertDashboard() {
  const { selectedContext, selectedNamespace } = useAppStore()
  const [certs, setCerts]       = useState<TLSCertInfo[]>([])
  const [loading, setLoading]   = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter]     = useState<'all' | 'expired' | 'expiring' | 'valid'>('all')
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<TLSCertInfo | null>(null)

  const load = useCallback(async () => {
    if (!selectedContext) return
    setLoading(true)
    setLoadError(null)
    try {
      const ns = selectedNamespace === '_all' ? undefined : selectedNamespace ?? undefined
      const data = await window.kubectl.getTLSCerts(ns)
      setCerts([...data].sort((a, b) => {
        if (a.isExpired && !b.isExpired) return -1
        if (!a.isExpired && b.isExpired) return 1
        if (a.isExpiringSoon && !b.isExpiringSoon) return -1
        if (!a.isExpiringSoon && b.isExpiringSoon) return 1
        return a.daysLeft - b.daysLeft
      }))
    } catch (err) {
      setCerts([])
      setLoadError((err as Error)?.message ?? 'Failed to load TLS certificates')
    } finally {
      setLoading(false)
    }
  }, [selectedContext, selectedNamespace])

  useEffect(() => { load() }, [load])
  useEffect(() => { setSelected(null) }, [selectedContext, selectedNamespace])

  const expiredCount  = useMemo(() => certs.filter(c => c.isExpired).length, [certs])
  const expiringCount = useMemo(() => certs.filter(c => c.isExpiringSoon && !c.isExpired).length, [certs])
  const validCount    = useMemo(() => certs.filter(c => !c.isExpired && !c.isExpiringSoon && !c.error).length, [certs])

  const filtered = useMemo(() => certs.filter(c => {
    if (filter === 'expired'  && !c.isExpired) return false
    if (filter === 'expiring' && (!c.isExpiringSoon || c.isExpired)) return false
    if (filter === 'valid'    && (c.isExpired || c.isExpiringSoon || !!c.error)) return false
    if (search) {
      const q = search.toLowerCase()
      return c.secretName.toLowerCase().includes(q)
        || c.namespace.toLowerCase().includes(q)
        || (c.commonName ?? '').toLowerCase().includes(q)
        || (c.dnsNames ?? []).some(d => d.toLowerCase().includes(q))
    }
    return true
  }), [certs, filter, search])

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-[hsl(var(--bg-dark))] overflow-hidden relative h-full transition-colors duration-200">

      <PageHeader
        title="TLS Certificates"
        subtitle="Monitoring cluster-wide SSL/TLS certificate health"
      >
        <div className="flex items-center gap-6">
          {/* filter chips */}
          <div className="flex items-center gap-1 border-r border-slate-200 dark:border-white/10 pr-6 mr-2">
            {([
              { key: 'all'      as const, label: `All (${certs.length})` },
              { key: 'expired'  as const, label: `Expired (${expiredCount})`,        active: expiredCount > 0  },
              { key: 'expiring' as const, label: `Expiring (${expiringCount})`,      active: expiringCount > 0 },
              { key: 'valid'    as const, label: `Valid (${validCount})` },
            ]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(v => v === f.key ? 'all' : f.key)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all
                  ${filter === f.key
                    ? f.key === 'expired'  ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30'
                    : f.key === 'expiring' ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30'
                    : f.key === 'valid'    ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                    : 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/30'
                    : (f as any).active
                      ? f.key === 'expired'  ? 'text-red-500 hover:text-red-400'
                      : 'text-amber-500 hover:text-amber-400'
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {/* search */}
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none" />
              <input
                type="text"
                placeholder="Search certificates…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all w-48"
              />
            </div>

            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-all disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </PageHeader>

      {/* ── body ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center gap-3 text-slate-600">
          <div className="w-4 h-4 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-xs font-bold">Loading certificates…</span>
        </div>
      ) : loadError ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-red-500/[0.08] border border-red-500/20 max-w-md">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <div>
              <p className="text-[11px] font-black text-red-400">Failed to load certificates</p>
              <p className="text-[10px] text-red-400/60 mt-0.5">{loadError}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">

          {/* ── left: table ─────────────────────────────────────────────── */}
          <div className="flex flex-col overflow-y-auto" style={{ width: '65%' }}>
            {filtered.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-600 py-16">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <p className="text-xs font-bold">{certs.length === 0 ? 'No TLS secrets found' : 'No certs match the filter'}</p>
              </div>
            ) : (
              <table className="w-full text-left" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '24px' }} />
                  <col />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '150px' }} />
                  <col style={{ width: '160px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '70px' }} />
                  <col style={{ width: '100px' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/[0.05]">
                    <th className="pl-5 pr-3 py-2.5" />
                    {['Secret', 'Namespace', 'Common Name', 'Issuer', 'Expires', 'Days Left', 'Status'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-600 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.03]">
                  {filtered.map(cert => (
                    <CertRow
                      key={`${cert.namespace}/${cert.secretName}`}
                      cert={cert}
                      selected={selected?.secretName === cert.secretName && selected?.namespace === cert.namespace}
                      onClick={() => setSelected(p =>
                        p?.secretName === cert.secretName && p?.namespace === cert.namespace ? null : cert
                      )}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── right: detail or overview ───────────────────────────────── */}
          <div className="border-l border-slate-200 dark:border-white/[0.05] overflow-hidden" style={{ width: '35%' }}>
            {selected
              ? <CertDetail cert={selected} onClose={() => setSelected(null)} />
              : <OverviewPanel certs={certs} />
            }
          </div>

        </div>
      )}
    </div>
  )
}
