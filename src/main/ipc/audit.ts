import { ipcMain } from 'electron'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { sidecarFetch } from '../sidecar/api'

const AUDIT_DIR = join(homedir(), '.podscape')

interface AuditEntry {
    [key: string]: unknown
}

/**
 * Lists the full chronological chain of audit log files in dir: archived
 * files (audit-<timestamp>.log) sorted oldest-first, followed by the
 * active audit.log if present. Mirrors go-core/internal/audit's
 * listChainFiles so export covers the same entries the viewer shows.
 * Exported for unit testing independently of Electron.
 */
export function listAuditChainFiles(dir: string): string[] {
    if (!existsSync(dir)) return []
    const names = readdirSync(dir)
    const archives = names.filter(n => n.startsWith('audit-') && n.endsWith('.log')).sort()
    const files = archives.map(n => join(dir, n))
    if (names.includes('audit.log')) files.push(join(dir, 'audit.log'))
    return files
}

function readAuditEntries(dir: string): AuditEntry[] {
    const entries: AuditEntry[] = []
    for (const path of listAuditChainFiles(dir)) {
        const raw = readFileSync(path, 'utf-8')
        for (const line of raw.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed) continue
            try {
                entries.push(JSON.parse(trimmed) as AuditEntry)
            } catch {
                // Skip a malformed/partial trailing line (e.g. left by a crash
                // mid-write) — same tolerance the Go reader applies.
            }
        }
    }
    return entries
}

/** Exported for unit testing independently of Electron. */
export function auditLogToJSON(dir: string): string {
    return JSON.stringify(readAuditEntries(dir), null, 2)
}

// Fixed column order matching the Event struct's field order in
// go-core/internal/audit/audit.go, so the exported CSV reads the same way
// the JSONL file does.
const CSV_COLUMNS = [
    'seq', 'timestamp', 'action', 'kube_context', 'kube_user', 'kube_client_cert_cn',
    'os_user', 'namespace', 'resource_kind', 'resource_name', 'params', 'outcome',
    'error', 'duration_ms', 'prev_hash', 'hash',
]

function csvEscape(value: unknown): string {
    const s = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
}

/** Exported for unit testing independently of Electron. */
export function auditLogToCSV(dir: string): string {
    const entries = readAuditEntries(dir)
    const lines = [CSV_COLUMNS.join(',')]
    for (const entry of entries) {
        lines.push(CSV_COLUMNS.map(col => csvEscape(entry[col])).join(','))
    }
    return lines.join('\n') + '\n'
}

export interface AuditListOptions {
    action?: string
    outcome?: string
    limit?: number
}

export function registerAuditHandlers(): void {
    /** Reads the full audit log chain (active + archives), converts to the requested format, and writes it to savePath. */
    ipcMain.handle('audit:export', async (_e, format: 'json' | 'csv', savePath: string) => {
        const content = format === 'csv' ? auditLogToCSV(AUDIT_DIR) : auditLogToJSON(AUDIT_DIR)
        writeFileSync(savePath, content, 'utf-8')
    })

    /** Lists audit log entries via the sidecar (newest first), with optional action/outcome filters and a limit. */
    ipcMain.handle('audit:list', async (_e, opts?: AuditListOptions) => {
        const params = new URLSearchParams()
        if (opts?.action) params.set('action', opts.action)
        if (opts?.outcome) params.set('outcome', opts.outcome)
        if (opts?.limit) params.set('limit', String(opts.limit))
        const qs = params.toString()
        const res = await sidecarFetch(`/audit${qs ? '?' + qs : ''}`)
        if (res.ok) return await res.json()
        return []
    })
}
