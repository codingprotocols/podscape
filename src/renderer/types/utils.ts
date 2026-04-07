import { KubePod, KubeNode } from './k8s'

export function podPhaseBg(phase: string): string {
  switch (phase) {
    case 'Running': return 'bg-green-500/20 text-green-300 ring-green-500/30'
    case 'Succeeded': return 'bg-blue-500/20 text-blue-300 ring-blue-500/30'
    case 'Pending': return 'bg-yellow-500/20 text-yellow-300 ring-yellow-500/30'
    case 'Failed': return 'bg-red-500/20 text-red-300 ring-red-500/30'
    default: return 'bg-gray-500/20 text-gray-300 ring-gray-500/30'
  }
}

export function totalRestarts(pod: KubePod): number {
  return (pod.status.containerStatuses ?? []).reduce((sum, cs) => sum + cs.restartCount, 0)
}

export function formatAge(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime()
  const s = Math.floor(diffMs / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function parseCpuMillicores(cpu: string): number {
  if (!cpu) return 0
  if (cpu.endsWith('n')) return parseInt(cpu) / 1_000_000
  if (cpu.endsWith('u')) return parseInt(cpu) / 1_000
  if (cpu.endsWith('m')) return parseInt(cpu)
  return parseFloat(cpu) * 1000
}

export function parseMemoryMiB(mem: string): number {
  if (!mem) return 0
  if (mem.endsWith('Ki')) return parseInt(mem) / 1024
  if (mem.endsWith('Mi')) return parseInt(mem)
  if (mem.endsWith('Gi')) return parseInt(mem) * 1024
  if (mem.endsWith('Ti')) return parseInt(mem) * 1024 * 1024
  if (mem.endsWith('k') || mem.endsWith('K')) return parseInt(mem) / 1024
  if (mem.endsWith('M')) return parseInt(mem)
  if (mem.endsWith('G')) return parseInt(mem) * 1024
  return parseInt(mem) / (1024 * 1024)
}

export function getNodeReady(node: KubeNode): boolean {
  return (node.status.conditions ?? []).some(c => c.type === 'Ready' && c.status === 'True')
}
