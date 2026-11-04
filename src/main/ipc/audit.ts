import { ipcMain } from 'electron'
import { writeFileSync } from 'fs'
import { sidecarFetch } from '../sidecar/api'

interface AuditEntry {
    [key: string]: unknown
}

/** Exported for unit testing independently of Electron. */
export function auditLogToJSON(entries: AuditEntry[]): string {
    return JSON.stringify(entries, null, 2)
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
    let s = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')
    // Neutralize spreadsheet formula injection: a leading =, +, -, @, or a
    // tab/CR makes Excel/Sheets execute the cell. Prefix with a single quote
    // so the value is shown literally instead of evaluated.
    if (/^[=+\-@\t\r]/.test(s)) {
        s = "'" + s
    }
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
}

/** Exported for unit testing independently of Electron. */
export function auditLogToCSV(entries: AuditEntry[]): string {
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

// fetchAuditEntries reads audit entries from the sidecar — the single source
// of truth for walking the hash-chained log (file ordering, malformed-line
// and concurrent-rotation tolerance all live in go-core/internal/audit).
// limit=0 asks the sidecar for the full chain (used by export).
async function fetchAuditEntries(opts?: AuditListOptions): Promise<AuditEntry[]> {
    const params = new URLSearchParams()
    if (opts?.action) params.set('action', opts.action)
    if (opts?.outcome) params.set('outcome', opts.outcome)
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit))
    const qs = params.toString()
    const res = await sidecarFetch(`/audit${qs ? '?' + qs : ''}`)
    if (res.ok) return await res.json()
    return []
}

export function registerAuditHandlers(): void {
    /** Reads the full audit log chain via the sidecar, converts to the requested format, and writes it to savePath. */
    ipcMain.handle('audit:export', async (_e, format: 'json' | 'csv', savePath: string) => {
        // limit=0 => the full chain, newest-first; reverse to chronological
        // (oldest-first) so the export reads in the same order as the log file.
        const entries = await fetchAuditEntries({ limit: 0 })
        entries.reverse()
        const content = format === 'csv' ? auditLogToCSV(entries) : auditLogToJSON(entries)
        writeFileSync(savePath, content, 'utf-8')
    })

    /** Lists audit log entries via the sidecar (newest first), with optional action/outcome filters and a limit. */
    ipcMain.handle('audit:list', async (_e, opts?: AuditListOptions) => fetchAuditEntries(opts))
}
