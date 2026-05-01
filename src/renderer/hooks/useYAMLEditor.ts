import { useState, useRef } from 'react'
import { useAppStore } from '../store'

export interface YAMLEditorState {
  yaml: string | null
  loading: boolean
  error: string | null
  open: (kind: string, name: string, clusterScoped: boolean, namespace?: string) => Promise<void>
  apply: (newYaml: string) => Promise<void>
  close: () => void
}

interface StateSetters {
  setYaml: (v: string | null) => void
  setLoading: (v: boolean) => void
  setError: (v: string | null) => void
}

type GetYAMLFn = (kind: string, name: string, clusterScoped: boolean, namespace?: string) => Promise<string>
type ApplyYAMLFn = (yaml: string) => Promise<string>
type RefreshFn = () => void

/**
 * Pure factory exported for unit-testing without React.
 * Creates the open/apply/close handlers given injected store functions and state setters.
 *
 * genRef is a { current: number } ref used as a generation counter so that
 * close() can cancel an in-flight open() — if the generation changes while
 * the fetch is awaited, the result is silently discarded.
 */
export function _createYAMLEditorHandlers(
  getYAML: GetYAMLFn,
  applyYAML: ApplyYAMLFn,
  refresh: RefreshFn,
  setState: StateSetters,
  genRef: { current: number } = { current: 0 }
) {
  return {
    open: async (kind: string, name: string, clusterScoped: boolean, namespace?: string) => {
      const gen = ++genRef.current
      setState.setYaml(null)
      setState.setError(null)
      setState.setLoading(true)
      try {
        const content = await getYAML(kind, name, clusterScoped, namespace)
        if (genRef.current !== gen) return   // close() was called while loading
        setState.setYaml(content)
      } catch (err) {
        if (genRef.current !== gen) return   // close() was called while loading
        const raw = (err as Error)?.message ?? ''
        const isNotFound = /not found|404/i.test(raw)
        setState.setError(isNotFound
          ? 'Resource not found — it may have been deleted or is still terminating.'
          : (raw || 'Failed to fetch YAML'))
      } finally {
        if (genRef.current === gen) setState.setLoading(false)
      }
    },
    apply: async (newYaml: string) => {
      await applyYAML(newYaml)
      refresh()
      setState.setYaml(null)
    },
    close: () => {
      genRef.current++           // invalidate any in-flight open()
      setState.setYaml(null)
      setState.setError(null)
      setState.setLoading(false) // dismiss modal immediately even during loading
    },
  }
}

/**
 * Encapsulates the YAML fetch / apply / close lifecycle shared by all *Detail components.
 *
 * Usage:
 *   const { yaml, loading, error, open, apply, close } = useYAMLEditor()
 *   // open the editor:
 *   await open('deployment', name, false, namespace)
 *   // pass to YAMLViewer:
 *   <YAMLViewer content={yaml} editable onSave={apply} />
 */
export function useYAMLEditor(): YAMLEditorState {
  const { getYAML, applyYAML, refresh } = useAppStore()
  const [yaml, setYaml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const genRef = useRef(0)

  const { open, apply, close } = _createYAMLEditorHandlers(
    getYAML, applyYAML, refresh,
    { setYaml, setLoading, setError },
    genRef
  )

  return { yaml, loading, error, open, apply, close }
}
