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

describe('registerKrewHandlers', () => {
  it('registers krew:detect and krew:install handlers', async () => {
    const { ipcMain } = await import('electron')
    const { registerKrewHandlers } = await import('./krew')
    registerKrewHandlers()
    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith('krew:detect', expect.any(Function))
    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith('krew:install', expect.any(Function))
    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith('krew:search', expect.any(Function))
    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith('krew:installed', expect.any(Function))
    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith('krew:update', expect.any(Function))
    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith('krew:upgrade-all', expect.any(Function))
    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith('krew:install-plugin', expect.any(Function))
    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith('krew:uninstall', expect.any(Function))
    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith('krew:run-plugin', expect.any(Function))
  })
})

describe('runKrewJson', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

  it('resolves with parsed JSON output for krew search', async () => {
    const fakeJson = JSON.stringify([{ name: 'ctx', version: '0.9.5', short: 'Switch contexts' }])
    vi.mocked(spawn).mockReturnValue(makeFakeProcess([fakeJson], [], 0) as any)
    const { runKrewJson } = await import('./krew')
    const result = await runKrewJson(['search', '--output=json'])
    expect(result).toEqual([{ name: 'ctx', version: '0.9.5', short: 'Switch contexts' }])
  })

  it('throws when krew exits non-zero', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeProcess([], ['plugin not found'], 1) as any)
    const { runKrewJson } = await import('./krew')
    await expect(runKrewJson(['install', 'missing'])).rejects.toThrow('plugin not found')
  })

  it('returns [] for empty output', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeProcess([''], [], 0) as any)
    const { runKrewJson } = await import('./krew')
    const result = await runKrewJson(['list', '--output=json'])
    expect(Array.isArray(result)).toBe(true)
  })

  it('returns [] when output is not valid JSON', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeProcess(['plain text output\n'], [], 0) as any)
    const { runKrewJson } = await import('./krew')
    const result = await runKrewJson(['list', '--output=json'])
    expect(result).toEqual([])
  })

  it('rejects when spawn emits error event', async () => {
    const proc = new EventEmitter() as any
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    process.nextTick(() => proc.emit('error', new Error('ENOENT: no such file')))
    vi.mocked(spawn).mockReturnValue(proc)
    const { runKrewJson } = await import('./krew')
    await expect(runKrewJson(['list'])).rejects.toThrow('ENOENT')
  })
})

describe('runKrewAction', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

  it('calls kubectl krew install <name> and resolves {ok:true}', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeProcess(['Installing ctx...\n'], [], 0) as any)
    const { runKrewAction } = await import('./krew')
    const result = await runKrewAction('install', 'ctx')
    expect(result).toEqual({ ok: true })
    expect(spawn).toHaveBeenCalledWith('kubectl', ['krew', 'install', 'ctx'], expect.any(Object))
  })

  it('calls kubectl krew uninstall <name>', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeProcess([], [], 0) as any)
    const { runKrewAction } = await import('./krew')
    await runKrewAction('uninstall', 'ctx')
    expect(spawn).toHaveBeenCalledWith('kubectl', ['krew', 'uninstall', 'ctx'], expect.any(Object))
  })

  it('rejects with stderr on non-zero exit', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeProcess([], ['already installed\n'], 1) as any)
    const { runKrewAction } = await import('./krew')
    await expect(runKrewAction('install', 'ctx')).rejects.toThrow('already installed')
  })

  it('rejects on spawn error', async () => {
    const { EventEmitter } = await import('events')
    const proc = new EventEmitter() as any
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    process.nextTick(() => proc.emit('error', new Error('ENOENT: kubectl not found')))
    vi.mocked(spawn).mockReturnValue(proc)
    const { runKrewAction } = await import('./krew')
    await expect(runKrewAction('install', 'ctx')).rejects.toThrow('ENOENT')
  })
})

describe('runPlugin', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

  it('streams stdout lines to onLine callback', async () => {
    vi.mocked(spawn).mockReturnValue(
      makeFakeProcess(['line1\nline2\n'], [], 0) as any
    )
    const { runPlugin } = await import('./krew')
    const lines: string[] = []
    const result = await runPlugin('ctx', [], (line) => lines.push(line))
    expect(lines).toContain('line1')
    expect(lines).toContain('line2')
    expect(result.exitCode).toBe(0)
  })

  it('prefixes stderr lines with [stderr]', async () => {
    vi.mocked(spawn).mockReturnValue(
      makeFakeProcess([], ['error msg\n'], 1) as any
    )
    const { runPlugin } = await import('./krew')
    const lines: string[] = []
    await runPlugin('ctx', [], (line) => lines.push(line))
    expect(lines.some(l => l.startsWith('[stderr]'))).toBe(true)
  })

  it('truncates output at MAX_PLUGIN_OUTPUT_LINES', async () => {
    const manyLines = Array.from({ length: 10005 }, (_, i) => `line${i}`).join('\n') + '\n'
    vi.mocked(spawn).mockReturnValue(
      makeFakeProcess([manyLines], [], 0) as any
    )
    const { runPlugin, MAX_PLUGIN_OUTPUT_LINES } = await import('./krew')
    const lines: string[] = []
    await runPlugin('ctx', [], (line) => lines.push(line))
    expect(lines.length).toBeLessThanOrEqual(MAX_PLUGIN_OUTPUT_LINES + 1) // +1 for truncation notice
    expect(lines.some(l => l.includes('truncated'))).toBe(true)
  })

  it('spawns kubectl <pluginName> with args', async () => {
    vi.mocked(spawn).mockReturnValue(makeFakeProcess([], [], 0) as any)
    const { runPlugin } = await import('./krew')
    await runPlugin('ns', ['--namespace', 'default'], () => {})
    expect(spawn).toHaveBeenCalledWith('kubectl', ['ns', '--namespace', 'default'], expect.any(Object))
  })
})
