import { useState } from 'react'
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
 */
export function _createYAMLEditorHandlers(
  getYAML: GetYAMLFn,
  applyYAML: ApplyYAMLFn,
  refresh: RefreshFn,
  setState: StateSetters
) {
  return {
    open: async (kind: string, name: string, clusterScoped: boolean, namespace?: string) => {
      setState.setYaml(null)
      setState.setError(null)
      setState.setLoading(true)
      try {
        const content = await getYAML(kind, name, clusterScoped, namespace)
        setState.setYaml(content)
      } catch (err) {
        setState.setError((err as Error)?.message ?? 'Failed to fetch YAML')
      } finally {
        setState.setLoading(false)
      }
    },
    apply: async (newYaml: string) => {
      await applyYAML(newYaml)
      refresh()
      setState.setYaml(null)
    },
    close: () => setState.setYaml(null),
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

  const { open, apply, close } = _createYAMLEditorHandlers(
    getYAML, applyYAML, refresh,
    { setYaml, setLoading, setError }
  )

  return { yaml, loading, error, open, apply, close }
}
