import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createNavigationSlice } from './navigationSlice'
import { setupMocks } from './test-utils'

const { localStorageMock, documentMock } = setupMocks()

describe('navigationSlice', () => {
    let set: any
    let get: any
    let state: any

    beforeEach(() => {
        state = {
            theme: 'dark',
            setTheme: vi.fn(),
            loadSection: vi.fn(),
        }
        set = vi.fn()
        get = vi.fn(() => state)
        localStorageMock.clear()
        vi.clearAllMocks()
    })

    it('initializes with default values', () => {
        const slice = (createNavigationSlice as any)(set, get)
        expect(slice.section).toBe('dashboard')
        expect(slice.navWidth).toBe(210) // default
        expect(slice.theme).toBe('dark') // default
    })

    it('setSection updates state and calls loadSection', () => {
        const slice = (createNavigationSlice as any)(set, get)
        slice.setSection('pods')
        expect(set).toHaveBeenCalledWith({ section: 'pods', selectedResource: null })
        expect(get().loadSection).toHaveBeenCalledWith('pods')
    })

    it('setNavWidth updates state and localStorage', () => {
        const slice = (createNavigationSlice as any)(set, get)
        slice.setNavWidth(300)
        expect(set).toHaveBeenCalledWith({ navWidth: 300 })
        expect(localStorageMock.setItem).toHaveBeenCalledWith('podscape:navWidth', '300')
    })

    it('setTheme updates state, localStorage and document class', () => {
        const slice = (createNavigationSlice as any)(set, get)
        slice.setTheme('light')
        expect(set).toHaveBeenCalledWith({ theme: 'light' })
        expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'light')
        expect(documentMock.documentElement.classList.remove).toHaveBeenCalledWith('dark')
    })

    it('toggleTheme switches theme', () => {
        const slice = (createNavigationSlice as any)(set, get)
        slice.toggleTheme()
        expect(get().setTheme).toHaveBeenCalledWith('light')
    })

    describe('unifiedLogsSelectedPods', () => {
        it('initialises to empty array', () => {
            const slice = (createNavigationSlice as any)(set, get)
            expect(slice.unifiedLogsSelectedPods).toEqual([])
        })

        it('setUnifiedLogsSelectedPods updates the field', () => {
            const slice = (createNavigationSlice as any)(set, get)
            slice.setUnifiedLogsSelectedPods(['pod-a', 'pod-b'])
            expect(set).toHaveBeenCalledWith({ unifiedLogsSelectedPods: ['pod-a', 'pod-b'] })
        })

        it('setUnifiedLogsSelectedPods with empty array clears previous value', () => {
            const slice = (createNavigationSlice as any)(set, get)
            slice.setUnifiedLogsSelectedPods(['pod-a'])
            expect(set).toHaveBeenCalledWith({ unifiedLogsSelectedPods: ['pod-a'] })
            vi.clearAllMocks()
            slice.setUnifiedLogsSelectedPods([])
            expect(set).toHaveBeenCalledWith({ unifiedLogsSelectedPods: [] })
        })

        it('setSection does not reset unifiedLogsSelectedPods', () => {
            const slice = (createNavigationSlice as any)(set, get)
            slice.setSection('pods')
            // setSection should only set section + selectedResource, not touch unifiedLogsSelectedPods
            expect(set).toHaveBeenCalledWith({ section: 'pods', selectedResource: null })
            const callArgs = (set as any).mock.calls.flat()
            for (const arg of callArgs) {
                expect(arg).not.toHaveProperty('unifiedLogsSelectedPods')
            }
        })
    })
})
