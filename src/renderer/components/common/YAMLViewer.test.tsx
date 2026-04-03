// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
import YAMLViewer from './YAMLViewer'

// ── store mock ─────────────────────────────────────────────────────────────────
vi.mock('../../store', () => ({
  useAppStore: (sel?: (s: any) => any) => {
    const state = { theme: 'dark', isProduction: false }
    return sel ? sel(state) : state
  },
}))

// Monaco and YAMLEditor are heavy — stub them out
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }: { value: string }) => <textarea data-testid="editor" defaultValue={value} />,
  DiffEditor: () => <div data-testid="diff-editor" />,
}))
vi.mock('./YAMLEditor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="editor" value={value} onChange={e => onChange(e.target.value)} />
  ),
}))

const YAML_CONTENT = `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-cm
data:
  key: value`

describe('YAMLViewer — read-only mode', () => {
  it('renders without onSave prop (no Apply button)', () => {
    render(<YAMLViewer content={YAML_CONTENT} />)
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull()
  })

  it('Copy button writes to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<YAMLViewer content={YAML_CONTENT} />)
    // Use getAllByRole in case the toolbar has multiple copy-labelled elements
    const copyBtns = screen.getAllByRole('button', { name: /copy/i })
    fireEvent.click(copyBtns[0])

    expect(writeText).toHaveBeenCalledWith(YAML_CONTENT)
  })
})

describe('YAMLViewer — editable mode', () => {
  it('calls onSave with current content when Apply clicked', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<YAMLViewer content={YAML_CONTENT} editable onSave={onSave} />)

    fireEvent.click(screen.getAllByRole('button', { name: /apply/i })[0])

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(YAML_CONTENT)
    })
  })

  it('shows success message after successful save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<YAMLViewer content={YAML_CONTENT} editable onSave={onSave} />)

    fireEvent.click(screen.getAllByRole('button', { name: /apply/i })[0])

    await waitFor(() => {
      expect(screen.getByText(/APPLIED!/i)).toBeTruthy()
    })
  })

  it('shows amber immutable-field banner for 422/immutable errors', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('pod spec fields are immutable after creation'))
    render(<YAMLViewer content={YAML_CONTENT} editable onSave={onSave} />)

    fireEvent.click(screen.getAllByRole('button', { name: /apply/i })[0])

    await waitFor(() => {
      // The banner <p> contains the full friendly message
      expect(screen.getByText(/Edit the parent Deployment or StatefulSet instead/i)).toBeTruthy()
    })
  })

  it('shows red generic error banner for non-immutable errors', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('insufficient permissions'))
    render(<YAMLViewer content={YAML_CONTENT} editable onSave={onSave} />)

    fireEvent.click(screen.getAllByRole('button', { name: /apply/i })[0])

    await waitFor(() => {
      expect(screen.getByText('insufficient permissions')).toBeTruthy()
    })
  })

  it('dismisses error banner when X clicked', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('insufficient permissions'))
    render(<YAMLViewer content={YAML_CONTENT} editable onSave={onSave} />)

    fireEvent.click(screen.getAllByRole('button', { name: /apply/i })[0])
    await waitFor(() => screen.getByText('insufficient permissions'))

    // Find and click the dismiss button (×)
    const dismissBtn = screen.getByTitle('Dismiss')
    fireEvent.click(dismissBtn)

    await waitFor(() => {
      expect(screen.queryByText('insufficient permissions')).toBeNull()
    })
  })
})

describe('YAMLViewer — production mode', () => {
  it('calls onSave directly in non-production mode (smoke test)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<YAMLViewer content={YAML_CONTENT} editable onSave={onSave} />)
    fireEvent.click(screen.getAllByRole('button', { name: /apply/i })[0])
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  })
})
