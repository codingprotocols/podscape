import React, { useState, useEffect, useRef } from 'react'
import { Search, Download, AlignLeft } from 'lucide-react'
import Editor, { DiffEditor } from '@monaco-editor/react'
import { useAppStore } from '../../store'
import YAMLEditor from './YAMLEditor'

interface Props {
  content: string
  editable?: boolean
  onSave?: (updated: string) => Promise<void>
}

export default function YAMLViewer({ content, editable = false, onSave }: Props): JSX.Element {
  const { theme, isProduction } = useAppStore()
  const [value, setValue] = useState(content)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [wordWrap, setWordWrap] = useState<'on' | 'off'>('on')
  const editorRef = useRef<any>(null)

  // Sync editor content when the prop changes (e.g. switching resources or ConfigMap keys)
  useEffect(() => {
    setValue(content)
  }, [content])
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveError, setSaveError] = useState<{ kind: 'immutable' | 'generic'; message: string } | null>(null)
  const [copyMsg, setCopyMsg] = useState('')

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopyMsg('Copied!')
    setTimeout(() => setCopyMsg(''), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([value], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'resource.yaml'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSearch = () => {
    if (editorRef.current) {
      editorRef.current.trigger('toolbar', 'actions.find', {})
    }
  }

  const handleSave = async () => {
    if (!onSave) return
    if (isProduction && !showConfirm) {
      setShowConfirm(true)
      return
    }
    setSaving(true)
    setShowConfirm(false)
    setSaveError(null)
    try {
      await onSave(value)
      setSaveMsg('Applied!')
      setTimeout(() => setSaveMsg(''), 4000)
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('immutable') || msg.includes('422')) {
        setSaveError({ kind: 'immutable', message: 'Pod spec fields are immutable after creation. Edit the parent Deployment or StatefulSet instead.' })
        setSaveMsg('Error: immutable field')
      } else {
        setSaveError({ kind: 'generic', message: msg })
        setSaveMsg('Error: apply failed')
      }
      setTimeout(() => setSaveMsg(''), 4000)
    } finally {
      setSaving(false)
    }
  }

  // Handle Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        if (editable && onSave && !saving) {
          e.preventDefault()
          handleSave()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editable, onSave, saving, value, showConfirm])

  return (
    <div className="flex flex-col h-full min-h-[400px] bg-slate-50 dark:bg-[hsl(var(--bg-dark))]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-white/5 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-400"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2v7h7" /></svg>
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">YAML SOURCE</span>
        </div>
        <div className="flex items-center gap-3">
          {editable && onSave && (
            <button
              onClick={() => setShowDiff(!showDiff)}
              className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold transition-colors uppercase tracking-wider rounded-lg border ${showDiff ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-slate-100'
                }`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M4 4l5 5" /></svg>
              {showDiff ? 'Exit Diff' : 'Diff'}
            </button>
          )}
          <button
            onClick={() => setWordWrap(v => v === 'on' ? 'off' : 'on')}
            title="Toggle Word Wrap"
            className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold transition-colors uppercase tracking-wider rounded-lg border ${wordWrap === 'on' ? 'bg-blue-500/10 border-blue-500/20 text-blue-500' : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-slate-100'
              }`}
          >
            <AlignLeft size={11} strokeWidth={2.5} />
            Wrap
          </button>
          {saveMsg && <span className={`text-[10px] font-bold ${saveMsg.startsWith('Error') ? 'text-red-500' : 'text-emerald-500'}`}>{saveMsg.toUpperCase()}</span>}
          {copyMsg && <span className="text-[10px] font-bold text-blue-500">COPIED!</span>}
          <button
            onClick={handleSearch}
            title="Search (Cmd+F)"
            className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors uppercase tracking-wider"
          >
            <Search size={11} strokeWidth={2.5} />
            Find
          </button>
          <button
            onClick={handleDownload}
            title="Download YAML"
            className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors uppercase tracking-wider"
          >
            <Download size={11} strokeWidth={2.5} />
            Download
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors uppercase tracking-wider"
          >
            Copy
          </button>
          {editable && onSave && (
            <div className="flex items-center gap-2">
              {showConfirm && (
                <span className="text-[10px] font-black text-red-500 animate-pulse uppercase tracking-widest mr-1">Are you sure?</span>
              )}
              <button
                onClick={handleSave}
                onMouseLeave={() => setShowConfirm(false)}
                disabled={saving}
                className={`px-4 py-1 text-[10px] font-bold text-white rounded-lg shadow-sm
                           transition-all disabled:opacity-50 uppercase tracking-widest
                           ${showConfirm ? 'bg-red-600 hover:bg-red-700 ring-4 ring-red-500/20 scale-105' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {saving ? 'Applying…' : showConfirm ? 'Yes, Apply' : 'Apply'}
              </button>
            </div>
          )}
        </div>
      </div>

      {saveError && (
        <div className={`px-4 py-3 border-b flex items-start gap-3 shrink-0 ${saveError.kind === 'immutable'
            ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40'
            : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/40'
          }`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`mt-0.5 shrink-0 ${saveError.kind === 'immutable' ? 'text-amber-500' : 'text-red-500'}`}>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
          </svg>
          <p className={`text-[11px] font-semibold leading-relaxed ${saveError.kind === 'immutable' ? 'text-amber-800 dark:text-amber-300' : 'text-red-800 dark:text-red-300'}`}>
            {saveError.message}
          </p>
          <button onClick={() => setSaveError(null)} title="Dismiss" className="ml-auto shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      <div className="flex-1 relative bg-white dark:bg-[hsl(var(--bg-dark))]">
        {showDiff ? (
          <DiffEditor
            height="100%"
            language="yaml"
            original={content}
            modified={value}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            options={{
              readOnly: false,
              renderSideBySide: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              lineNumbers: 'on',
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
            }}
          />
        ) : (
          <YAMLEditor
            value={value}
            onChange={v => editable && setValue(v)}
            readOnly={!editable}
            height="100%"
            wordWrap={wordWrap}
            onMount={(editor) => (editorRef.current = editor)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Apply YAML panel (full editor for applying new manifests) ────────────────

export function ApplyYAMLPanel(): JSX.Element {
  const { applyYAML, theme, selectedContext, isProduction } = useAppStore()
  const [content, setContent] = useState('# Paste your YAML manifest here\n')
  const [result, setResult] = useState('')
  const [applying, setApplying] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const editorRef = useRef<any>(null)

  const handleSearch = () => {
    if (editorRef.current) {
      editorRef.current.trigger('toolbar', 'actions.find', {})
    }
  }

  const handleApply = async () => {
    if (isProduction && !showConfirm) {
      setShowConfirm(true)
      return
    }
    setApplying(true)
    setShowConfirm(false)
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
    <div className="flex flex-col h-full bg-white dark:bg-[hsl(var(--bg-dark))]">
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-white/5 shrink-0 bg-white dark:bg-white/5 backdrop-blur-xl">
        <div className="flex flex-col">
          <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight leading-none mb-1">Apply YAML</h2>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">
            {selectedContext ? `Target: ${selectedContext}` : 'Select a cluster'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={handleSearch}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <Search size={14} strokeWidth={2.5} />
            Find
          </button>
          <div className="flex items-center gap-3">
            {showConfirm && (
              <span className="text-[10px] font-black text-red-500 animate-pulse tracking-widest">PRODUCTION OVERRIDE?</span>
            )}
            <button
              onClick={handleApply}
              onMouseLeave={() => setShowConfirm(false)}
              disabled={applying}
              className={`px-6 py-2 text-xs font-black text-white rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest
                       ${showConfirm ? 'bg-red-600 hover:bg-red-700 shadow-red-500/30 scale-105' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'}`}
            >
              {applying ? 'Applying…' : showConfirm ? 'Confirm Apply' : 'KUBECTL APPLY'}
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 cursor-default">
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
          onMount={(editor) => (editorRef.current = editor)}
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
