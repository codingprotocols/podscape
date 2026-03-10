import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock electron before importing kubectl
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('./settings_storage', () => ({ getSettings: () => ({ kubectlPath: '', shellPath: '', theme: 'dark', kubeconfigPath: '' }) }))
vi.mock('./env', () => ({ getAugmentedEnv: () => ({}) }))

// execFile mock — we control the callback in each test
const execFileMock = vi.fn()
vi.mock('child_process', () => ({
    execFile: (...args: unknown[]) => execFileMock(...args),
    spawn: vi.fn(),
}))

// existsSync always false so findKubectl() falls through to 'kubectl'
vi.mock('fs', async (importActual) => {
    const actual = await importActual<typeof import('fs')>()
    return { ...actual, existsSync: () => false }
})

import { KubectlProvider } from './kubectl'

describe('KubectlProvider.execCommand', () => {
    let provider: KubectlProvider

    beforeEach(() => {
        provider = new KubectlProvider()
        execFileMock.mockReset()
    })

    it('rejects commands not in the allow-list', async () => {
        await expect(
            provider.execCommand('ctx', 'ns', 'pod', 'container', ['rm', '-rf', '/'])
        ).rejects.toThrow("Command not allowed: 'rm'")
    })

    it('rejects empty command array', async () => {
        await expect(
            provider.execCommand('ctx', 'ns', 'pod', 'container', [])
        ).rejects.toThrow("Command not allowed: ''")
    })

    it('allows curl and returns stdout with exitCode 0', async () => {
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(null, 'HTTP/1.1 200 OK\n', '')
        })
        const result = await provider.execCommand('ctx', 'ns', 'pod', 'container', ['curl', '-v', '-m', '5', 'example.com'])
        expect(result).toEqual({ stdout: 'HTTP/1.1 200 OK\n', exitCode: 0 })
    })

    it('allows nc and returns stdout with exitCode 0', async () => {
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(null, 'Connection to 10.0.0.1 port 80 succeeded\n', '')
        })
        const result = await provider.execCommand('ctx', 'ns', 'pod', 'container', ['nc', '-zv', '-w', '5', '10.0.0.1', '80'])
        expect(result).toEqual({ stdout: 'Connection to 10.0.0.1 port 80 succeeded\n', exitCode: 0 })
    })

    it('allows ping and returns stdout with exitCode 0', async () => {
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(null, '3 packets transmitted\n', '')
        })
        const result = await provider.execCommand('ctx', 'ns', 'pod', 'container', ['ping', '-c', '3', '-W', '5', 'google.com'])
        expect(result).toEqual({ stdout: '3 packets transmitted\n', exitCode: 0 })
    })

    it('resolves (not rejects) on non-zero exit, returning stdout + stderr and exit code', async () => {
        const err = Object.assign(new Error('process exited'), { code: 7 })
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(err, '', 'curl: (7) Failed to connect')
        })
        const result = await provider.execCommand('ctx', 'ns', 'pod', 'container', ['curl', '-v', '-m', '5', 'unreachable.svc'])
        expect(result.exitCode).toBe(7)
        expect(result.stdout).toContain('curl: (7) Failed to connect')
    })

    it('passes --container flag in kubectl exec args', async () => {
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(null, 'ok', '')
        })
        await provider.execCommand('my-ctx', 'my-ns', 'my-pod', 'my-container', ['curl', 'http://svc'])
        const calledArgs: string[] = execFileMock.mock.calls[0][1]
        expect(calledArgs).toContain('--container')
        expect(calledArgs).toContain('my-container')
    })
})

describe('KubectlProvider error humanization', () => {
    let provider: KubectlProvider

    beforeEach(() => {
        provider = new KubectlProvider()
        execFileMock.mockReset()
    })

    it('formats i/o timeout errors for UX', async () => {
        const err = new Error('dial tcp: i/o timeout')
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(err, '', 'dial tcp: i/o timeout')
        })
        await expect(provider.getContexts()).rejects.toThrow('Cluster connection timed out')
    })

    it('formats ETIMEDOUT errors for UX', async () => {
        const err = Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' })
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(err, '', '')
        })
        await expect(provider.getContexts()).rejects.toThrow('Cluster connection timed out')
    })

    it('formats process killed (timeout) as cluster connection timeout', async () => {
        const err = Object.assign(new Error('killed'), { killed: true })
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(err, '', '')
        })
        await expect(provider.getContexts()).rejects.toThrow('Cluster connection timed out')
    })

    it('formats Forbidden stderr as permission denied', async () => {
        const err = new Error('Command failed')
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(err, '', 'Error from server (Forbidden): nodes is forbidden: User "dev" cannot list resource "nodes"')
        })
        await expect(provider.getContexts()).rejects.toThrow('Permission denied')
    })

    it('formats Unauthorized stderr as auth failed', async () => {
        const err = new Error('Command failed')
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(err, '', 'error: You must be logged in to the server (Unauthorized)')
        })
        await expect(provider.getContexts()).rejects.toThrow('Authentication failed')
    })

    it('formats Unable to connect stderr as cluster unreachable', async () => {
        const err = new Error('Command failed')
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(err, '', 'Unable to connect to the server: dial tcp 1.2.3.4:443: connect: connection refused')
        })
        await expect(provider.getContexts()).rejects.toThrow('Cannot reach the cluster')
    })

    it('formats ENOENT as kubectl not found', async () => {
        const err = Object.assign(new Error('spawn kubectl ENOENT'), { code: 'ENOENT' })
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(err, '', '')
        })
        await expect(provider.getContexts()).rejects.toThrow('kubectl not found')
    })

    it('strips raw "Command failed:" message when no stderr', async () => {
        const err = new Error('Command failed: /opt/homebrew/bin/kubectl get nodes --context secret-arn --all-namespaces -o json')
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(err, '', '')
        })
        const rejected = provider.getContexts().catch(e => e)
        const e = await rejected
        expect(e.message).not.toContain('/opt/homebrew/bin/kubectl')
        expect(e.message).not.toContain('secret-arn')
    })

    it('formats missing tar error (distroless containers) with actionable guidance', async () => {
        const stderr = `error: Internal error occurred: error executing command in container: failed to exec in container: failed to start exec "abc123": OCI runtime exec failed: exec failed: unable to start container process: exec: "tar": executable file not found in $PATH: unknown`
        const err = Object.assign(new Error('Command failed'), { code: 1, killed: false })
        execFileMock.mockImplementation((_bin: string, _args: string[], _opts: object, cb: Function) => {
            cb(err, '', stderr)
        })
        await expect(provider.getContexts()).rejects.toThrow('tar not found in container')
    })
})
