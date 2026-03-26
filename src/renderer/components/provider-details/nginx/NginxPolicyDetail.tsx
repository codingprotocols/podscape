import React, { useState } from 'react'
import * as yaml from 'js-yaml'

interface Props { item: any }

type Tab = 'config' | 'yaml'

type PolicyType =
    | 'accessControl'
    | 'rateLimit'
    | 'jwt'
    | 'basicAuth'
    | 'ingressMTLS'
    | 'egressMTLS'
    | 'oidc'

const TYPE_LABELS: Record<PolicyType, string> = {
    accessControl: 'Access Control',
    rateLimit:     'Rate Limit',
    jwt:           'JWT',
    basicAuth:     'Basic Auth',
    ingressMTLS:   'Ingress mTLS',
    egressMTLS:    'Egress mTLS',
    oidc:          'OIDC',
}

function typeBadgeClass(type: PolicyType): string {
    switch (type) {
        case 'accessControl': return 'bg-red-500/10 text-red-400 border-red-500/20'
        case 'rateLimit':     return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
        case 'jwt':           return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
        case 'basicAuth':     return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
        case 'ingressMTLS':   return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        case 'egressMTLS':    return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
        case 'oidc':          return 'bg-violet-500/10 text-violet-400 border-violet-500/20'
        default:              return 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    }
}

function InfoRow({ label, value, mono, hidden }: { label: string; value?: string | number | boolean; mono?: boolean; hidden?: boolean }) {
    if (value === undefined || value === null || value === '') return null
    const display = hidden ? '●●●●●●' : String(value)
    return (
        <div className="flex items-start justify-between gap-4 py-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">{label}</span>
            <span className={`text-[11px] font-bold text-slate-300 text-right break-all ${mono ? 'font-mono' : ''}`}>{display}</span>
        </div>
    )
}

function SectionCard({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl p-4">
            {children}
        </div>
    )
}

function ChipList({ items, color }: { items: string[]; color: 'green' | 'red' }) {
    const cls = color === 'green'
        ? 'bg-green-500/10 text-green-400 border-green-500/20'
        : 'bg-red-500/10 text-red-400 border-red-500/20'
    if (items.length === 0) return <span className="text-xs text-slate-500 italic">None</span>
    return (
        <div className="flex flex-wrap gap-1">
            {items.map((ip, i) => (
                <span key={i} className={`text-[10px] font-mono border px-2 py-0.5 rounded ${cls}`}>{ip}</span>
            ))}
        </div>
    )
}

function AccessControlConfig({ cfg }: { cfg: any }) {
    return (
        <div className="grid grid-cols-2 gap-4">
            <div>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Allow</span>
                <ChipList items={cfg.allow ?? []} color="green" />
            </div>
            <div>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-2">Deny</span>
                <ChipList items={cfg.deny ?? []} color="red" />
            </div>
        </div>
    )
}

function RateLimitConfig({ cfg }: { cfg: any }) {
    return (
        <div className="space-y-1.5">
            <InfoRow label="Rate"        value={cfg.rate}        />
            {cfg.key && (
                <div className="py-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">Key</span>
                    <pre className="bg-slate-900 text-green-400 text-[11px] font-mono rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">
                        {cfg.key}
                    </pre>
                </div>
            )}
            <InfoRow label="Burst"       value={cfg.burst}       />
            <InfoRow label="Delay"       value={cfg.delay}       />
            <InfoRow label="Reject Code" value={cfg.rejectCode}  />
            <InfoRow label="Zone Size"   value={cfg.zoneSize}    />
            <InfoRow label="Log Level"   value={cfg.logLevel}    />
            {cfg.noDelay !== undefined && (
                <div className="flex items-start justify-between gap-4 py-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">No Delay</span>
                    <span className={`text-[9px] font-black border px-2 py-0.5 rounded uppercase tracking-wider ${
                        cfg.noDelay
                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    }`}>
                        {cfg.noDelay ? 'true' : 'false'}
                    </span>
                </div>
            )}
            {cfg.dryRun !== undefined && (
                <div className="flex items-start justify-between gap-4 py-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">Dry Run</span>
                    <span className={`text-[9px] font-black border px-2 py-0.5 rounded uppercase tracking-wider ${
                        cfg.dryRun
                            ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    }`}>
                        {cfg.dryRun ? 'true' : 'false'}
                    </span>
                </div>
            )}
        </div>
    )
}

function JwtConfig({ cfg }: { cfg: any }) {
    const tokenLoc = cfg.token
        ? (() => {
            if (cfg.token.startsWith('$cookie_')) return `cookie: ${cfg.token.replace('$cookie_', '')}`
            if (cfg.token.startsWith('$arg_'))    return `query: ${cfg.token.replace('$arg_', '')}`
            if (cfg.token.startsWith('$http_'))   return `header: ${cfg.token.replace('$http_', '')}`
            return cfg.token
        })()
        : 'header (default)'
    return (
        <div className="space-y-1.5">
            <InfoRow label="Realm"    value={cfg.realm}    />
            <InfoRow label="Secret"   value={cfg.secret}   mono />
            <InfoRow label="Token At" value={tokenLoc}     mono />
        </div>
    )
}

function BasicAuthConfig({ cfg }: { cfg: any }) {
    return (
        <div className="space-y-1.5">
            <InfoRow label="Secret" value={cfg.secret} mono />
            <InfoRow label="Realm"  value={cfg.realm}  />
        </div>
    )
}

function IngressMTLSConfig({ cfg }: { cfg: any }) {
    return (
        <div className="space-y-1.5">
            <InfoRow label="Client Cert Secret" value={cfg.clientCertSecret} mono />
            <InfoRow label="Verify Depth"       value={cfg.verifyDepth}      />
        </div>
    )
}

function EgressMTLSConfig({ cfg }: { cfg: any }) {
    return (
        <div className="space-y-1.5">
            <InfoRow label="TLS Secret"          value={cfg.tlsSecret}          mono />
            <InfoRow label="Trusted Cert Secret" value={cfg.trustedCertSecret}  mono />
            <InfoRow label="Verify Depth"        value={cfg.verifyDepth}        />
            <InfoRow label="Protocols"           value={cfg.protocols}          mono />
            <InfoRow label="Ciphers"             value={cfg.ciphers}            mono />
            {cfg.verifyServer !== undefined && (
                <div className="flex items-start justify-between gap-4 py-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0">Verify Server</span>
                    <span className={`text-[9px] font-black border px-2 py-0.5 rounded uppercase tracking-wider ${
                        cfg.verifyServer
                            ? 'bg-green-500/10 text-green-400 border-green-500/20'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    }`}>
                        {cfg.verifyServer ? 'true' : 'false'}
                    </span>
                </div>
            )}
        </div>
    )
}

function OidcConfig({ cfg }: { cfg: any }) {
    return (
        <div className="space-y-1.5">
            <InfoRow label="Auth Endpoint"  value={cfg.authEndpoint}  mono />
            <InfoRow label="Token Endpoint" value={cfg.tokenEndpoint} mono />
            <InfoRow label="JWKS URI"       value={cfg.jwksURI}       mono />
            <InfoRow label="Client ID"      value={cfg.clientID}      />
            <InfoRow label="Client Secret"  value={cfg.clientSecret}  hidden />
            <InfoRow label="Scope"          value={cfg.scope}         />
            <InfoRow label="Redirect URI"   value={cfg.redirectURI}   mono />
        </div>
    )
}

function ConfigSection({ type, cfg }: { type: PolicyType; cfg: any }) {
    if (!cfg) return null
    switch (type) {
        case 'accessControl': return <AccessControlConfig cfg={cfg} />
        case 'rateLimit':     return <RateLimitConfig cfg={cfg} />
        case 'jwt':           return <JwtConfig cfg={cfg} />
        case 'basicAuth':     return <BasicAuthConfig cfg={cfg} />
        case 'ingressMTLS':   return <IngressMTLSConfig cfg={cfg} />
        case 'egressMTLS':    return <EgressMTLSConfig cfg={cfg} />
        case 'oidc':          return <OidcConfig cfg={cfg} />
        default:              return (
            <pre className="bg-slate-900 text-slate-300 text-[11px] font-mono rounded-lg px-4 py-3 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(cfg, null, 2)}
            </pre>
        )
    }
}

const KNOWN_TYPES: PolicyType[] = ['accessControl', 'rateLimit', 'jwt', 'basicAuth', 'ingressMTLS', 'egressMTLS', 'oidc']

export default function NginxPolicyDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('config')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}

    const detectedType = (Object.keys(spec).find(k => KNOWN_TYPES.includes(k as PolicyType)) ?? '') as PolicyType
    const typeLabel    = TYPE_LABELS[detectedType] ?? (detectedType || 'Unknown')
    const cfg          = spec[detectedType]
    const badge        = detectedType ? typeBadgeClass(detectedType) : 'bg-slate-500/10 text-slate-400 border-slate-500/20'

    const rawYaml = yaml.dump(item, { indent: 2 })

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · POLICY
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
                    {detectedType ? (
                        <SectionCard>
                            <ConfigSection type={detectedType} cfg={cfg} />
                        </SectionCard>
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
