import type { KubeResource } from '../types/k8s'

type SearchFields = (r: any) => (string | null | undefined)[]

/**
 * Builds a uid→string Map used for fast per-keystroke filtering.
 * Each entry is the null-delimited, lowercased join of all searchable fields.
 * The null byte prevents cross-field false-positive matches.
 * Called once when resources arrive; NOT on every keystroke.
 */
export function buildSearchIndex(
    resources: KubeResource[],
    searchFields?: SearchFields,
): Map<string, string> {
    const index = new Map<string, string>()
    for (const r of resources) {
        const fields = searchFields ? searchFields(r) : [r.metadata.name]
        index.set(r.metadata.uid, fields.filter(Boolean).join('\0').toLowerCase())
    }
    return index
}

/**
 * Filters resources by query against a pre-built search index.
 * Returns the original array reference when query is empty (no allocation).
 */
export function filterByQuery<T extends KubeResource>(
    resources: T[],
    index: Map<string, string>,
    query: string,
): T[] {
    const q = query.toLowerCase().trim()
    if (!q) return resources
    return resources.filter(r => index.get(r.metadata.uid)?.includes(q) ?? false)
}
