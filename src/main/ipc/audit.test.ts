import { describe, it, expect, vi, beforeEach } from 'vitest'

const { sidecarFetchMock, writeFileSyncMock } = vi.hoisted(() => ({
    sidecarFetchMock: vi.fn(),
    writeFileSyncMock: vi.fn(),
}))

vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
}))
vi.mock('../sidecar/api', () => ({ sidecarFetch: sidecarFetchMock }))
vi.mock('fs', () => ({ writeFileSync: writeFileSyncMock }))

import { ipcMain } from 'electron'
import { auditLogToJSON, auditLogToCSV, registerAuditHandlers } from './audit'

describe('audit export formatting', () => {
    it('converts an entries array to a JSON array string', () => {
        const entries = [
            { seq: 1, action: 'scale', outcome: 'success', params: { replicas_to: 5 } },
            { seq: 2, action: 'delete', outcome: 'success', params: {} },
        ]
        const parsed = JSON.parse(auditLogToJSON(entries))
        expect(Array.isArray(parsed)).toBe(true)
        expect(parsed).toHaveLength(2)
        expect(parsed[0].action).toBe('scale')
        expect(parsed[1].action).toBe('delete')
    })

    it('converts entries to CSV with a header row and params as a JSON string column', () => {
        const entries = [{
            seq: 1, timestamp: '2026-09-25T12:00:00Z', action: 'scale', kube_context: 'minikube',
            kube_user: 'minikube', kube_client_cert_cn: '', os_user: 'ajeet', namespace: 'default',
            resource_kind: 'Deployment', resource_name: 'api', params: { replicas_to: 5 },
            outcome: 'success', error: '', duration_ms: 42, prev_hash: 'genesis', hash: 'abc123',
        }]
        const rows = auditLogToCSV(entries).trim().split('\n')
        expect(rows).toHaveLength(2) // header + 1 data row
        expect(rows[0]).toContain('action')
        expect(rows[0]).toContain('resource_name')
        expect(rows[1]).toContain('scale')
        expect(rows[1]).toContain('api')
        expect(rows[1]).toContain('replicas_to') // params serialized as a JSON string column
    })

    it('quotes a CSV field containing a comma', () => {
        const csv = auditLogToCSV([{ action: 'exec_start', error: 'bad, very bad' }])
        expect(csv).toContain('"bad, very bad"')
    })
})

describe('audit:export handler', () => {
    function exportHandler(): (e: unknown, format: 'json' | 'csv', savePath: string) => Promise<void> {
        registerAuditHandlers()
        const call = (ipcMain.handle as unknown as { mock: { calls: unknown[][] } }).mock.calls
            .find(c => c[0] === 'audit:export')
        if (!call) throw new Error('audit:export handler was not registered')
        return call[1] as never
    }

    beforeEach(() => {
        sidecarFetchMock.mockReset()
        writeFileSyncMock.mockReset()
        ;(ipcMain.handle as unknown as { mockReset: () => void }).mockReset()
    })

    it('fetches the full chain from the sidecar (limit=0) and writes it oldest-first', async () => {
        // Sidecar returns newest-first; export should reverse to chronological.
        sidecarFetchMock.mockResolvedValue({
            ok: true,
            json: async () => [
                { seq: 2, action: 'delete' },
                { seq: 1, action: 'scale' },
            ],
        })

        await exportHandler()(null, 'json', '/tmp/out.json')

        expect(sidecarFetchMock).toHaveBeenCalledWith('/audit?limit=0')
        const [savePath, content] = writeFileSyncMock.mock.calls[0]
        expect(savePath).toBe('/tmp/out.json')
        const parsed = JSON.parse(content)
        expect(parsed.map((e: { action: string }) => e.action)).toEqual(['scale', 'delete'])
    })

    it('writes an empty JSON array when the sidecar call fails', async () => {
        sidecarFetchMock.mockResolvedValue({ ok: false, json: async () => [] })
        await exportHandler()(null, 'json', '/tmp/out.json')
        const [, content] = writeFileSyncMock.mock.calls[0]
        expect(JSON.parse(content)).toEqual([])
    })
})
