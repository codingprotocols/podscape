import React, { useState } from 'react'
import * as yaml from 'js-yaml'
import { Shield } from 'lucide-react'

interface Props { item: any }

type Tab = 'config' | 'yaml'

export default function TraefikTLSStoreDetail({ item }: Props): JSX.Element {
    const [tab, setTab] = useState<Tab>('config')

    const name      = item?.metadata?.name ?? '—'
    const namespace = item?.metadata?.namespace ?? '—'
    const spec      = item?.spec ?? {}

    const defaultCert = spec.defaultCertificate ?? null
    const defaultGeneratedCert = spec.defaultGeneratedCert ?? null
    const certificates: any[] = spec.certificates ?? []

    const rawYaml = yaml.dump(item, { indent: 2 })

    return (
        <div className="flex flex-col w-full h-full overflow-y-auto">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-white/5 shrink-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{name}</h3>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
                            {namespace} · TLS STORE
                        </p>
                    </div>
                    <Shield size={16} className="shrink-0 text-blue-400 mt-0.5" />
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
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

                    {/* Default certificate */}
                    {defaultCert?.secretName && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Default Certificate</span>
                            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl px-4 py-3 flex items-center gap-3">
                                <Shield size={14} className="text-yellow-400 shrink-0" />
                                <span className="font-mono text-yellow-300 text-sm font-semibold truncate">{defaultCert.secretName}</span>
                            </div>
                        </div>
                    )}

                    {/* Default generated certificate */}
                    {defaultGeneratedCert && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">Default Generated Cert</span>
                            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl px-4 py-3 space-y-1.5">
                                {defaultGeneratedCert.resolver && (
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Resolver</span>
                                        <span className="font-mono text-cyan-400 text-xs">{defaultGeneratedCert.resolver}</span>
                                    </div>
                                )}
                                {defaultGeneratedCert.domain && (
                                    <div className="flex items-center justify-between gap-4">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Domain</span>
                                        <span className="font-mono text-slate-300 text-xs">{defaultGeneratedCert.domain.main ?? '—'}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Additional certificates */}
                    {certificates.length > 0 && (
                        <div>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2 block">
                                Certificates ({certificates.length})
                            </span>
                            <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/5">
                                            <th className="px-3 py-2.5 text-left text-[9px] font-black text-slate-500 uppercase tracking-wider">Secret</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                        {certificates.map((cert: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                <td className="px-3 py-2.5 font-mono text-yellow-300">{cert.secretName ?? '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {!defaultCert && !defaultGeneratedCert && certificates.length === 0 && (
                        <p className="text-xs text-slate-500 text-center py-8 italic">No certificates configured in this store</p>
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
