import React, { useState } from 'react'
import Editor from '@monaco-editor/react'
import { useAppStore } from '../store'

interface Props {
  content: string
  editable?: boolean
  onSave?: (updated: string) => Promise<void>
}

export default function YAMLViewer({ content, editable = false, onSave }: Props): JSX.Element {
  const [value, setValue] = useState(content)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [copyMsg, setCopyMsg] = useState('')

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopyMsg('Copied!')
    setTimeout(() => setCopyMsg(''), 2000)
  }

  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(value)
      setSaveMsg('Applied!')
    } catch (err) {
      setSaveMsg('Error: ' + (err as Error).message)
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 4000)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900/80 border-b border-white/10 shrink-0">
        <span className="text-xs text-gray-500">YAML</span>
        <div className="flex items-center gap-2">
          {saveMsg && <span className={`text-xs ${saveMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{saveMsg}</span>}
          {copyMsg && <span className="text-xs text-blue-400">{copyMsg}</span>}
          <button
            onClick={handleCopy}
            className="text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/5 transition-colors"
          >
            Copy
          </button>
          {editable && onSave && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs text-white bg-blue-600 hover:bg-blue-500 px-2.5 py-0.5 rounded
                         transition-colors disabled:opacity-50"
            >
              {saving ? 'Applying…' : 'Apply'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="yaml"
          value={value}
          onChange={v => editable && setValue(v ?? '')}
          theme="vs-dark"
          options={{
            readOnly: !editable,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: 'on',
            renderWhitespace: 'none',
            wordWrap: 'on',
            padding: { top: 8, bottom: 8 },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: { vertical: 'auto', horizontal: 'auto' },
            folding: true,
            glyphMargin: false,
            lineDecorationsWidth: 4,
            lineNumbersMinChars: 3
          }}
        />
      </div>
    </div>
  )
}

// ─── Apply YAML panel (full editor for applying new manifests) ────────────────

export function ApplyYAMLPanel(): JSX.Element {
  const { applyYAML } = useAppStore()
  const [content, setContent] = useState('# Paste your YAML manifest here\n')
  const [result, setResult] = useState('')
  const [applying, setApplying] = useState(false)

  const handleApply = async () => {
    setApplying(true)
    setResult('')
    try {
      const out = await applyYAML(content)
      setResult(out)
    } catch (err) {
      setResult('Error: ' + (err as Error).message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <h2 className="text-sm font-semibold text-white">Apply YAML</h2>
        <button
          onClick={handleApply}
          disabled={applying}
          className="px-4 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg
                     transition-colors disabled:opacity-50"
        >
          {applying ? 'Applying…' : 'kubectl apply'}
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="yaml"
          value={content}
          onChange={v => setContent(v ?? '')}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 8 }
          }}
        />
      </div>
      {result && (
        <div className={`px-4 py-3 border-t border-white/10 shrink-0 ${result.startsWith('Error') ? 'bg-red-900/20' : 'bg-green-900/20'}`}>
          <pre className="text-xs font-mono whitespace-pre-wrap text-gray-200">{result}</pre>
        </div>
      )}
    </div>
  )
}
