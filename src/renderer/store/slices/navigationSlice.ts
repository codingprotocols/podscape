import { StoreSlice, ExecTarget } from '../types'
import { ResourceKind } from '../../types'

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
}

export const createNavigationSlice: StoreSlice<NavigationSlice> = (set, get) => ({
    section: 'dashboard' as ResourceKind,
    setSection: (section) => {
        set({ section, selectedResource: null })
        get().loadSection(section)
    },
    navWidth: parseInt(localStorage.getItem('podscape:navWidth') ?? '210'),
    setNavWidth: (navWidth) => {
        set({ navWidth })
        localStorage.setItem('podscape:navWidth', navWidth.toString())
    },
    detailWidth: parseInt(localStorage.getItem('podscape:detailWidth') ?? '560'),
    setDetailWidth: (detailWidth) => {
        set({ detailWidth })
        localStorage.setItem('podscape:detailWidth', detailWidth.toString())
    },
    theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'dark',
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
})
