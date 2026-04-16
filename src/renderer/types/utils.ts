import { KubePod, KubeNode } from './k8s'

export function podPhaseBg(phase: string): string {
  switch (phase) {
    case 'Running': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 outline-emerald-500/20'
    case 'Terminating': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 outline-amber-500/20 animate-pulse'
    case 'Succeeded': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 outline-blue-500/20'
    case 'Pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 outline-amber-500/20'
    case 'Failed': return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 outline-red-500/20'
    default: return 'bg-slate-100 text-slate-700 dark:bg-slate-900/20 dark:text-slate-400 outline-slate-500/20'
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
  if (cpu.endsWith('n')) return parseInt(cpu.slice(0, -1), 10) / 1_000_000
  if (cpu.endsWith('u')) return parseInt(cpu.slice(0, -1), 10) / 1_000
  if (cpu.endsWith('m')) return parseInt(cpu.slice(0, -1), 10)
  return parseFloat(cpu) * 1000
}

export function parseMemoryMiB(mem: string): number {
  if (!mem) return 0
  if (mem.endsWith('Ki')) return parseInt(mem.slice(0, -2)) / 1024
  if (mem.endsWith('Mi')) return parseInt(mem.slice(0, -2))
  if (mem.endsWith('Gi')) return parseInt(mem.slice(0, -2)) * 1024
  if (mem.endsWith('Ti')) return parseInt(mem.slice(0, -2)) * 1024 * 1024
  if (mem.endsWith('k') || mem.endsWith('K')) return parseInt(mem.slice(0, -1)) / 1024
  if (mem.endsWith('M')) return parseInt(mem.slice(0, -1))
  if (mem.endsWith('G')) return parseInt(mem.slice(0, -1)) * 1024
  return parseInt(mem) / (1024 * 1024)
}

export function getNodeReady(node: KubeNode): boolean {
  return (node.status.conditions ?? []).some(c => c.type === 'Ready' && c.status === 'True')
}
