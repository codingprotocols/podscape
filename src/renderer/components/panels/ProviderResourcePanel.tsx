import React, { useEffect, useState, useCallback, useRef } from 'react'
import * as yaml from 'js-yaml'
import { useAppStore } from '../../store'
import { ResourceKind } from '../../types'
import PageHeader from '../core/PageHeader'
import { RefreshCw, X } from 'lucide-react'
import TraefikIngressRouteDetail from '../provider-details/traefik/TraefikIngressRouteDetail'
import TraefikMiddlewareDetail from '../provider-details/traefik/TraefikMiddlewareDetail'
import TraefikMiddlewareTCPDetail from '../provider-details/traefik/TraefikMiddlewareTCPDetail'
import TraefikServiceDetail from '../provider-details/traefik/TraefikServiceDetail'
import TraefikTLSOptionDetail from '../provider-details/traefik/TraefikTLSOptionDetail'
import TraefikTLSStoreDetail from '../provider-details/traefik/TraefikTLSStoreDetail'
import TraefikServersTransportTCPDetail from '../provider-details/traefik/TraefikServersTransportTCPDetail'
import NginxVirtualServerDetail from '../provider-details/nginx/NginxVirtualServerDetail'
import NginxVirtualServerRouteDetail from '../provider-details/nginx/NginxVirtualServerRouteDetail'
import NginxPolicyDetail from '../provider-details/nginx/NginxPolicyDetail'
import NginxTransportServerDetail from '../provider-details/nginx/NginxTransportServerDetail'
import IstioVirtualServiceDetail from '../provider-details/istio/IstioVirtualServiceDetail'
import IstioDestinationRuleDetail from '../provider-details/istio/IstioDestinationRuleDetail'
import IstioGatewayDetail from '../provider-details/istio/IstioGatewayDetail'
import IstioServiceEntryDetail from '../provider-details/istio/IstioServiceEntryDetail'
import IstioPeerAuthDetail from '../provider-details/istio/IstioPeerAuthDetail'
import IstioAuthPolicyDetail from '../provider-details/istio/IstioAuthPolicyDetail'
import IstioRequestAuthDetail from '../provider-details/istio/IstioRequestAuthDetail'

// Maps the ResourceKind value to the Kubernetes CRD plural resource name used
// by getCustomResource (which passes it as the endpoint path to the sidecar).
const SECTION_TO_CRD: Partial<Record<ResourceKind, string>> = {
    // Istio
    'istio-virtualservices':  'virtualservices.networking.istio.io',
    'istio-destinationrules': 'destinationrules.networking.istio.io',
    'istio-gateways':         'gateways.networking.istio.io',
    'istio-serviceentries':   'serviceentries.networking.istio.io',
    'istio-peerauth':         'peerauthentications.security.istio.io',
    'istio-authpolicies':     'authorizationpolicies.security.istio.io',
    'istio-requestauth':      'requestauthentications.security.istio.io',
    // Traefik
    'traefik-ingressroutes':         'ingressroutes.traefik.io',
    'traefik-ingressroutestcp':      'ingressroutetcps.traefik.io',
    'traefik-ingressroutesudp':      'ingressrouteudps.traefik.io',
    'traefik-middlewares':           'middlewares.traefik.io',
    'traefik-middlewaretcps':        'middlewaretcps.traefik.io',
    'traefik-services':              'traefikservices.traefik.io',
    'traefik-tlsoptions':            'tlsoptions.traefik.io',
    'traefik-tlsstores':             'tlsstores.traefik.io',
    'traefik-serverstransporttcps':  'serverstransporttcps.traefik.io',
    // NGINX Inc
    'nginx-virtualservers':       'virtualservers.k8s.nginx.org',
    'nginx-virtualserverroutes':  'virtualserverroutes.k8s.nginx.org',
    'nginx-policies':             'policies.k8s.nginx.org',
    'nginx-transportservers':     'transportservers.k8s.nginx.org',
}

const SECTION_LABELS: Partial<Record<ResourceKind, string>> = {
    'istio-virtualservices':  'Virtual Services',
    'istio-destinationrules': 'Destination Rules',
    'istio-gateways':         'Gateways',
    'istio-serviceentries':   'Service Entries',
    'istio-peerauth':         'Peer Authentications',
    'istio-authpolicies':     'Authorization Policies',
    'istio-requestauth':      'Request Authentications',
    'traefik-ingressroutes':         'Ingress Routes',
    'traefik-ingressroutestcp':      'Ingress Routes TCP',
    'traefik-ingressroutesudp':      'Ingress Routes UDP',
    'traefik-middlewares':           'Middlewares',
    'traefik-middlewaretcps':        'Middlewares TCP',
    'traefik-services':              'Traefik Services',
    'traefik-tlsoptions':            'TLS Options',
    'traefik-tlsstores':             'TLS Stores',
    'traefik-serverstransporttcps':  'Servers Transports TCP',
    'nginx-virtualservers':      'Virtual Servers',
    'nginx-virtualserverroutes': 'Virtual Server Routes',
    'nginx-policies':            'Policies',
    'nginx-transportservers':    'Transport Servers',
}

function age(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime()
    const s = Math.floor(diff / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
}

/** Derive a short summary string for the "Summary" table column. */
function itemSummary(section: ResourceKind, item: any): string {
    const spec = item?.spec ?? {}
    switch (section) {
        case 'traefik-ingressroutes': {
            const n = (spec.routes ?? []).length
            return `${n} route${n !== 1 ? 's' : ''}`
        }
        case 'traefik-middlewares': {
            const knownKeys = [
                'basicAuth', 'digestAuth', 'forwardAuth', 'headers', 'rateLimit',
                'redirectRegex', 'redirectScheme', 'stripPrefix', 'stripPrefixRegex',
                'addPrefix', 'compress', 'chain', 'circuitBreaker', 'buffering',
                'errorPages', 'ipAllowList', 'ipWhiteList', 'passTLSClientCert',
                'retry', 'inFlightReq', 'contentType',
            ]
            const typeLabels: Record<string, string> = {
                basicAuth: 'Basic Auth', digestAuth: 'Digest Auth', forwardAuth: 'Forward Auth',
                headers: 'Headers', rateLimit: 'Rate Limit', redirectRegex: 'Redirect Regex',
                redirectScheme: 'Redirect Scheme', stripPrefix: 'Strip Prefix',
                stripPrefixRegex: 'Strip Prefix Regex', addPrefix: 'Add Prefix',
                compress: 'Compress', chain: 'Chain', circuitBreaker: 'Circuit Breaker',
                buffering: 'Buffering', errorPages: 'Error Pages', ipAllowList: 'IP Allow List',
                ipWhiteList: 'IP Whitelist', passTLSClientCert: 'Pass TLS Client Cert',
                retry: 'Retry', inFlightReq: 'In-Flight Req', contentType: 'Content Type',
            }
            const key = Object.keys(spec).find(k => knownKeys.includes(k)) ?? ''
            return typeLabels[key] ?? (key || '—')
        }
        case 'traefik-services':
            if (spec.weighted) return 'Weighted'
            if (spec.mirroring) return 'Mirroring'
            return '—'
        case 'traefik-tlsoptions':
            return spec.minVersion ?? 'Default'
        case 'nginx-virtualservers': {
            const host = item?.spec?.host
            return host ?? '—'
        }
        case 'nginx-policies': {
            const known = ['accessControl', 'rateLimit', 'jwt', 'basicAuth', 'ingressMTLS', 'egressMTLS', 'oidc']
            const labels: Record<string, string> = {
                accessControl: 'Access Control', rateLimit: 'Rate Limit', jwt: 'JWT',
                basicAuth: 'Basic Auth', ingressMTLS: 'Ingress mTLS', egressMTLS: 'Egress mTLS', oidc: 'OIDC',
            }
            const key = Object.keys(spec).find(k => known.includes(k)) ?? ''
            return labels[key] ?? (key || '—')
        }
        case 'nginx-transportservers':
            return item?.spec?.listener?.protocol ?? '—'
        case 'istio-virtualservices': {
            const httpCount = (spec.http ?? []).length
            const tcpCount = (spec.tcp ?? []).length
            const total = httpCount + tcpCount
            return total > 0 ? `${total} route${total !== 1 ? 's' : ''}` : '—'
        }
        case 'istio-destinationrules':
            return spec.host ?? '—'
        case 'istio-gateways': {
            const serverCount = (spec.servers ?? []).length
            return `${serverCount} server${serverCount !== 1 ? 's' : ''}`
        }
        case 'istio-serviceentries':
            return (spec.hosts ?? [])[0] ?? '—'
        case 'istio-peerauth':
            return spec.mtls?.mode ?? 'UNSET'
        case 'istio-authpolicies':
            return spec.action ?? 'ALLOW'
        case 'istio-requestauth': {
            const n = (spec.jwtRules ?? []).length
            return `${n} JWT rule${n !== 1 ? 's' : ''}`
        }
        case 'traefik-middlewaretcps':
            return (spec.ipAllowList?.sourceRange ?? []).length > 0 ? 'IP Allow List' : '—'
        case 'traefik-tlsstores':
            return spec.defaultCertificate?.secretName ?? (spec.defaultGeneratedCert ? 'Generated' : '—')
        case 'traefik-serverstransporttcps':
            return spec.tls?.serverName ?? (spec.dialTimeout ? `dial ${spec.dialTimeout}` : '—')
        case 'nginx-virtualserverroutes': {
            const n = (spec.subroutes ?? []).length
            return n > 0 ? `${n} subroute${n !== 1 ? 's' : ''}` : (spec.host ?? '—')
        }
        default:
            return ''
    }
}

/** Render the correct detail component for the selected item and section. */
function DetailPanel({ section, item }: { section: ResourceKind; item: any }) {
    switch (section) {
        case 'traefik-ingressroutes':
            return <TraefikIngressRouteDetail item={item} />
        case 'traefik-middlewares':
            return <TraefikMiddlewareDetail item={item} />
        case 'traefik-services':
            return <TraefikServiceDetail item={item} />
        case 'traefik-tlsoptions':
            return <TraefikTLSOptionDetail item={item} />
        case 'nginx-virtualservers':
            return <NginxVirtualServerDetail item={item} />
        case 'nginx-policies':
            return <NginxPolicyDetail item={item} />
        case 'nginx-transportservers':
            return <NginxTransportServerDetail item={item} />
        case 'istio-virtualservices':
            return <IstioVirtualServiceDetail item={item} />
        case 'istio-destinationrules':
            return <IstioDestinationRuleDetail item={item} />
        case 'istio-gateways':
            return <IstioGatewayDetail item={item} />
        case 'istio-serviceentries':
            return <IstioServiceEntryDetail item={item} />
        case 'istio-peerauth':
            return <IstioPeerAuthDetail item={item} />
        case 'istio-authpolicies':
            return <IstioAuthPolicyDetail item={item} />
        case 'istio-requestauth':
            return <IstioRequestAuthDetail item={item} />
        case 'traefik-middlewaretcps':
            return <TraefikMiddlewareTCPDetail item={item} />
        case 'traefik-tlsstores':
            return <TraefikTLSStoreDetail item={item} />
        case 'traefik-serverstransporttcps':
            return <TraefikServersTransportTCPDetail item={item} />
        case 'nginx-virtualserverroutes':
            return <NginxVirtualServerRouteDetail item={item} />
        default:
            // Generic YAML viewer for all other sections (istio, nginx, TCP/UDP routes…)
            return (
                <div className="flex flex-col w-full h-full overflow-y-auto">
                    <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">
                            {item?.metadata?.name ?? '—'}
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {item?.metadata?.namespace ?? '—'} · {item?.kind ?? 'RESOURCE'}
                        </p>
                    </div>
                    <div className="flex-1 overflow-auto bg-slate-950">
                        <pre className="text-xs font-mono p-4 text-slate-300 leading-relaxed whitespace-pre">
                            {yaml.dump(item, { indent: 2 })}
                        </pre>
                    </div>
                </div>
            )
    }
}

const MIN_DETAIL_WIDTH = 280
const MAX_DETAIL_WIDTH = 600
const DEFAULT_DETAIL_WIDTH = 380

export default function ProviderResourcePanel({ section }: { section: ResourceKind }) {
    const { selectedContext, selectedNamespace, providers } = useAppStore()
    const [items, setItems] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [selectedItem, setSelectedItem] = useState<any | null>(null)
    const [detailWidth, setDetailWidth] = useState(DEFAULT_DETAIL_WIDTH)

    // Drag-to-resize state
    const dragStartX = useRef<number | null>(null)
    const dragStartWidth = useRef<number>(DEFAULT_DETAIL_WIDTH)

    const crdName = SECTION_TO_CRD[section]
    const label = SECTION_LABELS[section] ?? section

    // Detect the active provider for the Traefik v2 fallback
    const resolvedCrdName = useCallback((): string | undefined => {
        if (!crdName) return undefined
        // Traefik v2 uses traefik.containo.us group instead of traefik.io
        if (crdName.endsWith('.traefik.io') && providers.traefikVersion === 'v2') {
            return crdName.replace('.traefik.io', '.traefik.containo.us')
        }
        return crdName
    }, [crdName, providers.traefikVersion])

    const load = useCallback(async () => {
        if (!selectedContext || !crdName) return
        const resolved = resolvedCrdName()
        if (!resolved) return
        setLoading(true)
        setError(null)
        try {
            const ns = selectedNamespace === '_all' ? null : selectedNamespace
            const data = await window.kubectl.getCustomResource(selectedContext, ns, resolved)
            setItems(Array.isArray(data) ? data : [])
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }, [selectedContext, selectedNamespace, crdName, resolvedCrdName])

    useEffect(() => {
        load()
        // Close detail panel when section/namespace/context changes
        setSelectedItem(null)
    }, [load])

    // Resize handle mouse handlers
    const resizeListeners = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null)

    useEffect(() => {
        return () => {
            if (resizeListeners.current) {
                window.removeEventListener('mousemove', resizeListeners.current.move)
                window.removeEventListener('mouseup', resizeListeners.current.up)
                resizeListeners.current = null
            }
        }
    }, [])

    const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        dragStartX.current = e.clientX
        dragStartWidth.current = detailWidth

        const onMouseMove = (ev: MouseEvent) => {
            if (dragStartX.current === null) return
            // Dragging left increases panel width (panel is on the right)
            const delta = dragStartX.current - ev.clientX
            const next = Math.max(MIN_DETAIL_WIDTH, Math.min(MAX_DETAIL_WIDTH, dragStartWidth.current + delta))
            setDetailWidth(next)
        }
        const onMouseUp = () => {
            dragStartX.current = null
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            resizeListeners.current = null
        }
        resizeListeners.current = { move: onMouseMove, up: onMouseUp }
        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }, [detailWidth])

    const hasSummaryColumn = [
        'traefik-ingressroutes',
        'traefik-middlewares',
        'traefik-middlewaretcps',
        'traefik-services',
        'traefik-tlsoptions',
        'traefik-tlsstores',
        'traefik-serverstransporttcps',
        'nginx-virtualservers',
        'nginx-virtualserverroutes',
        'nginx-policies',
        'nginx-transportservers',
        'istio-virtualservices',
        'istio-destinationrules',
        'istio-gateways',
        'istio-serviceentries',
        'istio-peerauth',
        'istio-authpolicies',
        'istio-requestauth',
    ].includes(section)

    return (
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
            <PageHeader
                title={label}
                subtitle={selectedNamespace === '_all' ? 'all namespaces' : (selectedNamespace ?? 'cluster-wide')}
            >
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300
                               bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10
                               rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </PageHeader>

            {/* Main body: list + optional detail panel */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

                {/* List pane */}
                <div className="flex-1 min-w-0 overflow-auto">
                    {loading && (
                        <div className="flex items-center justify-center h-40 gap-3 text-slate-500">
                            <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
                            <span className="text-sm font-medium">Loading {label}…</span>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="m-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium">
                            {error}
                        </div>
                    )}

                    {!loading && !error && items.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                            <div className="text-4xl mb-3 opacity-30">∅</div>
                            <p className="text-sm font-semibold">No {label} found</p>
                            <p className="text-xs mt-1 opacity-60">
                                {selectedNamespace === '_all' ? 'in any namespace' : `in ${selectedNamespace}`}
                            </p>
                        </div>
                    )}

                    {!loading && !error && items.length > 0 && (
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-slate-500
                                               border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02]">
                                    <th className="px-4 py-2.5">Name</th>
                                    <th className="px-4 py-2.5">Namespace</th>
                                    {hasSummaryColumn && <th className="px-4 py-2.5">Summary</th>}
                                    <th className="px-4 py-2.5">Age</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item: any, i: number) => {
                                    const name = item?.metadata?.name ?? '—'
                                    const ns = item?.metadata?.namespace ?? '—'
                                    const createdAt = item?.metadata?.creationTimestamp
                                    const isSelected = selectedItem === item
                                    const summary = hasSummaryColumn ? itemSummary(section, item) : ''
                                    return (
                                        <tr
                                            key={`${ns}/${name}-${i}`}
                                            onClick={() => setSelectedItem(isSelected ? null : item)}
                                            className={`border-b border-slate-100 dark:border-white/[0.04] cursor-pointer transition-colors
                                                ${isSelected
                                                    ? 'bg-blue-500/10 dark:bg-blue-500/10'
                                                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                                                }`}
                                        >
                                            <td className={`px-4 py-2.5 font-semibold font-mono ${isSelected ? 'text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                                {name}
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-500 font-mono">{ns}</td>
                                            {hasSummaryColumn && (
                                                <td className="px-4 py-2.5 text-slate-400">{summary || '—'}</td>
                                            )}
                                            <td className="px-4 py-2.5 text-slate-400">
                                                {createdAt ? age(createdAt) : '—'}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Detail panel */}
                {selectedItem !== null && (
                    <>
                        {/* Drag resize handle */}
                        <div
                            onMouseDown={handleResizeMouseDown}
                            className="w-1 cursor-col-resize bg-slate-100 dark:bg-white/5 hover:bg-blue-500/40 transition-colors shrink-0 select-none"
                            title="Drag to resize"
                        />

                        {/* Detail content */}
                        <div
                            className="shrink-0 border-l border-slate-100 dark:border-white/5 flex flex-col overflow-hidden"
                            style={{ width: detailWidth }}
                        >
                            {/* Close button row — sits above the detail header so it never overlaps content */}
                            <div className="flex justify-end px-3 pt-2 pb-0 shrink-0">
                                <button
                                    onClick={() => setSelectedItem(null)}
                                    className="w-6 h-6 flex items-center justify-center rounded-full
                                               bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/10
                                               text-slate-500 dark:text-slate-400 transition-colors"
                                    title="Close"
                                >
                                    <X size={12} strokeWidth={2.5} />
                                </button>
                            </div>

                            <div className="flex-1 min-h-0 overflow-hidden">
                                <DetailPanel section={section} item={selectedItem} />
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
