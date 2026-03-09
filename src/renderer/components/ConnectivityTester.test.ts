import { vi, describe, it, expect } from 'vitest'

// Mock the store and window deps before importing the component module
vi.mock('../store', () => ({
    useAppStore: () => ({ selectedContext: null, selectedNamespace: null })
}))

import { buildCommand, buildServiceDnsName } from './ConnectivityTester'

describe('buildCommand', () => {
    it('builds curl command with host and port', () => {
        expect(buildCommand('curl', 'my-svc.default.svc.cluster.local', '8080')).toEqual([
            'curl', '-v', '-m', '5', 'my-svc.default.svc.cluster.local:8080'
        ])
    })

    it('builds curl command without port', () => {
        expect(buildCommand('curl', 'google.com', '')).toEqual([
            'curl', '-v', '-m', '5', 'google.com'
        ])
    })

    it('builds nc command using provided port', () => {
        expect(buildCommand('nc', '10.0.0.1', '5432')).toEqual([
            'nc', '-zv', '-w', '5', '10.0.0.1', '5432'
        ])
    })

    it('builds nc command with default port 80 when port is empty', () => {
        expect(buildCommand('nc', '10.0.0.1', '')).toEqual([
            'nc', '-zv', '-w', '5', '10.0.0.1', '80'
        ])
    })

    it('builds ping command ignoring port', () => {
        expect(buildCommand('ping', 'google.com', '9999')).toEqual([
            'ping', '-c', '3', '-W', '5', 'google.com'
        ])
    })
})

describe('buildServiceDnsName', () => {
    it('builds fully-qualified cluster DNS name', () => {
        const svc = { metadata: { name: 'my-service', namespace: 'production' } }
        expect(buildServiceDnsName(svc)).toBe('my-service.production.svc.cluster.local')
    })

    it('handles default namespace', () => {
        const svc = { metadata: { name: 'redis', namespace: 'default' } }
        expect(buildServiceDnsName(svc)).toBe('redis.default.svc.cluster.local')
    })
})
