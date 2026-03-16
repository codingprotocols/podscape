import type { AnyKubeResource } from '../../types'

export interface WorkloadImageEntry {
    image: string
    name: string
    namespace: string
    kind: string
}

export interface UniqueImageEntry {
    image: string
    usedBy: Array<{ name: string; namespace: string; kind: string }>
}

function getContainerImages(spec: any): string[] {
    const images: string[] = []
    const containers = [...(spec?.containers ?? []), ...(spec?.initContainers ?? [])]
    containers.forEach((c: any) => { if (c?.image) images.push(c.image) })
    return images
}

export function extractWorkloadImages(workloads: AnyKubeResource[]): WorkloadImageEntry[] {
    const entries: WorkloadImageEntry[] = []
    for (const w of workloads) {
        const name = w.metadata.name
        const namespace = w.metadata.namespace ?? ''
        const kind = w.kind ?? ''
        const spec = (w as any).spec
        let images: string[] = []
        if (kind === 'Pod') {
            images = getContainerImages(spec)
        } else if (kind === 'CronJob') {
            images = getContainerImages(spec?.jobTemplate?.spec?.template?.spec)
        } else {
            images = getContainerImages(spec?.template?.spec)
        }
        for (const image of images) {
            entries.push({ image, name, namespace, kind })
        }
    }
    return entries
}

export function getUniqueImages(workloads: AnyKubeResource[]): UniqueImageEntry[] {
    const map = new Map<string, Array<{ name: string; namespace: string; kind: string }>>()
    for (const entry of extractWorkloadImages(workloads)) {
        if (!map.has(entry.image)) map.set(entry.image, [])
        map.get(entry.image)!.push({ name: entry.name, namespace: entry.namespace, kind: entry.kind })
    }
    return Array.from(map.entries())
        .map(([image, usedBy]) => ({ image, usedBy }))
        .sort((a, b) => a.image.localeCompare(b.image))
}
