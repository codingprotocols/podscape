import { vi, describe, it, expect } from 'vitest'

// UnifiedLogs.tsx imports useAppStore, which creates the Zustand store on
// module load and immediately calls localStorage.getItem. Mock the store
// module so the import doesn't trigger real store initialization.
vi.mock('../store', () => ({ useAppStore: vi.fn() }))

import { shouldResetStreaming, escapeRegExp } from './UnifiedLogs'

// ── shouldResetStreaming ────────────────────────────────────────────────────
// Guards the fix for "isStreaming stuck when all streamLogs calls throw":
// if no streams were started (streamIds is empty), isStreaming must reset to false.

describe('shouldResetStreaming', () => {
    it('returns true when streamIds is empty (all pods failed to stream)', () => {
        expect(shouldResetStreaming({})).toBe(true)
    })

    it('returns false when at least one stream is active', () => {
        expect(shouldResetStreaming({ 'my-pod': 'sid-1' })).toBe(false)
    })

    it('returns false when multiple streams are active', () => {
        expect(shouldResetStreaming({ 'pod-a': 'sid-1', 'pod-b': 'sid-2' })).toBe(false)
    })
})

// ── escapeRegExp ────────────────────────────────────────────────────────────
// Guards the fix for "searchTerm with regex special characters crashes the
// log-highlight split (new RegExp(searchTerm) throws or produces wrong results)".

describe('escapeRegExp', () => {
    it('escapes dot so it matches a literal dot, not any character', () => {
        const re = new RegExp(escapeRegExp('.'))
        expect(re.test('hello')).toBe(false)
        expect(re.test('hel.o')).toBe(true)
    })

    it('escapes asterisk', () => {
        const re = new RegExp(escapeRegExp('a*'))
        expect(re.test('aaa')).toBe(false)
        expect(re.test('a*')).toBe(true)
    })

    it('escapes square brackets', () => {
        const re = new RegExp(escapeRegExp('[abc]'))
        expect(re.test('a')).toBe(false)
        expect(re.test('[abc]')).toBe(true)
    })

    it('escapes all regex metacharacters without throwing', () => {
        const dangerous = '.*+?^${}()|[]\\'
        expect(() => new RegExp(escapeRegExp(dangerous))).not.toThrow()
    })

    it('leaves normal text unchanged', () => {
        expect(escapeRegExp('hello world')).toBe('hello world')
    })

    it('allows case-insensitive match after escaping', () => {
        const re = new RegExp(`(${escapeRegExp('error')})`, 'gi')
        const parts = 'An ERROR occurred'.split(re)
        expect(parts).toContain('ERROR')
    })
})
