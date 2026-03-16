import React, { useEffect, useState, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { useAppStore } from '../store'
import type { QuerySpec, TimeRangePreset } from '../utils/prometheusQueries'
import { presetToSeconds } from '../utils/prometheusQueries'

interface Props {
  queries: QuerySpec[]
  title?: string
  /** Y-axis unit suffix appended to tick labels (e.g. "m", " MiB", "%") */
  unit?: string
  className?: string
}

interface SeriesPoint {
  t: number
  [label: string]: number
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
const PRESETS: TimeRangePreset[] = ['1h', '6h', '24h', '7d']

// ── Shared time-range bar ─────────────────────────────────────────────────────
// Render this ONCE above a group of charts — never show presets inside each chart.

export function PrometheusTimeRangeBar(): JSX.Element {
  const { prometheusActivePreset, setPrometheusTimeRange } = useAppStore()
  const handlePreset = (preset: TimeRangePreset) => {
    const end = Math.floor(Date.now() / 1000)
    setPrometheusTimeRange({ start: end - presetToSeconds(preset), end }, preset)
  }
  return (
    <div className="flex items-center gap-1">
      {PRESETS.map(p => (
        <button
          key={p}
          onClick={() => handlePreset(p)}
          className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
            prometheusActivePreset === p
              ? 'bg-blue-500 text-white shadow-sm'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 bg-black/5 dark:bg-white/5'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  )
}

// ── Chart ─────────────────────────────────────────────────────────────────────

export default function TimeSeriesChart({ queries, title, unit, className }: Props): JSX.Element | null {
  const { prometheusTimeRange, prometheusActivePreset } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SeriesPoint[] | null>(null)

  const fetchData = useCallback(async () => {
    if (!window.kubectl.prometheusQueryBatch) return
    setLoading(true)
    setError(null)
    try {
      const { start, end } = prometheusTimeRange
      const results = await window.kubectl.prometheusQueryBatch(queries, start, end)
      if (!Array.isArray(results) || results.length === 0) { setData([]); return }
      const merged: Record<number, SeriesPoint> = {}
      for (const result of results) {
        if (result.error) continue
        for (const pt of (result.points ?? [])) {
          if (!merged[pt.t]) merged[pt.t] = { t: pt.t }
          merged[pt.t][result.label] = Math.round(pt.v * 100) / 100
        }
      }
      setData(Object.values(merged).sort((a, b) => a.t - b.t))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [queries, prometheusTimeRange])

  useEffect(() => { fetchData() }, [fetchData])

  // Adapt time label to the active preset
  const formatTime = (ts: number): string => {
    const d = new Date(ts * 1000)
    if (prometheusActivePreset === '7d') {
      return d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
    }
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  // Short label for Y-axis ticks — keeps the axis narrow
  const formatYTick = (v: number): string => {
    const abs = Math.abs(v)
    const suffix = unit ?? ''
    if (abs >= 10000) return `${(v / 1000).toFixed(0)}k${suffix}`
    if (abs >= 1000)  return `${(v / 1000).toFixed(1)}k${suffix}`
    if (abs >= 100)   return `${Math.round(v)}${suffix}`
    if (abs >= 10)    return `${v.toFixed(1)}${suffix}`
    return `${v.toFixed(2)}${suffix}`
  }

  // Full label for tooltip
  const formatTooltipValue = (v: number): string => {
    return `${(Math.round(v * 100) / 100).toLocaleString()}${unit ?? ''}`
  }

  const CHART_H = 160

  return (
    <div className={`bg-slate-50/50 dark:bg-white/[0.02] rounded-2xl border border-slate-100 dark:border-white/5 overflow-hidden ${className ?? ''}`}>
      {/* Header — title + loading spinner only; preset buttons live in PrometheusTimeRangeBar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-white/5">
        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
          {title ?? ''}
        </span>
        <button
          onClick={fetchData}
          disabled={loading}
          className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-blue-500 transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={loading ? 'animate-spin' : ''}>
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
        </button>
      </div>

      {/* Chart area */}
      <div className="px-2 pt-3 pb-1">
        {loading && data === null ? (
          <div className="flex items-center justify-center" style={{ height: CHART_H }}>
            <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center px-4 text-center" style={{ height: CHART_H }}>
            <p className="text-[10px] font-bold text-red-400 leading-relaxed">{error}</p>
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: CHART_H }}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No data</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={CHART_H}>
            <LineChart data={data} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis
                dataKey="t"
                tickFormatter={formatTime}
                tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatYTick}
                domain={[0, 'auto']}
                width={56}
              />
              <Tooltip
                contentStyle={{
                  background: '#0f172a',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '8px 12px',
                }}
                labelStyle={{ color: '#94a3b8', marginBottom: 4, fontSize: 10 }}
                itemStyle={{ color: '#e2e8f0' }}
                labelFormatter={v => formatTime(Number(v))}
                formatter={(v: number, name: string) => [formatTooltipValue(v), name]}
              />
              {queries.length > 1 && (
                <Legend
                  wrapperStyle={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', paddingTop: 6 }}
                />
              )}
              {queries.map((q, i) => (
                <Line
                  key={q.label}
                  type="monotone"
                  dataKey={q.label}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
