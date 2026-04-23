import { StoreSlice } from '../types'
import { ResourceKind, AnyKubeResource } from '../../types'

export interface HelmInstallHint {
    repoName: string
    repoUrl: string
    chart: string
}

export interface NavigationSlice {
    section: ResourceKind
    setSection: (s: ResourceKind) => void
    navWidth: number
    setNavWidth: (w: number) => void
    detailWidth: number
    setDetailWidth: (w: number) => void
    theme: 'light' | 'dark'
    setTheme: (theme: 'light' | 'dark') => void
    toggleTheme: () => void
    searchQuery: string
    setSearchQuery: (q: string) => void
    isSearchOpen: boolean
    setSearchOpen: (open: boolean) => void
    resourceHistory: AnyKubeResource[]
    helmInstallHint: HelmInstallHint | null
    setHelmInstallHint: (hint: HelmInstallHint | null) => void
    showTour: boolean
    setShowTour: (show) => void
    pendingResourceAction: 'analyze-restarts' | null
    setPendingResourceAction: (action: 'analyze-restarts' | null) => void
    pluginsEnabled: boolean
    setPluginsEnabled: (enabled: boolean) => void
    finopsEnabled: boolean
    setFinopsEnabled: (enabled: boolean) => void
    gitopsEnabled: boolean
    setGitopsEnabled: (enabled: boolean) => void
    networkEnabled: boolean
    setNetworkEnabled: (enabled: boolean) => void
    unifiedLogsSelectedPods: string[]
    setUnifiedLogsSelectedPods: (pods: string[]) => void
}


const ls = (key: string, fallback: string): string => {
    try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}

export const createNavigationSlice: StoreSlice<NavigationSlice> = (set, get) => ({
    section: 'dashboard' as ResourceKind,
    setSection: (section) => {
        set({ section, selectedResource: null })
        get().loadSection(section)
    },
    navWidth: parseInt(ls('podscape:navWidth', '210')),
    setNavWidth: (navWidth) => {
        set({ navWidth })
        localStorage.setItem('podscape:navWidth', navWidth.toString())
    },
    detailWidth: parseInt(ls('podscape:detailWidth', '560')),
    setDetailWidth: (detailWidth) => {
        set({ detailWidth })
        localStorage.setItem('podscape:detailWidth', detailWidth.toString())
    },
    theme: (ls('theme', 'dark') === 'light' ? 'light' : 'dark'),
    setTheme: (theme) => {
        set({ theme })
        localStorage.setItem('theme', theme)
        if (theme === 'dark') {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }
    },
    toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        get().setTheme(next)
    },
    searchQuery: '',
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    isSearchOpen: false,
    setSearchOpen: (isSearchOpen) => set({ isSearchOpen }),
    resourceHistory: [],
    helmInstallHint: null,
    setHelmInstallHint: (helmInstallHint) => set({ helmInstallHint }),
    showTour: false,
    setShowTour: (showTour) => set({ showTour }),
    pendingResourceAction: null,
    setPendingResourceAction: (pendingResourceAction) => set({ pendingResourceAction }),
    pluginsEnabled: true,
    setPluginsEnabled: (pluginsEnabled) => {
        set({ pluginsEnabled })
        if (!pluginsEnabled && get().section === 'krew') get().setSection('dashboard')
    },
    finopsEnabled: true,
    setFinopsEnabled: (finopsEnabled) => {
        set({ finopsEnabled })
        if (!finopsEnabled && get().section === 'cost') get().setSection('dashboard')
    },
    gitopsEnabled: true,
    setGitopsEnabled: (gitopsEnabled) => {
        set({ gitopsEnabled })
        if (!gitopsEnabled && get().section === 'gitops') get().setSection('dashboard')
    },
    networkEnabled: true,
    setNetworkEnabled: (networkEnabled) => {
        set({ networkEnabled })
        if (!networkEnabled && (get().section === 'network' || get().section === 'connectivity')) get().setSection('dashboard')
    },
    unifiedLogsSelectedPods: [],
    setUnifiedLogsSelectedPods: (pods) => set({ unifiedLogsSelectedPods: pods }),
})

