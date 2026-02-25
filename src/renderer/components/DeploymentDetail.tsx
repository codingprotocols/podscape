import React, { useState } from 'react'
import type { KubeDeployment } from '../types'
import { formatAge } from '../types'
import { useAppStore } from '../store'
import ScaleDialog from './ScaleDialog'
import YAMLViewer from './YAMLViewer'

interface Props { deployment: KubeDeployment }

export default function DeploymentDetail({ deployment: d }: Props): JSX.Element {
  const { rolloutRestart, getYAML } = useAppStore()
  const [showScale, setShowScale] = useState(false)
  const [yaml, setYaml] = useState<string | null>(null)
  const [restartMsg, setRestartMsg] = useState('')

  const desired = d.spec.replicas ?? 0
  const ready = d.status.readyReplicas ?? 0
  const available = d.status.availableReplicas ?? 0
  const updated = d.status.updatedReplicas ?? 0

  const handleRestart = async () => {
    await rolloutRestart('deployment', d.metadata.name)
    setRestartMsg('Restart triggered')
    setTimeout(() => setRestartMsg(''), 3000)
  }

  const handleViewYAML = async () => {
    const content = await getYAML('deployment', d.metadata.name)
    setYaml(content)
  }

  return (
    <div className="flex flex-col w-[440px] min-w-[340px] border-l border-white/10 bg-gray-900/70 h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white font-mono truncate">{d.metadata.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{d.metadata.namespace}</p>
          </div>
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${
            ready >= desired ? 'bg-green-500/20 text-green-300 ring-green-500/30' : 'bg-yellow-500/20 text-yellow-300 ring-yellow-500/30'
          }`}>
            {ready}/{desired} ready
          </span>
        </div>
        {/* Actions */}
        <div className="flex gap-2 mt-2.5">
          <button onClick={() => setShowScale(true)}
            className="text-xs px-3 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition-colors">
            Scale
          </button>
          <button onClick={handleRestart}
            className="text-xs px-3 py-1 rounded bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 transition-colors">
            Restart
          </button>
          <button onClick={handleViewYAML}
            className="text-xs px-3 py-1 rounded bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 transition-colors">
            YAML
          </button>
        </div>
        {restartMsg && <p className="text-xs text-green-400 mt-1.5">{restartMsg}</p>}
      </div>

      {/* Replicas */}
      <div className="px-4 py-3 border-b border-white/10">
        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2.5">Replicas</h4>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Desired', value: desired, color: 'text-white' },
            { label: 'Ready', value: ready, color: ready >= desired ? 'text-green-400' : 'text-yellow-400' },
            { label: 'Available', value: available, color: 'text-gray-300' },
            { label: 'Updated', value: updated, color: 'text-blue-400' }
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center bg-white/5 rounded p-2">
              <p className={`text-lg font-bold ${color}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Strategy */}
      <div className="px-4 py-3 border-b border-white/10">
        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Strategy</h4>
        <dl className="space-y-1.5">
          <Row label="Type" value={d.spec.strategy?.type ?? 'RollingUpdate'} />
          {d.spec.strategy?.rollingUpdate && (
            <>
              <Row label="Max Surge" value={String(d.spec.strategy.rollingUpdate.maxSurge ?? '25%')} />
              <Row label="Max Unavailable" value={String(d.spec.strategy.rollingUpdate.maxUnavailable ?? '25%')} />
            </>
          )}
          <Row label="Created" value={formatAge(d.metadata.creationTimestamp) + ' ago'} />
        </dl>
      </div>

      {/* Selector labels */}
      {d.spec.selector.matchLabels && (
        <div className="px-4 py-3 border-b border-white/10">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Selector</h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(d.spec.selector.matchLabels).map(([k, v]) => (
              <span key={k} className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded font-mono">
                {k}={v}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Conditions */}
      {d.status.conditions && d.status.conditions.length > 0 && (
        <div className="px-4 py-3">
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Conditions</h4>
          <div className="space-y-1.5">
            {d.status.conditions.map(c => (
              <div key={c.type} className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.status === 'True' ? 'bg-green-400' : 'bg-gray-600'}`} />
                <span className="text-xs text-gray-300 font-medium">{c.type}</span>
                {c.reason && <span className="text-xs text-gray-500">— {c.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scale dialog */}
      {showScale && (
        <ScaleDialog deployment={d} onClose={() => setShowScale(false)} />
      )}

      {/* YAML viewer */}
      {yaml !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8">
          <div className="bg-gray-900 rounded-xl border border-white/15 w-full max-w-3xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white">YAML — {d.metadata.name}</h3>
              <button onClick={() => setYaml(null)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="flex-1 min-h-0"><YAMLViewer content={yaml} /></div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-xs text-gray-500 w-28 shrink-0">{label}</dt>
      <dd className="text-xs text-gray-200">{value}</dd>
    </div>
  )
}
