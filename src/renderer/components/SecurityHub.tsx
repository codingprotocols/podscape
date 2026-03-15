import React, { useMemo, useState, useRef, useEffect, useDeferredValue } from 'react'
import { useAppStore } from '../store'
import { scannerEngine } from '../utils/scanner/engine'
import { buildUnifiedResults } from '../utils/security/buildUnifiedResults'
import { getUniqueImages } from '../utils/security/extractImages'
import type { UniqueImageEntry } from '../utils/security/extractImages'
export type { UnifiedResource } from '../utils/security/buildUnifiedResults'
export { buildUnifiedResults } from '../utils/security/buildUnifiedResults'
import type { CustomScanOptions } from '../store/types'
import {
    AlertTriangle, ShieldCheck, AlertCircle, Lock, Zap,
    LayoutGrid, ListFilter, Download, ChevronDown, Search,
    EyeOff, X, SlidersHorizontal,
    Box, Layers, Database, Server, Play, Clock, Globe, FileText,
    HardDrive, TrendingUp, RefreshCw, Network, Folder, Key,
} from 'lucide-react'

// ── Kind → icon + colour ──────────────────────────────────────────────────────

const KIND_META: Record<string, { icon: React.ReactNode; bg: string; border: string; text: string }> = {
    Pod:                    { icon: <Box className="w-4 h-4" />,        bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     text: 'text-sky-400' },
    Deployment:             { icon: <Layers className="w-4 h-4" />,     bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    text: 'text-blue-400' },
    StatefulSet:            { icon: <Database className="w-4 h-4" />,   bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  text: 'text-violet-400' },
    DaemonSet:              { icon: <Server className="w-4 h-4" />,     bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  text: 'text-indigo-400' },
    Job:                    { icon: <Play className="w-4 h-4" />,       bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
    CronJob:                { icon: <Clock className="w-4 h-4" />,      bg: 'bg-teal-500/10',    border: 'border-teal-500/20',    text: 'text-teal-400' },
    Service:                { icon: <Network className="w-4 h-4" />,    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20',    text: 'text-cyan-400' },
    Ingress:                { icon: <Globe className="w-4 h-4" />,      bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    text: 'text-blue-400' },
    ConfigMap:              { icon: <FileText className="w-4 h-4" />,   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   text: 'text-amber-400' },
    Secret:                 { icon: <Key className="w-4 h-4" />,        bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  text: 'text-orange-400' },
    Node:                   { icon: <Server className="w-4 h-4" />,     bg: 'bg-slate-500/10',   border: 'border-slate-500/20',   text: 'text-slate-400' },
    Namespace:              { icon: <Folder className="w-4 h-4" />,     bg: 'bg-slate-500/10',   border: 'border-slate-500/20',   text: 'text-slate-400' },
    PersistentVolumeClaim:  { icon: <HardDrive className="w-4 h-4" />,  bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    text: 'text-rose-400' },
    PersistentVolume:       { icon: <HardDrive className="w-4 h-4" />,  bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    text: 'text-rose-400' },
    HorizontalPodAutoscaler:{ icon: <TrendingUp className="w-4 h-4" />, bg: 'bg-green-500/10',   border: 'border-green-500/20',   text: 'text-green-400' },
    ReplicaSet:             { icon: <RefreshCw className="w-4 h-4" />,  bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    text: 'text-blue-400' },
}
const KIND_DEFAULT = { icon: <Box className="w-4 h-4" />, bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-400' }

function KindIcon({ kind }: { kind: string }) {
    const meta = KIND_META[kind] ?? KIND_DEFAULT
    return (
        <div className={`w-8 h-8 rounded-lg ${meta.bg} border ${meta.border} ${meta.text} flex items-center justify-center shrink-0`}>
            {meta.icon}
        </div>
    )
}

const WORKLOAD_KINDS = ['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'] as const

const SYSTEM_NAMESPACES = ['kube-system', 'kube-node-lease', 'local-path-storage', 'kube-public']


type SeverityFilter = 'all' | 'critical' | 'warning'

export default function SecurityHub(): JSX.Element {
    const {
        pods, deployments, statefulsets, daemonsets, jobs, cronjobs,
        selectedNamespace, scanSecurity, securityScanResults, kubesecBatchResults,
        trivyAvailable, securityScanning, securityScanProgressLines, error,
    } = useAppStore()

    const [groupByNamespace, setGroupByNamespace] = useState(false)
    const [includeSystem, setIncludeSystem] = useState(false)
    const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
    const [ignoredNamespaces, setIgnoredNamespaces] = useState<Set<string>>(new Set())
    const [filterNamespace, setFilterNamespace] = useState<string | null>(null)
    const [showCustomScan, setShowCustomScan] = useState(false)
    const [showImagePicker, setShowImagePicker] = useState(false)
    const [pendingScanOpts, setPendingScanOpts] = useState<CustomScanOptions | null>(null)

    // All workloads before namespace-ignore filter (used to build the picker list)
    const baseWorkloads = useMemo(() => {
        const workloads = [
            ...pods, ...deployments, ...statefulsets,
            ...daemonsets, ...jobs, ...cronjobs,
        ]
        if (!includeSystem) {
            return workloads.filter(w => !SYSTEM_NAMESPACES.includes(w.metadata.namespace || ''))
        }
        return workloads
    }, [pods, deployments, statefulsets, daemonsets, jobs, cronjobs, includeSystem])

    // Unique namespaces available for the ignore picker
    const availableNamespaces = useMemo(() => {
        const ns = new Set<string>()
        baseWorkloads.forEach(w => { if (w.metadata.namespace) ns.add(w.metadata.namespace) })
        return Array.from(ns).sort()
    }, [baseWorkloads])

    // Final workload list after namespace ignoring
    const allWorkloads = useMemo(() => {
        if (ignoredNamespaces.size === 0) return baseWorkloads
        return baseWorkloads.filter(w => !ignoredNamespaces.has(w.metadata.namespace || ''))
    }, [baseWorkloads, ignoredNamespaces])

    // Workloads scoped to pendingScanOpts (for the image picker).
    const pickerWorkloads = useMemo(() => {
        if (!pendingScanOpts) return allWorkloads
        let ws = allWorkloads
        if (pendingScanOpts.namespaces.length > 0) {
            const nsSet = new Set(pendingScanOpts.namespaces)
            ws = ws.filter(w => nsSet.has(w.metadata.namespace || ''))
        }
        if (pendingScanOpts.kinds.length > 0) {
            const kindSet = new Set(pendingScanOpts.kinds.map(k => k.toLowerCase()))
            ws = ws.filter(w => kindSet.has((w.kind || '').toLowerCase()))
        }
        return ws
    }, [pendingScanOpts, allWorkloads])

    // useDeferredValue marks the scan as non-urgent so React can yield to user
    // input while the engine computes (avoids blocking the UI thread on large clusters).
    const deferredWorkloads = useDeferredValue(allWorkloads)
    const scanResults = useMemo(() => {
        return deferredWorkloads
            .map(w => ({ resource: w, result: scannerEngine.scan(w) }))
            .filter(r => r.result.issues.length > 0)
    }, [deferredWorkloads])

    const stats = useMemo(() => {
        const issues = scanResults.flatMap(r => r.result.issues)
        return {
            critical: issues.filter(i => i.level === 'error').length,
            warning: issues.filter(i => i.level === 'warning').length,
            vulnerableWorkloads: scanResults.length,
        }
    }, [scanResults])

    const unifiedResults = useMemo(
        () => buildUnifiedResults(scanResults, securityScanResults, kubesecBatchResults),
        [scanResults, securityScanResults, kubesecBatchResults]
    )

    const criticalCount = unifiedResults.filter(r =>
        r.issues.some((i: any) => i.level === 'error') ||
        r.vulnerabilities.some((v: any) => ['CRITICAL', 'HIGH'].includes(v.severity))
    ).length
    const warningCount = unifiedResults.filter(r =>
        r.issues.some((i: any) => i.level === 'warning')
    ).length

    const filteredResults = useMemo(() => {
        let results = unifiedResults
        if (filterNamespace) {
            results = results.filter(r => r.namespace === filterNamespace)
        }
        if (severityFilter === 'critical') {
            return results.filter(r =>
                r.issues.some((i: any) => i.level === 'error') ||
                r.vulnerabilities.some((v: any) => ['CRITICAL', 'HIGH'].includes(v.severity))
            )
        }
        if (severityFilter === 'warning') {
            return results.filter(r => r.issues.some((i: any) => i.level === 'warning'))
        }
        return results
    }, [unifiedResults, severityFilter, filterNamespace])

    // Namespaces that actually appear in scan results (for the filter dropdown).
    const resultNamespaces = useMemo(() => {
        const ns = new Set<string>()
        unifiedResults.forEach(r => { if (r.namespace) ns.add(r.namespace) })
        return Array.from(ns).sort()
    }, [unifiedResults])

    // Reset namespace filter if the selected namespace disappears from results.
    useEffect(() => {
        if (filterNamespace && !resultNamespaces.includes(filterNamespace)) {
            setFilterNamespace(null)
        }
    }, [resultNamespaces, filterNamespace])

    const toggleIgnoreNs = (ns: string) => {
        setIgnoredNamespaces(prev => {
            const next = new Set(prev)
            if (next.has(ns)) next.delete(ns); else next.add(ns)
            return next
        })
    }

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-[#020617] overflow-hidden relative">
            {showCustomScan && (
                <CustomScanModal
                    namespaces={availableNamespaces}
                    trivyAvailable={trivyAvailable}
                    onRun={(opts) => {
                        setShowCustomScan(false)
                        if (opts.runTrivy) {
                            setPendingScanOpts(opts)
                            setShowImagePicker(true)
                        } else {
                            scanSecurity(opts)
                        }
                    }}
                    onClose={() => setShowCustomScan(false)}
                />
            )}
            {showImagePicker && (
                <ImagePickerModal
                    workloads={pickerWorkloads}
                    onScan={(selectedImages) => {
                        setShowImagePicker(false)
                        scanSecurity({
                            ...(pendingScanOpts ?? { namespaces: [], kinds: [], runKubesec: true }),
                            runTrivy: selectedImages.length > 0,
                            selectedImages,
                        })
                    }}
                    onSkip={() => {
                        setShowImagePicker(false)
                        scanSecurity({
                            ...(pendingScanOpts ?? { namespaces: [], kinds: [], runKubesec: true }),
                            runTrivy: false,
                            selectedImages: [],
                        })
                    }}
                    onClose={() => setShowImagePicker(false)}
                />
            )}
            {/* ── Header ── */}
            <div className="px-8 py-6 border-b border-white/5 bg-white/[0.02] shrink-0">
                <div className="flex items-start justify-between mb-6">
                    {/* Title */}
                    <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-2xl premium-gradient flex items-center justify-center shadow-2xl shadow-blue-500/20 shrink-0">
                            <ShieldCheck className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white tracking-tight leading-none mb-1.5">Security Hub</h2>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-black text-blue-400 uppercase tracking-widest">
                                    {selectedNamespace === '_all' ? 'Cluster-wide' : selectedNamespace}
                                </span>
                                <span className="w-1 h-1 rounded-full bg-slate-700" />
                                <span className="text-[10px] text-slate-500 font-semibold">
                                    {allWorkloads.length} workloads monitored
                                </span>
                                {ignoredNamespaces.size > 0 && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-slate-700" />
                                        <span className="text-[10px] text-slate-500 font-semibold">
                                            {ignoredNamespaces.size} namespace{ignoredNamespaces.size !== 1 ? 's' : ''} ignored
                                        </span>
                                    </>
                                )}
                                {unifiedResults.length > 0 && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-slate-700" />
                                        <span className="text-[10px] font-bold text-amber-500">
                                            {unifiedResults.length} need attention
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Scan buttons */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowCustomScan(true)}
                                disabled={securityScanning}
                                className={`h-9 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 ${
                                    securityScanning ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/8 hover:border-white/15'
                                }`}
                            >
                                <SlidersHorizontal className="w-3 h-3" />
                                Custom Scan
                            </button>
                            <button
                                onClick={() => {
                                    if (trivyAvailable === false) {
                                        scanSecurity({ namespaces: [], kinds: [], runTrivy: false, runKubesec: true })
                                    } else {
                                        setPendingScanOpts(null)
                                        setShowImagePicker(true)
                                    }
                                }}
                                disabled={securityScanning}
                                className={`h-9 px-4 rounded-xl premium-gradient text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all active:scale-95 ${
                                    securityScanning ? 'opacity-50 cursor-not-allowed' : 'hover:-translate-y-0.5 hover:shadow-blue-500/20'
                                }`}
                            >
                                {securityScanning
                                    ? <div className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
                                    : <Search className="w-3 h-3" />
                                }
                                {securityScanning ? 'Scanning...' : 'Full Scan'}
                            </button>
                        </div>
                        <p className="text-[9px] text-slate-600 font-medium">
                            {trivyAvailable === false
                                ? 'trivy not installed — config analysis only'
                                : trivyAvailable === true ? 'config + image CVEs'
                                : 'config analysis · trivy for CVEs'}
                        </p>
                    </div>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-4 gap-3">
                    <StatCard
                        label="Critical"
                        value={stats.critical}
                        icon={<AlertCircle className="w-4 h-4" />}
                        active={stats.critical > 0}
                        activeColor="text-red-400"
                        activeBg="bg-red-500/10 border-red-500/15"
                    />
                    <StatCard
                        label="Warnings"
                        value={stats.warning}
                        icon={<AlertTriangle className="w-4 h-4" />}
                        active={stats.warning > 0}
                        activeColor="text-amber-400"
                        activeBg="bg-amber-500/10 border-amber-500/15"
                    />
                    <StatCard
                        label="Clean"
                        value={allWorkloads.length - stats.vulnerableWorkloads}
                        icon={<ShieldCheck className="w-4 h-4" />}
                        active={true}
                        activeColor="text-emerald-400"
                        activeBg="bg-emerald-500/10 border-emerald-500/15"
                    />
                    <StatCard
                        label="Image CVEs"
                        value={trivyAvailable === false ? 'No trivy' : trivyAvailable === true ? 'Scanned' : 'Not run'}
                        icon={<Lock className="w-4 h-4" />}
                        active={trivyAvailable === true}
                        activeColor="text-emerald-400"
                        activeBg="bg-emerald-500/10 border-emerald-500/15"
                        inactiveColor={trivyAvailable === false ? 'text-amber-400' : 'text-slate-500'}
                    />
                </div>
            </div>

            {/* ── Scan Progress Terminal ── */}
            {securityScanning && (
                <div className="px-8 py-4 border-b border-white/5 bg-black/20 shrink-0">
                    <div className="rounded-xl bg-black/50 border border-white/[0.06] overflow-hidden">
                        <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em]">Scan Progress</span>
                            </div>
                            <span className="text-[9px] text-amber-600 font-medium">may take several minutes per image</span>
                        </div>
                        <div className="px-4 py-3 space-y-1 font-mono min-h-[3rem]">
                            {securityScanProgressLines.length === 0 ? (
                                <p className="text-[11px] text-slate-600 italic">Initializing…</p>
                            ) : (
                                securityScanProgressLines.map((line, i) => {
                                    const isMilestone = line.startsWith('› ')
                                    return isMilestone ? (
                                        <p key={i} className="text-[11px] text-blue-400 leading-snug flex items-center gap-1.5">
                                            <span className="text-blue-500 text-[10px] shrink-0">›</span>
                                            {line.slice(2)}
                                        </p>
                                    ) : (
                                        <p key={i} className="text-[10px] text-slate-500 leading-snug truncate pl-3.5">{line}</p>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Toolbar ── */}
            <div className="px-8 py-3 border-b border-white/5 flex items-center justify-between gap-4 bg-[#020617]/95 backdrop-blur-sm sticky top-0 z-10 shrink-0">
                {/* Severity tabs */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border border-white/5">
                    <FilterTab label={`All  ${unifiedResults.length}`} active={severityFilter === 'all'} onClick={() => setSeverityFilter('all')} color="default" />
                    <FilterTab label={`Critical  ${criticalCount}`} active={severityFilter === 'critical'} onClick={() => setSeverityFilter('critical')} color="red" />
                    <FilterTab label={`Warnings  ${warningCount}`} active={severityFilter === 'warning'} onClick={() => setSeverityFilter('warning')} color="amber" />
                </div>

                {/* Namespace filter */}
                <div className="flex items-center gap-2 flex-1 justify-center">
                    <NamespaceFilterDropdown
                        namespaces={resultNamespaces}
                        value={filterNamespace}
                        onChange={setFilterNamespace}
                    />
                </div>

                {/* View controls */}
                <div className="flex items-center gap-2">
                    <NamespaceIgnorePicker
                        namespaces={availableNamespaces}
                        ignored={ignoredNamespaces}
                        onToggle={toggleIgnoreNs}
                        onClear={() => setIgnoredNamespaces(new Set())}
                    />
                    <button
                        onClick={() => setGroupByNamespace(!groupByNamespace)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-[10px] font-bold uppercase tracking-widest ${
                            groupByNamespace
                                ? 'bg-blue-500/10 border-blue-500/25 text-blue-400'
                                : 'bg-white/[0.03] border-white/8 text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                        }`}
                    >
                        <LayoutGrid className="w-3 h-3" />
                        By NS
                    </button>
                    <button
                        onClick={() => setIncludeSystem(!includeSystem)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-[10px] font-bold uppercase tracking-widest ${
                            includeSystem
                                ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                                : 'bg-white/[0.03] border-white/8 text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                        }`}
                    >
                        <ListFilter className="w-3 h-3" />
                        {includeSystem ? 'Hide System' : 'System NS'}
                    </button>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto scrollbar-hide p-8 space-y-3">
                {/* Ignored namespace chips */}
                {ignoredNamespaces.size > 0 && (
                    <div className="flex items-center gap-2 flex-wrap pb-2">
                        <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Ignoring:</span>
                        {Array.from(ignoredNamespaces).map(ns => (
                            <button
                                key={ns}
                                onClick={() => toggleIgnoreNs(ns)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-500/10 border border-slate-500/20 text-[10px] font-bold text-slate-400 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-colors"
                            >
                                <EyeOff className="w-2.5 h-2.5" />
                                {ns}
                                <X className="w-2.5 h-2.5" />
                            </button>
                        ))}
                    </div>
                )}

                {/* Trivy not installed banner */}
                {trivyAvailable === false && (
                    <div className="p-4 rounded-xl bg-amber-500/[0.04] border border-amber-500/15 flex items-start gap-3 mb-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Download className="w-3.5 h-3.5 text-amber-500" />
                        </div>
                        <div>
                            <p className="text-[12px] font-bold text-amber-400 mb-0.5">Trivy not installed</p>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                                Image CVE scanning requires the trivy CLI.
                                Install with{' '}
                                <code className="px-1.5 py-0.5 rounded bg-white/5 text-slate-200 font-mono text-[10px]">brew install trivy</code>.
                                {' '}Configuration analysis below works without it.
                            </p>
                        </div>
                    </div>
                )}

                {/* Generic scan error */}
                {error && (
                    <div className="p-4 rounded-xl bg-red-500/8 border border-red-500/20 flex items-center gap-3 mb-2">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                        <p className="text-[11px] font-semibold text-red-400">{error}</p>
                    </div>
                )}

                {/* Results */}
                {filteredResults.length === 0 ? (
                    <EmptyState
                        filtered={severityFilter !== 'all'}
                        totalWorkloads={allWorkloads.length}
                        hasAnyIssues={unifiedResults.length > 0}
                    />
                ) : groupByNamespace ? (
                    Object.entries(
                        filteredResults.reduce((acc: Record<string, any[]>, res: any) => {
                            const ns = res.namespace || 'cluster-scoped'
                            if (!acc[ns]) acc[ns] = []
                            acc[ns].push(res)
                            return acc
                        }, {})
                    ).map(([ns, resources]) => (
                        <div key={ns} className="space-y-2">
                            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/8 w-fit">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.15em]">{ns}</span>
                                <span className="text-[10px] text-slate-600">·</span>
                                <span className="text-[10px] text-slate-500 font-semibold">{resources.length} workload{resources.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="space-y-2 pl-4 border-l border-white/5">
                                {resources.map((res, idx) => (
                                    <ResourceCard key={idx} res={res} />
                                ))}
                            </div>
                        </div>
                    ))
                ) : (
                    filteredResults.map((res, idx) => (
                        <ResourceCard key={idx} res={res} />
                    ))
                )}
            </div>
        </div>
    )
}

// ── Namespace Filter Dropdown ─────────────────────────────────────────────────

function NamespaceFilterDropdown({ namespaces, value, onChange }: {
    namespaces: string[]
    value: string | null
    onChange: (ns: string | null) => void
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handle(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        if (open) document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [open])

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-[10px] font-bold uppercase tracking-widest min-w-[140px] justify-between ${
                    value
                        ? 'bg-blue-500/10 border-blue-500/25 text-blue-300'
                        : 'bg-white/[0.03] border-white/8 text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                }`}
            >
                <div className="flex items-center gap-1.5 min-w-0">
                    <Folder className="w-3 h-3 shrink-0" />
                    <span className="truncate">{value ?? 'All namespaces'}</span>
                </div>
                <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute left-0 top-full mt-2 w-56 rounded-xl bg-[#0d1525] border border-white/10 shadow-2xl shadow-black/50 z-50 overflow-hidden">
                    <div className="py-1">
                        <button
                            onClick={() => { onChange(null); setOpen(false) }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[11px] font-semibold transition-colors hover:bg-white/5 ${
                                !value ? 'text-blue-400' : 'text-slate-400'
                            }`}
                        >
                            {!value && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                            {value && <div className="w-1.5 h-1.5 shrink-0" />}
                            All namespaces
                        </button>
                        {namespaces.length > 0 && <div className="mx-3 my-1 border-t border-white/5" />}
                        {namespaces.map(ns => (
                            <button
                                key={ns}
                                onClick={() => { onChange(ns); setOpen(false) }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[11px] font-semibold transition-colors hover:bg-white/5 ${
                                    value === ns ? 'text-blue-400' : 'text-slate-400'
                                }`}
                            >
                                {value === ns && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                                {value !== ns && <div className="w-1.5 h-1.5 shrink-0" />}
                                {ns}
                            </button>
                        ))}
                        {namespaces.length === 0 && (
                            <p className="px-3 py-3 text-[11px] text-slate-600 text-center">Run a scan to see namespaces</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Namespace Ignore Picker ───────────────────────────────────────────────────

function NamespaceIgnorePicker({ namespaces, ignored, onToggle, onClear }: {
    namespaces: string[]
    ignored: Set<string>
    onToggle: (ns: string) => void
    onClear: () => void
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handle(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        if (open) document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [open])

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-[10px] font-bold uppercase tracking-widest ${
                    ignored.size > 0
                        ? 'bg-slate-500/10 border-slate-500/25 text-slate-300'
                        : 'bg-white/[0.03] border-white/8 text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                }`}
            >
                <EyeOff className="w-3 h-3" />
                Ignore NS
                {ignored.size > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-slate-500/20 text-[9px] font-black text-slate-300">
                        {ignored.size}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-[#0d1525] border border-white/10 shadow-2xl shadow-black/50 z-50 overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ignore Namespaces</p>
                        {ignored.size > 0 && (
                            <button
                                onClick={onClear}
                                className="text-[9px] text-slate-600 hover:text-slate-300 font-bold uppercase tracking-widest transition-colors"
                            >
                                Clear all
                            </button>
                        )}
                    </div>
                    {namespaces.length === 0 ? (
                        <p className="px-3 py-4 text-[11px] text-slate-600 text-center">No namespaces available</p>
                    ) : (
                        <div className="max-h-52 overflow-y-auto py-1 scrollbar-hide">
                            {namespaces.map(ns => (
                                <button
                                    key={ns}
                                    onClick={() => onToggle(ns)}
                                    className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors hover:bg-white/5 ${
                                        ignored.has(ns) ? 'text-slate-400' : 'text-slate-300'
                                    }`}
                                >
                                    <span className="text-[11px] font-medium truncate">{ns}</span>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                        ignored.has(ns)
                                            ? 'bg-slate-500/20 border-slate-500/40'
                                            : 'border-white/15 bg-transparent'
                                    }`}>
                                        {ignored.has(ns) && <EyeOff className="w-2.5 h-2.5 text-slate-400" />}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── ResourceCard ──────────────────────────────────────────────────────────────

function ResourceCard({ res }: { res: any }) {
    const [expanded, setExpanded] = useState(false)

    const criticalIssues = res.issues.filter((i: any) => i.level === 'error')
    const warningIssues = res.issues.filter((i: any) => i.level === 'warning')
    const criticalCVEs = res.vulnerabilities.filter((v: any) => ['CRITICAL', 'HIGH'].includes(v.severity))
    const otherCVEs = res.vulnerabilities.filter((v: any) => !['CRITICAL', 'HIGH'].includes(v.severity))
    const hasCritical = criticalIssues.length > 0 || criticalCVEs.length > 0

    return (
        <div className={`rounded-xl border overflow-hidden transition-colors ${
            hasCritical ? 'border-red-500/10 bg-red-500/[0.02]' : 'border-white/[0.06] bg-white/[0.015]'
        } hover:bg-white/[0.03]`}>
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full px-5 py-3.5 flex items-center justify-between text-left"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <KindIcon kind={res.kind ?? ''} />
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-white truncate">{res.name}</span>
                            <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-black text-slate-500 uppercase tracking-widest shrink-0">
                                {res.kind}
                            </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{res.namespace}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                    {criticalIssues.length > 0 && <SeverityPill color="red" icon={<AlertCircle className="w-2.5 h-2.5" />} label={`${criticalIssues.length} critical`} />}
                    {warningIssues.length > 0 && <SeverityPill color="amber" icon={<AlertTriangle className="w-2.5 h-2.5" />} label={`${warningIssues.length} warning`} />}
                    {criticalCVEs.length > 0 && <SeverityPill color="orange" icon={<Zap className="w-2.5 h-2.5" />} label={`${criticalCVEs.length} CVE`} />}
                    {otherCVEs.length > 0 && <SeverityPill color="slate" icon={<Zap className="w-2.5 h-2.5" />} label={`${otherCVEs.length} low CVE`} />}
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-600 transition-transform duration-200 ml-1 ${expanded ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {expanded && (
                <div className="border-t border-white/5 px-5 py-4 grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {res.issues.length > 0 && (
                        <div>
                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-3">Configuration Issues</p>
                            <div className="space-y-3">
                                {res.issues.map((issue: any, i: number) => (
                                    <IssueRow key={i} issue={issue} />
                                ))}
                            </div>
                        </div>
                    )}
                    {res.vulnerabilities.length > 0 && (
                        <div>
                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-3">Image Vulnerabilities</p>
                            <div className="space-y-2">
                                {res.vulnerabilities.slice(0, 8).map((v: any, vi: number) => (
                                    <VulnRow key={vi} v={v} />
                                ))}
                                {res.vulnerabilities.length > 8 && (
                                    <p className="text-[10px] text-slate-600 font-semibold text-center pt-1">
                                        + {res.vulnerabilities.length - 8} more
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── Small components ──────────────────────────────────────────────────────────

function IssueRow({ issue }: { issue: any }) {
    const isCritical = issue.level === 'error'
    return (
        <div className="flex gap-3">
            <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shrink-0 h-fit border ${
                isCritical
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
                {isCritical ? 'Critical' : 'Warn'}
            </span>
            <div className="min-w-0">
                <p className="text-[12px] font-semibold text-slate-200 leading-snug">{issue.message}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Fix: {issue.suggestion}</p>
            </div>
        </div>
    )
}

function VulnRow({ v }: { v: any }) {
    const styles: Record<string, string> = {
        CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/20',
        HIGH: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
        MEDIUM: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        LOW: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    }
    return (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/5">
            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border shrink-0 ${styles[v.severity] ?? styles.LOW}`}>
                {v.severity}
            </span>
            <div className="min-w-0 flex-1">
                <span className="text-[11px] font-bold text-slate-300 block">{v.id}</span>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">{v.title}</p>
            </div>
        </div>
    )
}

function SeverityPill({ color, icon, label }: { color: string; icon: React.ReactNode; label: string }) {
    const colors: Record<string, string> = {
        red: 'bg-red-500/10 border-red-500/20 text-red-400',
        amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
        orange: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
        slate: 'bg-slate-500/10 border-slate-500/20 text-slate-400',
    }
    return (
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${colors[color] ?? colors.slate}`}>
            {icon}{label}
        </span>
    )
}

function FilterTab({ label, active, onClick, color }: {
    label: string; active: boolean; onClick: () => void; color: 'default' | 'red' | 'amber'
}) {
    const activeStyles = {
        default: 'bg-white/10 text-white border border-white/15',
        red: 'bg-red-500/15 text-red-400 border border-red-500/20',
        amber: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
    }
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                active ? activeStyles[color] : 'text-slate-500 hover:text-slate-300'
            }`}
        >
            {label}
        </button>
    )
}

function StatCard({ label, value, icon, active, activeColor, activeBg, inactiveColor }: {
    label: string; value: string | number; icon: React.ReactNode
    active: boolean; activeColor: string; activeBg: string; inactiveColor?: string
}) {
    const valueColor = active ? activeColor : (inactiveColor ?? 'text-slate-500')
    const iconBg = active ? activeBg : 'bg-white/5 border-white/10'
    return (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${iconBg} ${active ? activeColor : 'text-slate-500'}`}>
                {icon}
            </div>
            <div className="min-w-0">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-0.5 truncate">{label}</p>
                <p className={`text-base font-black leading-none ${valueColor}`}>{value}</p>
            </div>
        </div>
    )
}

// ── Image Picker Modal ────────────────────────────────────────────────────────

function ImagePickerModal({ workloads, onScan, onSkip, onClose }: {
    workloads: any[]
    onScan: (selectedImages: string[]) => void
    onSkip: () => void
    onClose: () => void
}) {
    const uniqueImages = useMemo(() => getUniqueImages(workloads), [workloads])
    const [selected, setSelected] = useState<Set<string>>(() => new Set(uniqueImages.map(u => u.image)))

    // Sync when uniqueImages changes (e.g., after workload refresh).
    useEffect(() => {
        setSelected(new Set(uniqueImages.map(u => u.image)))
    }, [uniqueImages])

    const allSelected = selected.size === uniqueImages.length
    const toggle = (image: string) =>
        setSelected(prev => { const n = new Set(prev); n.has(image) ? n.delete(image) : n.add(image); return n })

    return (
        <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="w-[520px] max-h-[80vh] flex flex-col rounded-2xl bg-[#0d1525] border border-white/10 shadow-2xl shadow-black/60 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl premium-gradient flex items-center justify-center shadow-lg shrink-0">
                            <Lock className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h3 className="text-[13px] font-black text-white leading-none mb-0.5">Select Images to Scan</h3>
                            <p className="text-[10px] text-slate-500 font-medium">
                                {uniqueImages.length} unique image{uniqueImages.length !== 1 ? 's' : ''} · {selected.size} selected
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Time warning */}
                <div className="px-6 py-2.5 bg-amber-500/[0.04] border-b border-amber-500/10 flex items-center gap-2 shrink-0">
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                    <p className="text-[10px] text-amber-600 font-medium">Each image may take 2–10 min. Scans each unique image once.</p>
                </div>

                {/* Select all / clear */}
                <div className="px-6 py-2.5 border-b border-white/5 flex items-center justify-between shrink-0">
                    <p className="text-[10px] text-slate-600 font-medium">{uniqueImages.length} unique image{uniqueImages.length !== 1 ? 's' : ''} detected</p>
                    <button
                        onClick={() => setSelected(allSelected ? new Set() : new Set(uniqueImages.map(u => u.image)))}
                        className="text-[9px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest transition-colors"
                    >
                        {allSelected ? 'Clear all' : 'Select all'}
                    </button>
                </div>

                {/* Image list */}
                <div className="flex-1 overflow-y-auto scrollbar-hide py-2">
                    {uniqueImages.length === 0 ? (
                        <p className="px-6 py-8 text-[12px] text-slate-600 text-center">No container images found in the current workloads.</p>
                    ) : (
                        uniqueImages.map(({ image, usedBy }) => (
                            <button
                                key={image}
                                onClick={() => toggle(image)}
                                className={`w-full flex items-center gap-3 px-6 py-2.5 text-left transition-colors hover:bg-white/[0.03] ${
                                    selected.has(image) ? '' : 'opacity-50'
                                }`}
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                    selected.has(image)
                                        ? 'bg-blue-500/30 border-blue-500/60'
                                        : 'border-white/15 bg-transparent'
                                }`}>
                                    {selected.has(image) && <div className="w-2 h-2 rounded-sm bg-blue-400" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-semibold text-slate-200 truncate font-mono">{image}</p>
                                    <p className="text-[10px] text-slate-600 mt-0.5">
                                        {usedBy.slice(0, 3).map(w => `${w.namespace}/${w.name}`).join(' · ')}
                                        {usedBy.length > 3 && ` · +${usedBy.length - 3} more`}
                                    </p>
                                </div>
                                <span className="text-[9px] text-slate-600 font-bold shrink-0">
                                    {usedBy.length} workload{usedBy.length !== 1 ? 's' : ''}
                                </span>
                            </button>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between shrink-0">
                    <button
                        onClick={onSkip}
                        className="h-8 px-4 rounded-lg text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:text-slate-300 transition-colors"
                    >
                        Skip CVEs
                    </button>
                    <button
                        onClick={() => onScan(Array.from(selected))}
                        disabled={selected.size === 0}
                        className={`h-8 px-5 rounded-lg premium-gradient text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                            selected.size > 0 ? 'hover:-translate-y-0.5 shadow-lg hover:shadow-blue-500/20' : 'opacity-40 cursor-not-allowed'
                        }`}
                    >
                        Scan {selected.size} image{selected.size !== 1 ? 's' : ''}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Custom Scan Modal ─────────────────────────────────────────────────────────

function CustomScanModal({ namespaces, trivyAvailable, onRun, onClose }: {
    namespaces: string[]
    trivyAvailable: boolean | null
    onRun: (opts: CustomScanOptions) => void
    onClose: () => void
}) {
    const trivyInstalled = trivyAvailable !== false
    const [selectedNs, setSelectedNs] = useState<Set<string>>(new Set(namespaces))
    const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set(WORKLOAD_KINDS))
    const [runTrivy, setRunTrivy] = useState(trivyInstalled)
    const [runKubesec, setRunKubesec] = useState(true)

    const allNsSelected = selectedNs.size === namespaces.length
    const allKindsSelected = selectedKinds.size === WORKLOAD_KINDS.length

    const toggleNs = (ns: string) =>
        setSelectedNs(prev => { const n = new Set(prev); n.has(ns) ? n.delete(ns) : n.add(ns); return n })
    const toggleKind = (k: string) =>
        setSelectedKinds(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

    const handleRun = () => {
        if (selectedNs.size === 0 || selectedKinds.size === 0) return
        if (!runTrivy && !runKubesec) return
        onRun({
            namespaces: allNsSelected ? [] : Array.from(selectedNs),
            kinds: allKindsSelected ? [] : Array.from(selectedKinds),
            runTrivy,
            runKubesec,
        })
    }

    const canRun = selectedNs.size > 0 && selectedKinds.size > 0 && (runTrivy || runKubesec)

    return (
        <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="w-[480px] rounded-2xl bg-[#0d1525] border border-white/10 shadow-2xl shadow-black/60 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl premium-gradient flex items-center justify-center shadow-lg shrink-0">
                            <SlidersHorizontal className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h3 className="text-[13px] font-black text-white leading-none mb-0.5">Custom Scan</h3>
                            <p className="text-[10px] text-slate-500 font-medium">Configure scope and engines</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-6">
                    {/* Namespaces */}
                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em]">Namespaces</p>
                            <button
                                onClick={() => setSelectedNs(allNsSelected ? new Set() : new Set(namespaces))}
                                className="text-[9px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest transition-colors"
                            >
                                {allNsSelected ? 'Clear all' : 'Select all'}
                            </button>
                        </div>
                        {namespaces.length === 0 ? (
                            <p className="text-[11px] text-slate-600 italic">No namespaces loaded — run a context first.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {namespaces.map(ns => (
                                    <button
                                        key={ns}
                                        onClick={() => toggleNs(ns)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
                                            selectedNs.has(ns)
                                                ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                                                : 'bg-white/[0.03] border-white/8 text-slate-500 hover:text-slate-300'
                                        }`}
                                    >
                                        {selectedNs.has(ns) && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                                        {ns}
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Resource kinds */}
                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em]">Resource Kinds</p>
                            <button
                                onClick={() => setSelectedKinds(allKindsSelected ? new Set() : new Set(WORKLOAD_KINDS))}
                                className="text-[9px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest transition-colors"
                            >
                                {allKindsSelected ? 'Clear all' : 'Select all'}
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {WORKLOAD_KINDS.map(k => (
                                <button
                                    key={k}
                                    onClick={() => toggleKind(k)}
                                    className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold transition-all ${
                                        selectedKinds.has(k)
                                            ? 'bg-violet-500/15 border-violet-500/30 text-violet-300'
                                            : 'bg-white/[0.03] border-white/8 text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    {k}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Scan engines */}
                    <section>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-3">Scan Engines</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setRunKubesec(v => !v)}
                                className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                                    runKubesec
                                        ? 'bg-emerald-500/10 border-emerald-500/25'
                                        : 'bg-white/[0.02] border-white/8 opacity-50'
                                }`}
                            >
                                <ShieldCheck className={`w-4 h-4 shrink-0 ${runKubesec ? 'text-emerald-400' : 'text-slate-500'}`} />
                                <div className="min-w-0">
                                    <p className={`text-[11px] font-black leading-none mb-0.5 ${runKubesec ? 'text-emerald-300' : 'text-slate-500'}`}>Config</p>
                                    <p className="text-[9px] text-slate-600 font-medium">kubesec</p>
                                </div>
                                <div className={`ml-auto w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${runKubesec ? 'bg-emerald-500/30 border-emerald-500/50' : 'border-white/15'}`}>
                                    {runKubesec && <div className="w-2 h-2 rounded-sm bg-emerald-400" />}
                                </div>
                            </button>
                            <button
                                onClick={() => trivyInstalled && setRunTrivy(v => !v)}
                                disabled={!trivyInstalled}
                                title={!trivyInstalled ? 'trivy not installed — run: brew install trivy' : undefined}
                                className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                                    !trivyInstalled
                                        ? 'bg-white/[0.02] border-white/8 opacity-40 cursor-not-allowed'
                                        : runTrivy
                                            ? 'bg-blue-500/10 border-blue-500/25'
                                            : 'bg-white/[0.02] border-white/8 opacity-50'
                                }`}
                            >
                                <Lock className={`w-4 h-4 shrink-0 ${runTrivy && trivyInstalled ? 'text-blue-400' : 'text-slate-500'}`} />
                                <div className="min-w-0">
                                    <p className={`text-[11px] font-black leading-none mb-0.5 ${runTrivy && trivyInstalled ? 'text-blue-300' : 'text-slate-500'}`}>Image CVEs</p>
                                    <p className="text-[9px] text-slate-600 font-medium">
                                        trivy{!trivyInstalled && <span className="ml-1 text-amber-600">· not installed</span>}
                                    </p>
                                </div>
                                <div className={`ml-auto w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${runTrivy && trivyInstalled ? 'bg-blue-500/30 border-blue-500/50' : 'border-white/15'}`}>
                                    {runTrivy && trivyInstalled && <div className="w-2 h-2 rounded-sm bg-blue-400" />}
                                </div>
                            </button>
                        </div>
                    </section>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
                    <p className="text-[10px] text-slate-600 font-medium">
                        {selectedNs.size} namespace{selectedNs.size !== 1 ? 's' : ''} · {selectedKinds.size} kind{selectedKinds.size !== 1 ? 's' : ''}
                        {runTrivy && runKubesec ? ' · config + CVEs' : runTrivy ? ' · CVEs only' : runKubesec ? ' · config only' : ''}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="h-8 px-4 rounded-lg bg-white/5 border border-white/8 text-slate-400 text-[10px] font-bold uppercase tracking-widest hover:bg-white/8 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleRun}
                            disabled={!canRun}
                            className={`h-8 px-5 rounded-lg premium-gradient text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                                canRun ? 'hover:-translate-y-0.5 shadow-lg hover:shadow-blue-500/20' : 'opacity-40 cursor-not-allowed'
                            }`}
                        >
                            Run Scan
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

function EmptyState({ filtered, totalWorkloads, hasAnyIssues }: {
    filtered: boolean; totalWorkloads: number; hasAnyIssues: boolean
}) {
    if (filtered && hasAnyIssues) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center mb-5">
                    <Search className="w-7 h-7 text-slate-600" />
                </div>
                <h3 className="text-base font-black text-white mb-2">No matches</h3>
                <p className="text-sm text-slate-500">No issues match the current severity filter.</p>
            </div>
        )
    }
    return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center mb-6 relative">
                <div className="absolute inset-0 bg-emerald-500/10 blur-2xl rounded-full" />
                <ShieldCheck className="w-10 h-10 text-emerald-500 relative z-10" />
            </div>
            <h3 className="text-xl font-black text-white mb-2 tracking-tight">All Clear</h3>
            <p className="text-sm text-slate-500 max-w-xs">
                No configuration issues detected across {totalWorkloads} workload{totalWorkloads !== 1 ? 's' : ''}.
            </p>
        </div>
    )
}
