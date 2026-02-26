import React, { useState, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { useAppStore } from '../store'

interface Props {
  content: string
  editable?: boolean
  onSave?: (updated: string) => Promise<void>
}

export default function YAMLViewer({ content, editable = false, onSave }: Props): JSX.Element {
  const { theme } = useAppStore()
  const [value, setValue] = useState(content)

  // Sync editor content when the prop changes (e.g. switching resources or ConfigMap keys)
  useEffect(() => {
    setValue(content)
  }, [content])
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
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-400"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2v7h7" /></svg>
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">YAML SOURCE</span>
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && <span className={`text-[10px] font-bold ${saveMsg.startsWith('Error') ? 'text-red-500' : 'text-emerald-500'}`}>{saveMsg.toUpperCase()}</span>}
          {copyMsg && <span className="text-[10px] font-bold text-blue-500">COPIED!</span>}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors uppercase tracking-wider"
          >
            Copy
          </button>
          {editable && onSave && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-sm
                         transition-colors disabled:opacity-50 uppercase tracking-widest"
            >
              {saving ? 'Applying…' : 'Apply'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-white dark:bg-slate-950">
        <Editor
          height="100%"
          language="yaml"
          value={value}
          onChange={v => editable && setValue(v ?? '')}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          options={{
            readOnly: !editable,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: 'on',
            renderWhitespace: 'none',
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: { vertical: 'auto', horizontal: 'auto' },
            folding: true,
            glyphMargin: false,
            lineDecorationsWidth: 4,
            lineNumbersMinChars: 3,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
          }}
        />
      </div>
    </div>
  )
}

// ─── Apply YAML panel (full editor for applying new manifests) ────────────────

export function ApplyYAMLPanel(): JSX.Element {
  const { applyYAML, theme } = useAppStore()
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
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-950">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Apply YAML</h2>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">Create or update resources</p>
        </div>
        <button
          onClick={handleApply}
          disabled={applying}
          className="px-6 py-2 text-xs font-black text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-500/20
                     transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest"
        >
          {applying ? 'Applying…' : 'KUBECTL APPLY'}
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="yaml"
          value={content}
          onChange={v => setContent(v ?? '')}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 16 },
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
          }}
        />
      </div>
      {result && (
        <div className={`px-6 py-4 border-t transition-all shrink-0 
          ${result.startsWith('Error')
            ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30'
            : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/30'}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${result.startsWith('Error') ? 'bg-red-500' : 'bg-emerald-500'}`} />
            <span className={`text-[10px] font-bold uppercase tracking-widest ${result.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
              Result
            </span>
          </div>
          <pre className="text-xs font-bold font-mono whitespace-pre-wrap text-slate-700 dark:text-slate-200 leading-relaxed">{result}</pre>
        </div>
      )}
    </div>
  )
}
