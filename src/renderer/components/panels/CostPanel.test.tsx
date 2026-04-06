// @vitest-environment jsdom
import React from 'react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'
expect.extend(matchers)

// Each test re-mocks the store with the state it needs.
function mockStore(overrides: Record<string, any>) {
    vi.doMock('../../store', () => ({
        useAppStore: (sel?: (s: any) => any) => {
            const state = {
                costAvailable: null, costProvider: '', costError: null,
                costAllocations: [], costLoading: false,
                loadCostAllocations: vi.fn(), selectedContext: 'ctx1',
                ...overrides,
            }
            return sel ? sel(state) : state
        },
    }))
}

afterEach(() => { cleanup(); vi.resetModules() })

describe('CostPanel', () => {
    it('shows detecting message when costAvailable is null', async () => {
        mockStore({ costAvailable: null })
        const { default: CostPanel } = await import('./CostPanel')
        render(<CostPanel />)
        expect(screen.getByText(/detecting/i)).toBeInTheDocument()
    })

    it('shows unavailable state when costAvailable is false', async () => {
        mockStore({ costAvailable: false })
        const { default: CostPanel } = await import('./CostPanel')
        render(<CostPanel />)
        expect(screen.getByText(/not detected/i)).toBeInTheDocument()
    })

    it('shows Kubecost badge when provider is kubecost', async () => {
        mockStore({ costAvailable: true, costProvider: 'kubecost', costAllocations: [], costLoading: false })
        const { default: CostPanel } = await import('./CostPanel')
        render(<CostPanel />)
        expect(screen.getByText('Kubecost')).toBeInTheDocument()
    })

    it('shows OpenCost badge when provider is opencost', async () => {
        mockStore({ costAvailable: true, costProvider: 'opencost', costAllocations: [], costLoading: false })
        const { default: CostPanel } = await import('./CostPanel')
        render(<CostPanel />)
        expect(screen.getByText('OpenCost')).toBeInTheDocument()
    })

    it('renders allocation rows when data is available', async () => {
        mockStore({
            costAvailable: true, costProvider: 'kubecost',
            costAllocations: [
                { name: 'default', totalCost: 3.45, cpuCost: 1.0, ramCost: 2.45 },
                { name: 'kube-system', totalCost: 1.20, cpuCost: 0.5, ramCost: 0.70 },
            ],
            costLoading: false,
        })
        const { default: CostPanel } = await import('./CostPanel')
        render(<CostPanel />)
        expect(screen.getByText('default')).toBeInTheDocument()
        expect(screen.getByText('kube-system')).toBeInTheDocument()
    })

    it('shows error message when costError is set', async () => {
        mockStore({ costAvailable: true, costProvider: 'kubecost', costError: 'bad gateway', costAllocations: [], costLoading: false })
        const { default: CostPanel } = await import('./CostPanel')
        render(<CostPanel />)
        expect(screen.getByText('bad gateway')).toBeInTheDocument()
    })
})
