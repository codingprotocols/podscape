import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('./auth', () => ({ sidecarToken: 'test-token' }))
vi.mock('./runtime', () => ({ activeSidecarPort: 5050 }))

// Import after mocks are set up
import { sidecarFetch } from './api'

describe('sidecarFetch', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('returns response on first successful fetch', async () => {
        const mockResponse = new Response('ok', { status: 200 })
        global.fetch = vi.fn().mockResolvedValueOnce(mockResponse)

        const result = await sidecarFetch('/health')
        expect(result.status).toBe(200)
        expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('attaches auth header on every request', async () => {
        global.fetch = vi.fn().mockResolvedValueOnce(new Response('ok', { status: 200 }))

        await sidecarFetch('/health')
        const calledWith = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
        expect((calledWith.headers as Record<string, string>)['X-Podscape-Token']).toBe('test-token')
    })

    it('throws immediately on a non-ECONNREFUSED error (no retries)', async () => {
        const hardError = new Error('TLS handshake failed')
        global.fetch = vi.fn().mockRejectedValue(hardError)

        await expect(sidecarFetch('/health')).rejects.toThrow('TLS handshake failed')
        // Should not retry — only one attempt
        expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('retries on ECONNREFUSED (err.code)', async () => {
        const connRefused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5050'), { code: 'ECONNREFUSED' })
        const okResponse = new Response('ok', { status: 200 })

        global.fetch = vi.fn()
            .mockRejectedValueOnce(connRefused)
            .mockResolvedValueOnce(okResponse)

        const promise = sidecarFetch('/health')
        // Advance past the 500ms retry delay
        await vi.runAllTimersAsync()
        const result = await promise

        expect(result.status).toBe(200)
        expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('retries on ECONNREFUSED in err.cause.code', async () => {
        const causeErr = Object.assign(new Error('fetch failed'), {
            cause: { code: 'ECONNREFUSED' },
        })
        const okResponse = new Response('ok', { status: 200 })

        global.fetch = vi.fn()
            .mockRejectedValueOnce(causeErr)
            .mockResolvedValueOnce(okResponse)

        const promise = sidecarFetch('/health')
        await vi.runAllTimersAsync()
        const result = await promise

        expect(result.status).toBe(200)
        expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('retries on ECONNREFUSED in err.message', async () => {
        const msgErr = new Error('connect ECONNREFUSED 127.0.0.1:5050')
        const okResponse = new Response('ok', { status: 200 })

        global.fetch = vi.fn()
            .mockRejectedValueOnce(msgErr)
            .mockResolvedValueOnce(okResponse)

        const promise = sidecarFetch('/health')
        await vi.runAllTimersAsync()
        const result = await promise

        expect(result.status).toBe(200)
        expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('throws after exhausting all retries on persistent ECONNREFUSED', async () => {
        const connRefused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5050'), { code: 'ECONNREFUSED' })
        global.fetch = vi.fn().mockImplementation(() => Promise.reject(connRefused))

        // Attach the rejection handler BEFORE running timers so the promise is
        // never unhandled during the async timer advancement.
        const rejectCheck = expect(sidecarFetch('/health')).rejects.toThrow('ECONNREFUSED')
        await vi.runAllTimersAsync()
        await rejectCheck

        expect(global.fetch).toHaveBeenCalledTimes(20) // maxRetries
    })
})
