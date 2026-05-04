import { describe, it, expect } from 'vitest'
import { buildSearchIndex, filterByQuery } from './searchUtils'
import { labelsToStrings } from './resourceConfig'

function makeResource(uid: string, name: string, extra: Record<string, string> = {}) {
    return {
        metadata: { uid, name, creationTimestamp: '2024-01-01T00:00:00Z' },
        ...extra,
    } as any
}

// ── labelsToStrings ───────────────────────────────────────────────────────────

describe('labelsToStrings', () => {
    it('returns empty array for undefined', () => {
        expect(labelsToStrings(undefined)).toEqual([])
    })

    it('returns empty array for empty object', () => {
        expect(labelsToStrings({})).toEqual([])
    })

    it('formats each label as key=value', () => {
        expect(labelsToStrings({ app: 'web', env: 'prod' })).toEqual(
            expect.arrayContaining(['app=web', 'env=prod'])
        )
    })

    it('handles label with empty string value', () => {
        expect(labelsToStrings({ tier: '' })).toEqual(['tier='])
    })
})

// ── buildSearchIndex ──────────────────────────────────────────────────────────

describe('buildSearchIndex', () => {
    it('returns empty map for empty resources', () => {
        expect(buildSearchIndex([], r => [r.metadata.name]).size).toBe(0)
    })

    it('keys index by uid', () => {
        const r = makeResource('uid-1', 'nginx')
        const idx = buildSearchIndex([r], r => [r.metadata.name])
        expect(idx.has('uid-1')).toBe(true)
    })

    it('lowercases the indexed string', () => {
        const r = makeResource('uid-1', 'NGINX')
        const idx = buildSearchIndex([r], r => [r.metadata.name])
        expect(idx.get('uid-1')).toBe('nginx')
    })

    it('joins multiple fields with null byte delimiter', () => {
        const r = makeResource('uid-1', 'web')
        const idx = buildSearchIndex([r], r => ['web', 'default'])
        expect(idx.get('uid-1')).toBe('web\0default')
    })

    it('filters out null and undefined fields before joining', () => {
        const r = makeResource('uid-1', 'web')
        const idx = buildSearchIndex([r], r => ['web', null, undefined, 'running'])
        expect(idx.get('uid-1')).toBe('web\0running')
        expect(idx.get('uid-1')).not.toContain('\0\0')
    })

    it('falls back to name-only when no searchFields provided', () => {
        const r = makeResource('uid-1', 'fallback-pod')
        const idx = buildSearchIndex([r])
        expect(idx.get('uid-1')).toBe('fallback-pod')
    })

    it('prevents cross-field false matches via null byte', () => {
        // "ecrun" would match if "default" + "running" were joined without separator
        const r = makeResource('uid-1', 'p')
        const idx = buildSearchIndex([r], () => ['defaul', 'running'])
        expect(idx.get('uid-1')).not.toContain('lrun')
    })
})

// ── filterByQuery ─────────────────────────────────────────────────────────────

describe('filterByQuery', () => {
    const resources = [
        makeResource('a', 'nginx-web'),
        makeResource('b', 'redis-cache'),
        makeResource('c', 'postgres-db'),
    ]
    const idx = buildSearchIndex(resources, r => [r.metadata.name])

    it('returns original array reference when query is empty', () => {
        expect(filterByQuery(resources, idx, '')).toBe(resources)
    })

    it('returns original array reference when query is whitespace only', () => {
        expect(filterByQuery(resources, idx, '   ')).toBe(resources)
    })

    it('filters by substring match', () => {
        const result = filterByQuery(resources, idx, 'nginx')
        expect(result).toHaveLength(1)
        expect(result[0].metadata.name).toBe('nginx-web')
    })

    it('is case-insensitive', () => {
        const result = filterByQuery(resources, idx, 'REDIS')
        expect(result).toHaveLength(1)
        expect(result[0].metadata.name).toBe('redis-cache')
    })

    it('returns empty array when no resources match', () => {
        expect(filterByQuery(resources, idx, 'zzzz')).toHaveLength(0)
    })

    it('trims leading/trailing whitespace from query', () => {
        const result = filterByQuery(resources, idx, '  postgres  ')
        expect(result).toHaveLength(1)
    })

    it('returns resource with uid missing from index as non-match', () => {
        const orphan = makeResource('missing-uid', 'orphan')
        const result = filterByQuery([orphan], idx, 'orphan')
        expect(result).toHaveLength(0)
    })
})
