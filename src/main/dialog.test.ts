import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock electron before importing dialog
vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
    dialog: {
        showOpenDialog: vi.fn(),
        showSaveDialog: vi.fn(),
    },
    BrowserWindow: {
        getFocusedWindow: vi.fn(() => null),
        getAllWindows: vi.fn(() => [{}]),
    },
}))

// Mock electron before importing kubectl
vi.mock('./settings_storage', () => ({ getSettings: () => ({ kubectlPath: '', shellPath: '', theme: 'dark', kubeconfigPath: '' }) }))
vi.mock('./env', () => ({ getAugmentedEnv: () => ({}) }))

const execFileMock = vi.fn()
vi.mock('child_process', () => ({
    execFile: (...args: unknown[]) => execFileMock(...args),
    spawn: vi.fn(),
}))

vi.mock('fs', async (importActual) => {
    const actual = await importActual<typeof import('fs')>()
    return { ...actual, existsSync: () => false }
})

import { validateRemotePath } from './dialog'
import { KubectlProvider } from './kubectl'

// ─── validateRemotePath ───────────────────────────────────────────────────────

describe('validateRemotePath', () => {
    it('accepts a valid absolute path', () => {
        expect(validateRemotePath('/tmp/file.txt')).toBeNull()
    })

    it('accepts a nested absolute path', () => {
        expect(validateRemotePath('/app/data/config.yaml')).toBeNull()
    })

    it('rejects an empty string', () => {
        expect(validateRemotePath('')).toBeInstanceOf(Error)
        expect(validateRemotePath('').message).toMatch(/empty/)
    })

    it('rejects a whitespace-only string', () => {
        expect(validateRemotePath('   ')).toBeInstanceOf(Error)
    })

    it('rejects a relative path (no leading slash)', () => {
        const err = validateRemotePath('tmp/file.txt')
        expect(err).toBeInstanceOf(Error)
        expect(err!.message).toMatch(/absolute/)
    })

    it('rejects a path with a .. segment in the middle', () => {
        const err = validateRemotePath('/app/../etc/passwd')
        expect(err).toBeInstanceOf(Error)
        expect(err!.message).toMatch(/\.\./)
    })

    it('rejects a path with .. at the start', () => {
        expect(validateRemotePath('../etc/passwd')).toBeInstanceOf(Error)
    })

    it('rejects a path whose only segment is ..', () => {
        expect(validateRemotePath('/..') ).toBeInstanceOf(Error)
    })

    it('accepts a path with a filename containing dots (not ..)', () => {
        expect(validateRemotePath('/tmp/.hidden-file')).toBeNull()
        expect(validateRemotePath('/app/v1.2.3/binary')).toBeNull()
    })
})

// ─── KubectlProvider.copyToContainer ─────────────────────────────────────────

describe('KubectlProvider.copyToContainer', () => {
    let provider: KubectlProvider

    beforeEach(() => {
        provider = new KubectlProvider()
        execFileMock.mockReset()
    })

    function resolveExecFile() {
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: unknown, cb: Function) => {
            cb(null, '', '')
        })
    }

    it('calls kubectl cp with correct upload arguments', async () => {
        resolveExecFile()
        await provider.copyToContainer('ctx', 'ns', 'my-pod', 'app', '/local/file.txt', '/tmp/file.txt')

        const args: string[] = execFileMock.mock.calls[0][1]
        expect(args[0]).toBe('cp')
        expect(args[1]).toBe('/local/file.txt')           // local src
        expect(args[2]).toBe('ns/my-pod:/tmp/file.txt')   // ns/pod:remotePath
        expect(args).toContain('--context')
        expect(args[args.indexOf('--context') + 1]).toBe('ctx')
        expect(args).toContain('-c')
        expect(args[args.indexOf('-c') + 1]).toBe('app')
    })

    it('rejects if kubectl cp exits with error', async () => {
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: unknown, cb: Function) => {
            const err = Object.assign(new Error('exit 1'), { killed: false, code: 1 })
            cb(err, '', 'No such file or directory')
        })
        await expect(
            provider.copyToContainer('ctx', 'ns', 'pod', 'c', '/local/x', '/tmp/x')
        ).rejects.toThrow()
    })
})

// ─── KubectlProvider.copyFromContainer ───────────────────────────────────────

describe('KubectlProvider.copyFromContainer', () => {
    let provider: KubectlProvider

    beforeEach(() => {
        provider = new KubectlProvider()
        execFileMock.mockReset()
    })

    function resolveExecFile() {
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: unknown, cb: Function) => {
            cb(null, '', '')
        })
    }

    it('calls kubectl cp with correct download arguments', async () => {
        resolveExecFile()
        await provider.copyFromContainer('ctx', 'ns', 'my-pod', 'app', '/app/logs/out.log', '/tmp/out.log')

        const args: string[] = execFileMock.mock.calls[0][1]
        expect(args[0]).toBe('cp')
        expect(args[1]).toBe('ns/my-pod:/app/logs/out.log')  // ns/pod:remotePath (src)
        expect(args[2]).toBe('/tmp/out.log')                  // local dest
        expect(args).toContain('--context')
        expect(args[args.indexOf('--context') + 1]).toBe('ctx')
        expect(args).toContain('-c')
        expect(args[args.indexOf('-c') + 1]).toBe('app')
    })

    it('rejects if kubectl cp exits with error', async () => {
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: unknown, cb: Function) => {
            const err = Object.assign(new Error('exit 1'), { killed: false, code: 1 })
            cb(err, '', 'not found in container')
        })
        await expect(
            provider.copyFromContainer('ctx', 'ns', 'pod', 'c', '/remote/x', '/local/x')
        ).rejects.toThrow()
    })
})
