import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { spawn } from 'child_process'
import { EventEmitter } from 'events'

vi.mock('fs', () => ({ existsSync: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('child_process', () => ({ spawn: vi.fn() }))

// Import after mocks
const { detectKrew } = await import('./krew')

function makeFakeProcess(stdout: string[], stderr: string[], exitCode: number) {
  const proc = new EventEmitter() as any
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  process.nextTick(() => {
    for (const line of stdout) proc.stdout.emit('data', Buffer.from(line))
    for (const line of stderr) proc.stderr.emit('data', Buffer.from(line))
    proc.emit('close', exitCode)
  })
  return proc
}

describe('detectKrew', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns true when kubectl-krew binary exists', () => {
    vi.mocked(existsSync).mockReturnValue(true)
    expect(detectKrew()).toBe(true)
    expect(existsSync).toHaveBeenCalledWith(
      join(homedir(), '.krew', 'bin', 'kubectl-krew')
    )
  })

  it('returns false when kubectl-krew binary is absent', () => {
    vi.mocked(existsSync).mockReturnValue(false)
    expect(detectKrew()).toBe(false)
  })

  it('returns false on Windows regardless of file existence', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    vi.mocked(existsSync).mockReturnValue(true)
    expect(detectKrew()).toBe(false)
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })
})

describe('installKrew', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('resolves with success:true when installer exits 0', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeProcess(['Installing krew...\n'], [], 0) as any)
    const { installKrew } = await import('./krew')
    const lines: string[] = []
    const result = await installKrew((line) => lines.push(line))
    expect(result.success).toBe(true)
    expect(lines).toContain('Installing krew...')
  })

  it('resolves with success:false and error message when installer exits non-zero', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeProcess([], ['curl: command not found\n'], 1) as any)
    const { installKrew } = await import('./krew')
    const result = await installKrew(() => {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('curl: command not found')
  })

  it('returns unsupported:true on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    const { installKrew } = await import('./krew')
    const result = await installKrew(() => {})
    expect(result.unsupported).toBe(true)
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
  })
})
