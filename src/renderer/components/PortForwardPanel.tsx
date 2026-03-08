import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store'
import type { PortForwardEntry, KubePod, KubeService } from '../types'

// ─── Port detection helpers ───────────────────────────────────────────────────

interface PortOption {
  port: number
  label: string   // e.g. "8080 · http · TCP"
}

function extractPodPorts(pod: KubePod): PortOption[] {
  const seen = new Set<number>()
  const opts: PortOption[] = []
  for (const container of pod.spec.containers) {
    for (const p of container.ports ?? []) {
      if (seen.has(p.containerPort)) continue
      seen.add(p.containerPort)
      const parts: string[] = [String(p.containerPort)]
      if (p.name) parts.push(p.name)
      if (p.protocol && p.protocol !== 'TCP') parts.push(p.protocol)
      opts.push({ port: p.containerPort, label: parts.join(' · ') })
    }
  }
  return opts
}

function extractServicePorts(svc: KubeService): PortOption[] {
  return (svc.spec.ports ?? []).map(p => {
    const parts: string[] = [String(p.port)]
    if (p.name) parts.push(p.name)
    if (p.protocol && p.protocol !== 'TCP') parts.push(p.protocol)
    return { port: p.port, label: parts.join(' · ') }
  })
}

function StatusBadge({ status, error }: { status: PortForwardEntry['status']; error?: string }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        Active
      </span>
    )
  }
  if (status === 'starting') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-yellow-600 dark:text-yellow-400">
        <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
        Starting
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400" title={error}>
        <span className="w-2 h-2 rounded-full bg-red-500" />
        Error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
      <span className="w-2 h-2 rounded-full bg-slate-400" />
      Stopped
    </span>
  )
}

const SELECT_CLS = "w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono appearance-none"

const INPUT_CLS = "w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"

function SelectWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <div className="absolute right-3 top-2.5 pointer-events-none text-slate-400">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2.5 4l2.5 2.5L7.5 4H2.5z" /></svg>
      </div>
    </div>
  )
}

function NewForwardDialog({
  onClose,
  onStart
}: {
  onClose: () => void
  onStart: (entry: Omit<PortForwardEntry, 'id' | 'status'>) => void
}) {
  const { namespaces, selectedNamespace, selectedContext } = useAppStore()
  const [type, setType] = useState<'pod' | 'service'>('pod')
  const [ns, setNs] = useState(selectedNamespace === '_all' ? (namespaces[0]?.metadata.name ?? '') : (selectedNamespace ?? ''))
  const [name, setName] = useState('')
  const [localPort, setLocalPort] = useState('')
  const [remotePort, setRemotePort] = useState('')

  // Full port map: resource name → detected ports
  const [portMap, setPortMap] = useState<Record<string, PortOption[]>>({})
  const [resourceNames, setResourceNames] = useState<string[]>([])
  const [loadingNames, setLoadingNames] = useState(false)

  // Ports for the currently selected resource
  const detectedPorts: PortOption[] = name ? (portMap[name] ?? []) : []

  // Fetch resources (with ports) when type or namespace changes
  useEffect(() => {
    if (!selectedContext || !ns) { setResourceNames([]); setPortMap({}); return }
    setLoadingNames(true)
    setName('')
    setRemotePort('')
    setLocalPort('')
    const req = type === 'pod'
      ? window.kubectl.getPods(selectedContext, ns)
      : window.kubectl.getServices(selectedContext, ns)
    req.then(items => {
      const map: Record<string, PortOption[]> = {}
      for (const item of items) {
        map[item.metadata.name] = type === 'pod'
          ? extractPodPorts(item as KubePod)
          : extractServicePorts(item as KubeService)
      }
      setPortMap(map)
      setResourceNames(Object.keys(map).sort())
    })
    .catch(() => { setPortMap({}); setResourceNames([]) })
    .finally(() => setLoadingNames(false))
  }, [type, ns, selectedContext])

  // Auto-fill ports when a resource is selected
  useEffect(() => {
    if (!name) { setDetectedPort(''); return }
    const ports = portMap[name] ?? []
    if (ports.length >= 1) {
      setRemotePort(String(ports[0].port))
      setLocalPort(String(ports[0].port))
    } else {
      setRemotePort('')
      setLocalPort('')
    }
  }, [name])  // eslint-disable-line react-hooks/exhaustive-deps

  // When remote port dropdown changes, sync local port
  const handleRemotePortSelect = (val: string) => {
    setRemotePort(val)
    setLocalPort(val)
  }

  const [, setDetectedPort] = useState('')   // dummy setter just to satisfy exhaustive-deps lint

  const canStart = !!name && !!ns && !!remotePort && !!localPort

  const handleStart = () => {
    if (!canStart) return
    onStart({ type, namespace: ns, name, localPort: parseInt(localPort), remotePort: parseInt(remotePort) })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">New Port Forward</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Type toggle */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['pod', 'service'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border-2 transition-all
                    ${type === t
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                >
                  {t === 'pod' ? 'Pod' : 'Service'}
                </button>
              ))}
            </div>
          </div>

          {/* Namespace */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Namespace</label>
            <SelectWrapper>
              <select value={ns} onChange={e => setNs(e.target.value)} className={`${SELECT_CLS} appearance-none`}>
                {namespaces.map(n => (
                  <option key={n.metadata.name} value={n.metadata.name}>{n.metadata.name}</option>
                ))}
              </select>
            </SelectWrapper>
          </div>

          {/* Resource name */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {type === 'pod' ? 'Pod' : 'Service'}
              </label>
              {loadingNames && (
                <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                  <span className="w-2.5 h-2.5 border border-slate-300 dark:border-slate-600 border-t-blue-500 rounded-full animate-spin" />
                  Loading…
                </span>
              )}
            </div>
            <SelectWrapper>
              <select
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={loadingNames || resourceNames.length === 0}
                className={`${SELECT_CLS} appearance-none disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="">
                  {loadingNames ? 'Loading…' : resourceNames.length === 0 ? `No ${type}s in namespace` : `Select ${type}…`}
                </option>
                {resourceNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </SelectWrapper>
          </div>

          {/* Port row — only shown once a resource is selected */}
          {name && (
            <div className="grid grid-cols-2 gap-3">
              {/* Remote port */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Remote Port</label>
                  {detectedPorts.length > 0 && (
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded-full">auto</span>
                  )}
                </div>
                {detectedPorts.length > 1 ? (
                  // Multiple ports → dropdown
                  <SelectWrapper>
                    <select
                      value={remotePort}
                      onChange={e => handleRemotePortSelect(e.target.value)}
                      className={`${SELECT_CLS} appearance-none`}
                    >
                      {detectedPorts.map(p => (
                        <option key={p.port} value={String(p.port)}>{p.label}</option>
                      ))}
                    </select>
                  </SelectWrapper>
                ) : (
                  // 0 or 1 port → text input (auto-filled if 1 found)
                  <input
                    type="number"
                    value={remotePort}
                    onChange={e => { setRemotePort(e.target.value); setLocalPort(e.target.value) }}
                    placeholder="8080"
                    className={INPUT_CLS}
                  />
                )}
                {detectedPorts.length === 0 && name && (
                  <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">No ports detected — enter manually</p>
                )}
              </div>

              {/* Local port — always editable */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Local Port</label>
                <input
                  type="number"
                  value={localPort}
                  onChange={e => setLocalPort(e.target.value)}
                  placeholder="8080"
                  className={INPUT_CLS}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="flex-1 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Forward
          </button>
        </div>
      </div>
    </div>
  )
}

// Opens a URL in the system default browser via Electron shell
function openInBrowser(url: string) {
  ;(window.electron as unknown as { shell: { openExternal: (u: string) => void } })
    .shell.openExternal(url)
}

function UrlCell({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={() => openInBrowser(url)}
        title={`Open ${url} in browser`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono
                   text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20
                   hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300
                   border border-blue-200 dark:border-blue-500/30 transition-all group"
      >
        {url}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             className="opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
        </svg>
      </button>
      <button
        onClick={handleCopy}
        title="Copy URL"
        className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
      >
        {copied ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
        )}
      </button>
    </div>
  )
}

type SortKey = 'name' | 'namespace' | 'localPort'

export default function PortForwardPanel() {
  const { portForwards, stopPortForward, startPortForward, selectedContext } = useAppStore()
  const [showDialog, setShowDialog] = useState(false)
  const [filter, setFilter] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('name')

  const handleStart = (entry: Omit<PortForwardEntry, 'id' | 'status'>) => {
    if (!selectedContext) return
    const id = crypto.randomUUID()
    startPortForward({ ...entry, id, status: 'starting' })
  }

  const filtered = filter.trim()
    ? portForwards.filter(pf =>
        pf.name.toLowerCase().includes(filter.toLowerCase()) ||
        pf.namespace.toLowerCase().includes(filter.toLowerCase()) ||
        String(pf.localPort).includes(filter)
      )
    : portForwards

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name)
    if (sortBy === 'namespace') return a.namespace.localeCompare(b.namespace)
    return a.localPort - b.localPort
  })

  return (
    <div className="flex flex-col flex-1 min-w-0 bg-white dark:bg-slate-950 h-full transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Port Forwards</h2>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
            {portForwards.length} active
          </p>
        </div>
        <div className="flex items-center gap-3">
          {portForwards.length > 0 && (
            <>
              <input
                type="text"
                placeholder="Filter..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="w-36 text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortKey)}
                className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                <option value="name">Sort by name</option>
                <option value="namespace">Sort by namespace</option>
                <option value="localPort">Sort by local port</option>
              </select>
            </>
          )}
          <button
            onClick={() => setShowDialog(true)}
            disabled={!selectedContext}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
            New Forward
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {portForwards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest">No active port forwards</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-600">Click "New Forward" to start one</p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md z-10">
              <tr className="border-b border-slate-100 dark:border-slate-800">
                {['Resource', 'Namespace', 'Ports', 'Local URL', 'Status', ''].map(col => (
                  <th key={col} className="text-left px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
              {sorted.map(pf => {
                const url = `http://localhost:${pf.localPort}`
                const isActive = pf.status === 'active'
                return (
                  <tr key={pf.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-3 font-mono text-xs font-semibold">
                      <span className="text-slate-400 dark:text-slate-500">{pf.type}/</span>
                      <span className="text-slate-800 dark:text-slate-100">{pf.name}</span>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono">{pf.namespace}</td>
                    <td className="px-6 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 font-mono">
                      {pf.localPort}<span className="text-slate-400 mx-0.5">→</span>{pf.remotePort}
                    </td>
                    <td className="px-6 py-3">
                      {isActive ? (
                        <UrlCell url={url} />
                      ) : (
                        <span className="text-[11px] font-mono text-slate-300 dark:text-slate-600">{url}</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={pf.status} error={pf.error} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => stopPortForward(pf.id)}
                        title="Stop forward"
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showDialog && (
        <NewForwardDialog onClose={() => setShowDialog(false)} onStart={handleStart} />
      )}
    </div>
  )
}
