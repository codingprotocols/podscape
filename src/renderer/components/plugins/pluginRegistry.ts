import type { PluginModule } from './PluginContract'

const registry: Record<string, () => Promise<PluginModule>> = {
    neat:             () => import('./neat'),
    stern:            () => import('./stern'),
    tree:             () => import('./tree'),
    images:           () => import('./images'),
    whoami:           () => import('./whoami'),
    'df-pv':          () => import('./df-pv'),
    outdated:         () => import('./outdated'),
}

export function getPlugin(name: string): (() => Promise<PluginModule>) | null {
    return registry[name] ?? null
}
