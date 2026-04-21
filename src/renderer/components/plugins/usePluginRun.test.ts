// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Wire up window.krew mock directly on the real jsdom window,
// so @testing-library/react renderHook can use the real DOM APIs.
const krewMock = {
    detect: vi.fn().mockResolvedValue({ available: false, unsupported: false }),
    install: vi.fn(),
    onInstallProgress: vi.fn(() => vi.fn()),
    search: vi.fn().mockResolvedValue([]),
    installed: vi.fn().mockResolvedValue([]),
    installPlugin: vi.fn().mockResolvedValue({ ok: true }),
    uninstallPlugin: vi.fn().mockResolvedValue({ ok: true }),
    update: vi.fn().mockResolvedValue({ ok: true }),
    upgradeAll: vi.fn().mockResolvedValue({ ok: true }),
    runPlugin: vi.fn().mockResolvedValue({ exitCode: 0 }),
    onPluginOutput: vi.fn(() => vi.fn()),
}

;(window as unknown as Record<string, unknown>).krew = krewMock

import { renderHook, act } from '@testing-library/react'
import { usePluginRun } from './usePluginRun'

describe('usePluginRun', () => {
    beforeEach(() => { vi.clearAllMocks() })

    it('run() calls runPlugin with correct args', async () => {
        krewMock.runPlugin.mockResolvedValue({ exitCode: 0 })
        krewMock.onPluginOutput.mockReturnValue(() => {})
        const { result } = renderHook(() => usePluginRun())
        await act(async () => { await result.current.run('whoami', []) })
        expect(krewMock.runPlugin).toHaveBeenCalledWith('whoami', [])
    })

    it('run() collects output lines via onPluginOutput', async () => {
        let capturedCb: ((line: string) => void) | null = null
        krewMock.onPluginOutput.mockImplementation((cb: (line: string) => void) => {
            capturedCb = cb
            return () => {}
        })
        krewMock.runPlugin.mockImplementation(async () => {
            capturedCb?.('line one')
            capturedCb?.('line two')
            return { exitCode: 0 }
        })
        const { result } = renderHook(() => usePluginRun())
        await act(async () => { await result.current.run('whoami', []) })
        expect(result.current.lines).toEqual(['line one', 'line two'])
    })

    it('running is true during execution and false after', async () => {
        let resolveRun!: () => void
        krewMock.onPluginOutput.mockReturnValue(() => {})
        krewMock.runPlugin.mockReturnValue(new Promise(res => { resolveRun = () => res({ exitCode: 0 }) }))
        const { result } = renderHook(() => usePluginRun())
        act(() => { void result.current.run('whoami', []) })
        expect(result.current.running).toBe(true)
        await act(async () => { resolveRun() })
        expect(result.current.running).toBe(false)
    })

    it('exitCode is set after run completes', async () => {
        krewMock.onPluginOutput.mockReturnValue(() => {})
        krewMock.runPlugin.mockResolvedValue({ exitCode: 1 })
        const { result } = renderHook(() => usePluginRun())
        await act(async () => { await result.current.run('whoami', []) })
        expect(result.current.exitCode).toBe(1)
    })
})
