import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
}))

vi.mock('../sidecar/api', () => ({
    sidecarFetch: vi.fn(),
}))

import { auditLogToJSON, auditLogToCSV, listAuditChainFiles } from './audit'

describe('audit export conversion', () => {
    let dir: string
    let logPath: string

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'podscape-audit-test-'))
        logPath = join(dir, 'audit.log')
    })

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true })
    })

    it('converts a JSONL file to a JSON array', () => {
        const line1 = JSON.stringify({ seq: 1, action: 'scale', outcome: 'success', params: { replicas_to: 5 } })
        const line2 = JSON.stringify({ seq: 2, action: 'delete', outcome: 'success', params: {} })
        writeFileSync(logPath, `${line1}\n${line2}\n`)

        const result = auditLogToJSON(dir)
        const parsed = JSON.parse(result)
        expect(Array.isArray(parsed)).toBe(true)
        expect(parsed).toHaveLength(2)
        expect(parsed[0].action).toBe('scale')
        expect(parsed[1].action).toBe('delete')
    })

    it('returns an empty JSON array for a missing directory', () => {
        const result = auditLogToJSON(join(dir, 'does-not-exist'))
        expect(JSON.parse(result)).toEqual([])
    })

    it('converts a JSONL file to CSV with a header row and params as a JSON string column', () => {
        const line = JSON.stringify({
            seq: 1, timestamp: '2026-09-25T12:00:00Z', action: 'scale', kube_context: 'minikube',
            kube_user: 'minikube', kube_client_cert_cn: '', os_user: 'ajeet', namespace: 'default',
            resource_kind: 'Deployment', resource_name: 'api', params: { replicas_to: 5 },
            outcome: 'success', error: '', duration_ms: 42, prev_hash: 'genesis', hash: 'abc123',
        })
        writeFileSync(logPath, `${line}\n`)

        const csv = auditLogToCSV(dir)
        const rows = csv.trim().split('\n')
        expect(rows).toHaveLength(2) // header + 1 data row
        expect(rows[0]).toContain('action')
        expect(rows[0]).toContain('resource_name')
        expect(rows[1]).toContain('scale')
        expect(rows[1]).toContain('api')
        expect(rows[1]).toContain('replicas_to') // params serialized as a JSON string column
    })

    it('spans rotated archive files and the active file, oldest first', () => {
        const archive = join(dir, 'audit-20200101T000000Z.log')
        writeFileSync(archive, JSON.stringify({ seq: 1, action: 'archived-action', outcome: 'success', params: {} }) + '\n')
        writeFileSync(logPath, JSON.stringify({ seq: 1, action: 'active-action', outcome: 'success', params: {} }) + '\n')

        const files = listAuditChainFiles(dir)
        expect(files).toEqual([archive, logPath])

        const parsed = JSON.parse(auditLogToJSON(dir))
        expect(parsed).toHaveLength(2)
        expect(parsed[0].action).toBe('archived-action')
        expect(parsed[1].action).toBe('active-action')
    })

    it('skips a malformed trailing line instead of throwing', () => {
        const good = JSON.stringify({ seq: 1, action: 'scale', outcome: 'success', params: {} })
        writeFileSync(logPath, `${good}\nnot valid json\n`)

        const parsed = JSON.parse(auditLogToJSON(dir))
        expect(parsed).toHaveLength(1)
        expect(parsed[0].action).toBe('scale')
    })
})
