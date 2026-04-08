// @vitest-environment jsdom
import React from 'react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import { render, fireEvent, screen, waitFor, act, cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)

afterEach(() => cleanup())

// UnifiedLogs.tsx imports useAppStore, which creates the Zustand store on
// module load and immediately calls localStorage.getItem. Mock the store
// module so the import doesn't trigger real store initialization.
vi.mock('../../store', () => ({ useAppStore: vi.fn() }))

import { useAppStore } from '../../store'
import UnifiedLogs, { shouldResetStreaming, escapeRegExp } from './UnifiedLogs'

// ── shouldResetStreaming ────────────────────────────────────────────────────
// Guards the fix for "isStreaming stuck when all streamLogs calls throw":
// if no streams were started (streamIds is empty), isStreaming must reset to false.

describe('shouldResetStreaming', () => {
    it('returns true when streamIds is empty (all pods failed to stream)', () => {
        expect(shouldResetStreaming({})).toBe(true)
    })

    it('returns false when at least one stream is active', () => {
        expect(shouldResetStreaming({ 'my-pod': 'sid-1' })).toBe(false)
    })

    it('returns false when multiple streams are active', () => {
        expect(shouldResetStreaming({ 'pod-a': 'sid-1', 'pod-b': 'sid-2' })).toBe(false)
    })
})

// ── escapeRegExp ────────────────────────────────────────────────────────────
// Guards the fix for "searchTerm with regex special characters crashes the
// log-highlight split (new RegExp(searchTerm) throws or produces wrong results)".

describe('escapeRegExp', () => {
    it('escapes dot so it matches a literal dot, not any character', () => {
        const re = new RegExp(escapeRegExp('.'))
        expect(re.test('hello')).toBe(false)
        expect(re.test('hel.o')).toBe(true)
    })

    it('escapes asterisk', () => {
        const re = new RegExp(escapeRegExp('a*'))
        expect(re.test('aaa')).toBe(false)
        expect(re.test('a*')).toBe(true)
    })

    it('escapes square brackets', () => {
        const re = new RegExp(escapeRegExp('[abc]'))
        expect(re.test('a')).toBe(false)
        expect(re.test('[abc]')).toBe(true)
    })

    it('escapes all regex metacharacters without throwing', () => {
        const dangerous = '.*+?^${}()|[]\\'
        expect(() => new RegExp(escapeRegExp(dangerous))).not.toThrow()
    })

    it('leaves normal text unchanged', () => {
        expect(escapeRegExp('hello world')).toBe('hello world')
    })

    it('allows case-insensitive match after escaping', () => {
        const re = new RegExp(`(${escapeRegExp('error')})`, 'gi')
        const parts = 'An ERROR occurred'.split(re)
        expect(parts).toContain('ERROR')
    })
})

describe('UnifiedLogs stream lifecycle', () => {
  it('sets streaming false when the last stream ends naturally', async () => {
    const pods = [
      {
        metadata: { name: 'pod-a', uid: 'pod-a-uid', namespace: 'default' },
        status: { phase: 'Running' },
        spec: { containers: [{ name: 'c-a' }] },
      },
    ] as any

    ;(useAppStore as any).mockReturnValue({
      pods,
      selectedContext: 'ctx-1',
      selectedNamespace: 'default',
      loadSection: vi.fn(),
    })

    let capturedOnEnd: (() => void) | null = null
    const streamLogsMock = vi.fn(
      async (
        _ctx: string,
        _ns: string,
        _pod: string,
        _container: string,
        _onChunk: (chunk: string) => void,
        onEnd: () => void,
      ) => {
        capturedOnEnd = onEnd
        return 'sid-1'
      },
    )

    ;(window as any).kubectl = {
      streamLogs: streamLogsMock,
      stopLogs: vi.fn().mockResolvedValue(undefined),
    }

    render(React.createElement(UnifiedLogs))

    const addPodInput = screen.getByPlaceholderText('Add pods to stream...') as HTMLInputElement
    fireEvent.change(addPodInput, { target: { value: 'pod-a' } })

    // Click the search result for the pod.
    const podButton = screen.getByText('pod-a').closest('button') as HTMLButtonElement
    fireEvent.click(podButton)

    const startButton = screen.getByText('Start Stream').closest('button') as HTMLButtonElement
    expect(startButton.disabled).toBe(false)

    fireEvent.click(startButton)
    expect(screen.getByText('Stop All')).toBeInTheDocument()

    expect(capturedOnEnd).not.toBeNull()
    // Give `startStreaming()` a chance to complete its `await streamLogs(...)`
    // so the `sid` referenced in `onEnd` is initialized.
    await Promise.resolve()
    act(() => {
      capturedOnEnd?.()
    })

    await waitFor(() => {
      expect(screen.getByText('Start Stream')).toBeInTheDocument()
    })
  })

  it('clears buffered logs when Clear Logs is clicked', async () => {
    vi.useFakeTimers()

    const pods = [
      {
        metadata: { name: 'pod-a', uid: 'pod-a-uid', namespace: 'default' },
        status: { phase: 'Running' },
        spec: { containers: [{ name: 'c-a' }] },
      },
    ] as any

    ;(useAppStore as any).mockReturnValue({
      pods,
      selectedContext: 'ctx-1',
      selectedNamespace: 'default',
      loadSection: vi.fn(),
    })

    let capturedOnChunk: ((chunk: string) => void) | null = null
    let capturedOnEnd: (() => void) | null = null

    const streamLogsMock = vi.fn(
      async (
        _ctx: string,
        _ns: string,
        _pod: string,
        _container: string,
        onChunk: (chunk: string) => void,
        onEnd: () => void,
      ) => {
        capturedOnChunk = onChunk
        capturedOnEnd = onEnd
        return 'sid-1'
      },
    )

    ;(window as any).kubectl = {
      streamLogs: streamLogsMock,
      stopLogs: vi.fn().mockResolvedValue(undefined),
    }

    render(React.createElement(UnifiedLogs))

    const addPodInput = screen.getByPlaceholderText('Add pods to stream...') as HTMLInputElement
    fireEvent.change(addPodInput, { target: { value: 'pod-a' } })
    const podButton = screen.getByText('pod-a').closest('button') as HTMLButtonElement
    fireEvent.click(podButton)

    const startButton = screen.getByText('Start Stream').closest('button') as HTMLButtonElement
    fireEvent.click(startButton)
    expect(screen.getByText('Stop All')).toBeInTheDocument()

    // Emit one log line into the buffer.
    expect(capturedOnChunk).not.toBeNull()
    // Give `startStreaming()` a chance to complete its `await streamLogs(...)`
    // so `sid` referenced in the `onChunk` closure is initialized.
    await Promise.resolve()
    act(() => {
      capturedOnChunk?.('hello world\n')
    })

    // Let `useLogBuffer` flush (flushIntervalMs = 100 in UnifiedLogs).
    act(() => {
      vi.advanceTimersByTime(120)
    })

    expect(screen.getByText('hello world')).toBeInTheDocument()

    // Clear the logs UI.
    const clearButton = screen.getByTitle('Clear Logs')
    act(() => {
      fireEvent.click(clearButton)
    })
    // Allow `useAutoScroll`'s ignore window timer (50ms) to settle.
    act(() => {
      vi.advanceTimersByTime(60)
    })

    expect(screen.getByText('Stream Pending')).toBeInTheDocument()

    // Avoid leaking fake timers to other tests.
    vi.useRealTimers()

    // Silence unused capture.
    void capturedOnEnd
  })
})
