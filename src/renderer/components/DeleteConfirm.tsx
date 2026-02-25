import React, { useState } from 'react'

interface Props {
  name: string
  kind: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export default function DeleteConfirm({ name, kind, onConfirm, onCancel }: Props): JSX.Element {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [typed, setTyped] = useState('')

  const confirmed = typed === name

  const handleDelete = async () => {
    if (!confirmed) return
    setPending(true)
    try {
      await onConfirm()
    } catch (err) {
      setError((err as Error).message)
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8" onClick={onCancel}>
      <div
        className="bg-gray-900 border border-red-500/25 rounded-xl w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-red-400">Delete {kind}</h3>
        </div>

        <div className="px-5 py-5">
          <p className="text-sm text-gray-300 mb-1">
            This will permanently delete:
          </p>
          <p className="font-mono text-sm text-white bg-gray-800 px-3 py-2 rounded mb-4 border border-white/10 break-all">
            {name}
          </p>
          <p className="text-xs text-gray-400 mb-3">
            Type the resource name to confirm deletion:
          </p>
          <input
            autoFocus
            type="text"
            placeholder={name}
            value={typed}
            onChange={e => setTyped(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && confirmed) handleDelete() }}
            className="w-full bg-gray-800 text-white text-sm rounded px-3 py-2 border border-white/10
                       focus:outline-none focus:ring-1 focus:ring-red-500 placeholder-gray-600 font-mono"
          />
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-sm text-gray-300 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!confirmed || pending}
            className="flex-1 py-2 text-sm text-white bg-red-600 hover:bg-red-500 rounded-lg
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
