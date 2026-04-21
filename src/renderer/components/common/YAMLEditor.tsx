import React from 'react'
import Editor from '@monaco-editor/react'
import { useAppStore } from '../../store'

interface Props {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  language?: string
  height?: string
  wordWrap?: 'on' | 'off'
  onMount?: (editor: any) => void
}

/**
 * Thin Monaco wrapper used by YAMLViewer and HelmInstallDialog.
 * Handles only the editor itself — no toolbar or save logic.
 */
export default function YAMLEditor({
  value,
  onChange,
  readOnly = false,
  language = 'yaml',
  height = '100%',
  wordWrap = 'on',
  onMount,
}: Props): JSX.Element {
  const { theme } = useAppStore()

  return (
    <div className="cursor-default" style={{ height }}>
    <Editor
      height="100%"
      language={language}
      value={value}
      loading={
        <div className="flex items-center justify-center h-full text-slate-400 text-xs font-bold uppercase tracking-widest">
          Initializing Editor...
        </div>
      }
      onChange={v => !readOnly && onChange && onChange(v ?? '')}
      onMount={(editor) => onMount && onMount(editor)}
      theme={theme === 'dark' ? 'vs-dark' : 'light'}
      options={{
        readOnly,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 12,
        lineNumbers: 'on',
        renderWhitespace: 'none',
        wordWrap,
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
  )
}
