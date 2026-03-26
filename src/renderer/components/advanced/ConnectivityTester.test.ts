import { vi, describe, it, expect } from 'vitest'

vi.mock('../store', () => ({
    useAppStore: () => ({ selectedContext: null, selectedNamespace: null })
}))

import { buildCommand, buildServiceDnsName, buildPodDnsName } from './ConnectivityTester'

describe('buildCommand', () => {
    describe('curl', () => {
        it('builds curl command with host and port', () => {
            expect(buildCommand('curl', 'my-svc.default.svc.cluster.local', '8080')).toEqual([
                'curl', '-v', '-m', '10', 'my-svc.default.svc.cluster.local:8080'
            ])
        })

        it('builds curl command without port', () => {
            expect(buildCommand('curl', 'google.com', '')).toEqual([
                'curl', '-v', '-m', '10', 'google.com'
            ])
        })

        it('appends path when provided', () => {
            expect(buildCommand('curl', 'my-svc', '8080', '/healthz')).toEqual([
                'curl', '-v', '-m', '10', 'my-svc:8080/healthz'
            ])
        })

        it('omits path when empty', () => {
            expect(buildCommand('curl', 'my-svc', '80', '')).toEqual([
                'curl', '-v', '-m', '10', 'my-svc:80'
            ])
        })
    })

    describe('nc', () => {
        it('builds nc command using provided port', () => {
            expect(buildCommand('nc', '10.0.0.1', '5432')).toEqual([
                'nc', '-zv', '-w', '5', '10.0.0.1', '5432'
            ])
        })

        it('defaults to port 80 when port is empty', () => {
            expect(buildCommand('nc', '10.0.0.1', '')).toEqual([
                'nc', '-zv', '-w', '5', '10.0.0.1', '80'
            ])
        })

        it('ignores path parameter', () => {
            expect(buildCommand('nc', '10.0.0.1', '5432', '/ignored')).toEqual([
                'nc', '-zv', '-w', '5', '10.0.0.1', '5432'
            ])
        })
    })

    describe('ping', () => {
        it('builds ping command ignoring port and path', () => {
            expect(buildCommand('ping', 'google.com', '9999', '/ignored')).toEqual([
                'ping', '-c', '3', '-W', '5', 'google.com'
            ])
        })
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

    it('falls back to "default" when namespace is missing', () => {
        const svc = { metadata: { name: 'redis' } }
        expect(buildServiceDnsName(svc)).toBe('redis.default.svc.cluster.local')
    })
})

describe('buildPodDnsName', () => {
    it('converts pod IP dots to dashes and forms cluster DNS name', () => {
        const pod = { metadata: { namespace: 'production' }, status: { podIP: '10.0.1.42' } }
        expect(buildPodDnsName(pod)).toBe('10-0-1-42.production.pod.cluster.local')
    })

    it('falls back to "default" when namespace is missing', () => {
        const pod = { metadata: {}, status: { podIP: '192.168.0.5' } }
        expect(buildPodDnsName(pod)).toBe('192-168-0-5.default.pod.cluster.local')
    })

    it('handles missing podIP gracefully', () => {
        const pod = { metadata: { namespace: 'default' }, status: {} }
        expect(buildPodDnsName(pod)).toBe('.default.pod.cluster.local')
    })
})
