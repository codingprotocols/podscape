import React from 'react'
import type { KubeRoleBinding, KubeClusterRoleBinding } from '../types'
import { formatAge } from '../types'

type Binding = KubeRoleBinding | KubeClusterRoleBinding

export default function RoleBindingDetail({ binding }: { binding: Binding }) {
  const isCluster = !binding.metadata.namespace
  const subjects = binding.subjects ?? []

  return (
    <div className="flex flex-col w-[520px] min-w-[400px] border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 h-full shadow-2xl overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-600/10 dark:bg-violet-500/20 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-violet-600 dark:text-violet-400">
              <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono truncate">{binding.metadata.name}</h3>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
              {isCluster ? 'cluster-wide' : binding.metadata.namespace} · {isCluster ? 'ClusterRoleBinding' : 'RoleBinding'} · {formatAge(binding.metadata.creationTimestamp)} old
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Role Ref card */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Role Reference</p>
          <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-500/30 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wider w-24">Kind</span>
              <span className="text-xs font-bold text-violet-800 dark:text-violet-200">{binding.roleRef.kind}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wider w-24">Name</span>
              <span className="text-xs font-mono text-violet-800 dark:text-violet-200">{binding.roleRef.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wider w-24">API Group</span>
              <span className="text-xs font-mono text-violet-700 dark:text-violet-300">{binding.roleRef.apiGroup || '—'}</span>
            </div>
          </div>
        </div>

        {/* Subjects table */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
            Subjects ({subjects.length})
          </p>
          {subjects.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">No subjects</p>
          ) : (
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Kind</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Namespace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {subjects.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold
                          ${s.kind === 'ServiceAccount' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : s.kind === 'User' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                          {s.kind}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-700 dark:text-slate-200">{s.name}</td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{s.namespace ?? '—'}</td>
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
