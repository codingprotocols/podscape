import { vi, describe, it, expect } from 'vitest'

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

import { validateRemotePath } from './dialog'

describe('validateRemotePath', () => {
    it('accepts a valid absolute path', () => {
        expect(validateRemotePath('/tmp/file.txt')).toBeNull()
    })

    it('accepts a nested absolute path', () => {
        expect(validateRemotePath('/app/data/config.yaml')).toBeNull()
    })

    it('rejects an empty string', () => {
        const err = validateRemotePath('')
        expect(err).toBeInstanceOf(Error)
        expect(err!.message).toMatch(/empty/)
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
