import React, { useState } from 'react'
import type { KubeDeployment } from '../types'
import { useAppStore } from '../store'

interface Props {
  deployment: KubeDeployment
  onClose: () => void
}

export default function ScaleDialog({ deployment: d, onClose }: Props): JSX.Element {
  const { scaleDeployment } = useAppStore()
  const current = d.spec.replicas ?? 0
  const [replicas, setReplicas] = useState(String(current))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const parsed = parseInt(replicas, 10)
  const valid = !isNaN(parsed) && parsed >= 0 && parsed <= 100

  const handleScale = async () => {
    if (!valid) return
    setPending(true)
    setError('')
    try {
      await scaleDeployment(d.metadata.name, parsed, d.metadata.namespace)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8" onClick={onClose}>
      <div
        className="bg-gray-900 border border-white/15 rounded-xl w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">Scale Deployment</h3>
          <p className="text-xs text-gray-400 mt-0.5 font-mono">{d.metadata.name}</p>
        </div>

        <div className="px-5 py-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-center bg-white/5 rounded-lg px-4 py-2">
              <p className="text-lg font-bold text-gray-300">{current}</p>
              <p className="text-xs text-gray-500">Current</p>
            </div>
            <span className="text-gray-600 text-lg">→</span>
            <div className="text-center bg-blue-600/10 border border-blue-500/20 rounded-lg px-4 py-2">
              <p className="text-lg font-bold text-blue-300">{valid ? parsed : '?'}</p>
              <p className="text-xs text-gray-500">New</p>
            </div>
          </div>

          <label className="block text-xs font-medium text-gray-400 mb-2">Replicas</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReplicas(r => String(Math.max(0, parseInt(r) - 1)))}
              className="w-8 h-8 rounded bg-white/5 hover:bg-white/10 text-gray-300 text-lg leading-none flex items-center justify-center border border-white/10"
            >
              −
            </button>
            <input
              type="number"
              min={0}
              max={100}
              value={replicas}
              onChange={e => setReplicas(e.target.value)}
              className="flex-1 bg-gray-800 text-white text-sm rounded px-3 py-2 border border-white/10
                         focus:outline-none focus:ring-1 focus:ring-blue-500 text-center"
            />
            <button
              onClick={() => setReplicas(r => String(Math.min(100, parseInt(r) + 1)))}
              className="w-8 h-8 rounded bg-white/5 hover:bg-white/10 text-gray-300 text-lg leading-none flex items-center justify-center border border-white/10"
            >
              +
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-400 mt-2">{error}</p>
          )}

          {/* Quick presets */}
          <div className="flex gap-2 mt-3">
            {[0, 1, 2, 3, 5, 10].map(n => (
              <button
                key={n}
                onClick={() => setReplicas(String(n))}
                className={`flex-1 py-1 text-xs rounded border transition-colors
                  ${parsed === n ? 'bg-blue-600/30 text-blue-300 border-blue-500/30' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm text-gray-300 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleScale}
            disabled={!valid || pending || parsed === current}
            className="flex-1 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? 'Scaling…' : `Scale to ${valid ? parsed : '?'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
