import { vi } from 'vitest'

export const setupMocks = () => {
    // Mock localStorage
    const localStorageMock = (() => {
        let store: Record<string, string> = {}
        return {
            getItem: vi.fn((key: string) => store[key] || null),
            setItem: vi.fn((key: string, value: string) => {
                store[key] = value.toString()
            }),
            clear: vi.fn(() => {
                store = {}
            }),
            removeItem: vi.fn((key: string) => {
                delete store[key]
            })
        }
    })()

    Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true })

    // Mock document
    const documentMock = {
        documentElement: {
            classList: {
                add: vi.fn(),
                remove: vi.fn(),
            },
        },
    }

    Object.defineProperty(global, 'document', { value: documentMock, writable: true })

    // Mock window
    const windowMock = {
        kubectl: {
            getNamespaces: vi.fn(),
            getContexts: vi.fn(),
            getCurrentContext: vi.fn(),
            getPods: vi.fn(),
            getDeployments: vi.fn(),
            getStatefulSets: vi.fn(),
            getReplicaSets: vi.fn(),
            getJobs: vi.fn(),
            getCronJobs: vi.fn(),
            getHPAs: vi.fn(),
            getPodDisruptionBudgets: vi.fn(),
            getServices: vi.fn(),
            getIngresses: vi.fn(),
            getIngressClasses: vi.fn(),
            getNetworkPolicies: vi.fn(),
            getEndpoints: vi.fn(),
            getConfigMaps: vi.fn(),
            getSecrets: vi.fn(),
            getPVCs: vi.fn(),
            getPVs: vi.fn(),
            getStorageClasses: vi.fn(),
            getServiceAccounts: vi.fn(),
            getRoles: vi.fn(),
            getClusterRoles: vi.fn(),
            getRoleBindings: vi.fn(),
            getClusterRoleBindings: vi.fn(),
            getNodes: vi.fn(),
            getCRDs: vi.fn(),
            getEvents: vi.fn(),
            getPodMetrics: vi.fn(),
            getNodeMetrics: vi.fn(),
            scale: vi.fn(),
            scaleResource: vi.fn(),
            rolloutRestart: vi.fn(),
            deleteResource: vi.fn(),
            getYAML: vi.fn(),
            execCommand: vi.fn(),
            applyYAML: vi.fn(),
            portForward: vi.fn(),
            stopPortForward: vi.fn(),
            onPortForwardReady: vi.fn(),
            onPortForwardError: vi.fn(),
            onPortForwardExit: vi.fn(),
        },
        plugins: {
            list: vi.fn(),
        }
    }

    Object.defineProperty(global, 'window', { value: windowMock, writable: true })

    return { localStorageMock, documentMock, windowMock }
}
