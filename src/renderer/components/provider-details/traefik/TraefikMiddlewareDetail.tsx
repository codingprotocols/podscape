import React, { useState } from 'react'
import * as yaml from 'js-yaml'

interface Props { item: any }

type Tab = 'config' | 'yaml'

// Map spec key → human-readable label
const TYPE_LABELS: Record<string, string> = {
    basicAuth:        'Basic Auth',
    digestAuth:       'Digest Auth',
    forwardAuth:      'Forward Auth',
    headers:          'Headers',
    rateLimit:        'Rate Limit',
    redirectRegex:    'Redirect Regex',
    redirectScheme:   'Redirect Scheme',
    stripPrefix:      'Strip Prefix',
    stripPrefixRegex: 'Strip Prefix Regex',
    addPrefix:        'Add Prefix',
    compress:         'Compress',
    chain:            'Chain',
    circuitBreaker:   'Circuit Breaker',
    buffering:        'Buffering',
    errorPages:       'Error Pages',
    ipAllowList:      'IP Allow List',
    ipWhiteList:      'IP Whitelist',
    passTLSClientCert:'Pass TLS Client Cert',
    retry:            'Retry',
    inFlightReq:      'In-Flight Req',
    contentType:      'Content Type',
}

function badgeClass(typeKey: string): string {
    switch (typeKey) {
        case 'basicAuth':
        case 'digestAuth':
            return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
        case 'forwardAuth':
            return 'bg-violet-500/10 text-violet-400 border-violet-500/20'
        case 'headers':
            return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        case 'rateLimit':
        case 'inFlightReq':
        case 'circuitBreaker':
            return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
        case 'redirectRegex':
        case 'redirectScheme':
            return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
        case 'stripPrefix':
        case 'stripPrefixRegex':
        case 'addPrefix':
            return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        case 'chain':
            return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
        case 'compress':
        case 'buffering':
        case 'contentType':
            return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
        case 'retry':
            return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
        case 'errorPages':
            return 'bg-red-500/10 text-red-400 border-red-500/20'
        case 'ipAllowList':
        case 'ipWhiteList':
            return 'bg-rose-500/10 text-rose-400 border-rose-500/20'
        default:
            return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-start justify-between gap-4 py-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">{label}</span>
            <span className={`text-[11px] font-bold text-slate-300 text-right ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
        </div>
    )
}

function ConfigSection({ typeKey, cfg }: { typeKey: string; cfg: any }) {
    if (!cfg) return null

    switch (typeKey) {
        case 'basicAuth':
            return (
                <div className="space-y-1.5">
                    {cfg.realm && <InfoRow label="Realm" value={cfg.realm} />}
                    <InfoRow label="Remove Header" value={cfg.removeHeader ? 'true' : 'false'} />
                    {cfg.secret && <InfoRow label="Secret Ref" value={cfg.secret} mono />}
                    {cfg.headerField && <InfoRow label="Header Field" value={cfg.headerField} mono />}
                </div>
            )

        case 'digestAuth':
            return (
                <div className="space-y-1.5">
                    {cfg.realm && <InfoRow label="Realm" value={cfg.realm} />}
                    <InfoRow label="Remove Header" value={cfg.removeHeader ? 'true' : 'false'} />
                    {cfg.secret && <InfoRow label="Secret Ref" value={cfg.secret} mono />}
                </div>
            )

        case 'forwardAuth': {
            const authHeaders: string[] = cfg.authResponseHeaders ?? []
            return (
                <div className="space-y-1.5">
                    {cfg.address && <InfoRow label="Address" value={cfg.address} mono />}
                    <InfoRow label="Trust Forward Header" value={cfg.trustForwardHeader ? 'true' : 'false'} />
                    {authHeaders.length > 0 && (
                        <div className="pt-1">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Auth Response Headers</span>
                            <div className="flex flex-wrap gap-1">
                                {authHeaders.map((h: string) => (
                                    <span key={h} className="text-[10px] font-mono bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded">
                                        {h}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )
        }

        case 'headers': {
            const reqHeaders = cfg.customRequestHeaders ?? {}
            const resHeaders = cfg.customResponseHeaders ?? {}
            const reqEntries = Object.entries(reqHeaders)
            const resEntries = Object.entries(resHeaders)
            return (
                <div className="space-y-3">
                    {reqEntries.length > 0 && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Custom Request Headers</span>
                            <div className="space-y-1">
                                {reqEntries.map(([k, v]) => (
                                    <div key={k} className="flex items-center gap-2 text-[11px]">
                                        <span className="font-mono text-blue-400 shrink-0">{k}</span>
                                        <span className="text-slate-600">→</span>
                                        <span className="font-mono text-slate-300 truncate">{String(v)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {resEntries.length > 0 && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Custom Response Headers</span>
                            <div className="space-y-1">
                                {resEntries.map(([k, v]) => (
                                    <div key={k} className="flex items-center gap-2 text-[11px]">
                                        <span className="font-mono text-blue-400 shrink-0">{k}</span>
                                        <span className="text-slate-600">→</span>
                                        <span className="font-mono text-slate-300 truncate">{String(v)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {reqEntries.length === 0 && resEntries.length === 0 && (
                        <p className="text-xs text-slate-500 italic">No header overrides configured</p>
                    )}
                </div>
            )
        }

        case 'rateLimit':
            return (
                <div className="space-y-1.5">
                    {cfg.average !== undefined && <InfoRow label="Average (req/s)" value={String(cfg.average)} />}
                    {cfg.burst !== undefined && <InfoRow label="Burst" value={String(cfg.burst)} />}
                    {cfg.period && <InfoRow label="Period" value={cfg.period} />}
                </div>
            )

        case 'redirectRegex':
            return (
                <div className="space-y-2">
                    {cfg.regex && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">Regex</span>
                            <pre className="bg-slate-900 text-green-400 text-[11px] font-mono rounded-lg px-3 py-2 overflow-x-auto">{cfg.regex}</pre>
                        </div>
                    )}
                    {cfg.replacement && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">Replacement</span>
                            <pre className="bg-slate-900 text-cyan-400 text-[11px] font-mono rounded-lg px-3 py-2 overflow-x-auto">{cfg.replacement}</pre>
                        </div>
                    )}
                    <InfoRow label="Permanent" value={cfg.permanent ? 'true (301)' : 'false (302)'} />
                </div>
            )

        case 'redirectScheme':
            return (
                <div className="space-y-1.5">
                    {cfg.scheme && <InfoRow label="Scheme" value={cfg.scheme} mono />}
                    {cfg.port && <InfoRow label="Port" value={String(cfg.port)} />}
                    <InfoRow label="Permanent" value={cfg.permanent ? 'true (301)' : 'false (302)'} />
                </div>
            )

        case 'stripPrefix': {
            const prefixes: string[] = cfg.prefixes ?? []
            return (
                <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Prefixes</span>
                    <div className="flex flex-wrap gap-1.5">
                        {prefixes.length === 0 ? (
                            <span className="text-slate-500 text-xs italic">None</span>
                        ) : prefixes.map((p: string) => (
                            <span key={p} className="text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded">
                                {p}
                            </span>
                        ))}
                    </div>
                </div>
            )
        }

        case 'stripPrefixRegex': {
            const regexes: string[] = cfg.regex ?? []
            return (
                <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Regex Patterns</span>
                    <div className="space-y-1">
                        {regexes.map((r: string, i: number) => (
                            <pre key={i} className="bg-slate-900 text-green-400 text-[11px] font-mono rounded px-3 py-1.5 overflow-x-auto">{r}</pre>
                        ))}
                    </div>
                </div>
            )
        }

        case 'addPrefix':
            return <InfoRow label="Prefix" value={cfg.prefix ?? '—'} mono />

        case 'chain': {
            const mws: any[] = cfg.middlewares ?? []
            return (
                <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Chained Middlewares</span>
                    <div className="flex flex-wrap gap-1.5">
                        {mws.map((mw: any, i: number) => (
                            <span key={i} className="text-[10px] font-mono bg-slate-500/10 text-slate-300 border border-slate-500/20 px-2 py-0.5 rounded">
                                {mw?.name ?? String(mw)}
                            </span>
                        ))}
                    </div>
                </div>
            )
        }

        case 'circuitBreaker':
            return (
                <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Expression</span>
                    <pre className="bg-slate-900 text-orange-400 text-[11px] font-mono rounded-lg px-4 py-3 overflow-x-auto whitespace-pre-wrap break-all">
                        {cfg.expression ?? '—'}
                    </pre>
                </div>
            )

        case 'retry':
            return (
                <div className="space-y-1.5">
                    {cfg.attempts !== undefined && <InfoRow label="Attempts" value={String(cfg.attempts)} />}
                    {cfg.initialInterval && <InfoRow label="Initial Interval" value={cfg.initialInterval} />}
                </div>
            )

        default: {
            // Unknown type: render raw JSON
            return (
                <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Raw Config</span>
                    <pre className="bg-slate-900 text-slate-300 text-[11px] font-mono rounded-lg px-4 py-3 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(cfg, null, 2)}
                    </pre>
                </div>
            )
        }
    }
}

export default function TraefikMiddlewareDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('config')

    const name = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec = item?.spec ?? {}

    // Detect middleware type
    const knownKeys = Object.keys(TYPE_LABELS)
    const detectedKey = Object.keys(spec).find(k => knownKeys.includes(k)) ?? Object.keys(spec)[0] ?? ''
    const typeLabel = TYPE_LABELS[detectedKey] ?? (detectedKey || 'Unknown')
    const cfg = spec[detectedKey]

    const rawYaml = yaml.dump(item, { indent: 2 })
    const badge = badgeClass(detectedKey)

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · MIDDLEWARE
                        </p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-black border px-2.5 py-1 rounded-lg uppercase tracking-tight ${badge}`}>
                        {typeLabel}
                    </span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 shrink-0">
                {(['config', 'yaml'] as Tab[]).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${
                            tab === t
                                ? 'text-blue-400 border-b-2 border-blue-500'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                        }`}
                    >
                        {t === 'config' ? 'Config' : 'YAML'}
                    </button>
                ))}
            </div>

            {/* Config tab */}
            {tab === 'config' && (
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {detectedKey ? (
                        <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4">
                            <ConfigSection typeKey={detectedKey} cfg={cfg} />
                        </div>
                    ) : (
                        <p className="text-xs text-slate-500 text-center py-8 italic">No configuration found in spec</p>
                    )}
                </div>
            )}

            {/* YAML tab */}
            {tab === 'yaml' && (
                <div className="flex-1 overflow-auto bg-slate-950">
                    <pre className="text-xs font-mono p-4 text-slate-300 leading-relaxed overflow-auto whitespace-pre">
                        {rawYaml}
                    </pre>
                </div>
            )}
        </div>
    )
}
