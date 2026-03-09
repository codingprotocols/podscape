import React from 'react'
import type { KubeRoleBinding, KubeClusterRoleBinding } from '../types'
import { formatAge } from '../types'

type Binding = KubeRoleBinding | KubeClusterRoleBinding

export default function RoleBindingDetail({ binding }: { binding: Binding }) {
  const isCluster = !binding.metadata.namespace
  const subjects = binding.subjects ?? []

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-6 border-b border-white/5 bg-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet-600/10 dark:bg-violet-500/20 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-600 dark:text-violet-400">
              <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono truncate">{binding.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">
              {isCluster ? 'cluster-wide' : binding.metadata.namespace} · {isCluster ? 'CRB' : 'RB'} · {formatAge(binding.metadata.creationTimestamp)} old
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Role Ref card */}
        <div>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 px-1">Role Reference</p>
          <div className="bg-violet-500/5 border border-violet-500/20 rounded-2xl px-5 py-4 space-y-3 shadow-[inset_0_0_20px_rgba(139,92,246,0.05)]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-violet-400/60 uppercase tracking-widest">Kind</span>
              <span className="text-xs font-black text-violet-400 uppercase tracking-wider">{binding.roleRef.kind}</span>
            </div>
            <div className="flex items-center justify-between border-t border-violet-500/10 pt-3">
              <span className="text-[10px] font-black text-violet-400/60 uppercase tracking-widest">Name</span>
              <span className="text-xs font-bold text-slate-200 font-mono italic">{binding.roleRef.name}</span>
            </div>
            <div className="flex items-center justify-between border-t border-violet-500/10 pt-3">
              <span className="text-[10px] font-black text-violet-400/60 uppercase tracking-widest">API Group</span>
              <span className="text-[11px] font-medium text-slate-500 tabular-nums">{binding.roleRef.apiGroup || 'rbac.authorization.k8s.io'}</span>
            </div>
          </div>
        </div>

        {/* Subjects table */}
        <div>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 px-1">
            Subjects ({subjects.length})
          </p>
          {subjects.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic px-1">No subjects bound</p>
          ) : (
            <div className="rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02] shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10 backdrop-blur-xl">
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Kind</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {subjects.map((s, i) => (
                    <tr key={i} className="hover:bg-white/[0.03] transition-colors group">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest
                          ${s.kind === 'ServiceAccount' ? 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20'
                            : s.kind === 'User' ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                              : 'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20'}`}>
                          {s.kind}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-slate-200 font-mono tracking-tight">{s.name}</span>
                          {s.namespace && <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{s.namespace}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Labels */}
        {binding.metadata.labels && Object.keys(binding.metadata.labels).length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Labels</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(binding.metadata.labels).map(([k, v]) => (
                <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-[10px] font-mono">
                  <span className="text-slate-400 dark:text-slate-500">{k}</span>
                  <span className="text-slate-600 dark:text-slate-300">=</span>
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">{v}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
