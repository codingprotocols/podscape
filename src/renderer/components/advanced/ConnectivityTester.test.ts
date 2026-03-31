import { vi, describe, it, expect } from 'vitest'

vi.mock('../store', () => ({
    useAppStore: () => ({ selectedContext: null, selectedNamespace: null })
}))

import {
    buildCommand, buildServiceDnsName, buildPodDnsName,
    buildDiagSteps, podContainerPorts, runSteps,
} from './ConnectivityTester'
import type { ExecFn } from './ConnectivityTester'

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

    it('returns empty string when podIP is missing', () => {
        const pod = { metadata: { namespace: 'default' }, status: {} }
        expect(buildPodDnsName(pod)).toBe('')
    })
})

// ─── buildDiagSteps ───────────────────────────────────────────────────────────

describe('buildDiagSteps', () => {
    it('includes DNS, TCP, HTTP steps for a hostname target', () => {
        const steps = buildDiagSteps('my-svc.default.svc.cluster.local', '8080', '/healthz', false)
        expect(steps).toHaveLength(3)
        expect(steps[0].key).toBe('dns')
        expect(steps[1].key).toBe('tcp')
        expect(steps[2].key).toBe('http')
    })

    it('skips DNS step when skipDns=true (IP address target)', () => {
        const steps = buildDiagSteps('10.0.0.1', '8080', '/', true)
        expect(steps).toHaveLength(2)
        expect(steps[0].key).toBe('tcp')
        expect(steps[1].key).toBe('http')
    })

    it('DNS step uses nslookup with -timeout=5', () => {
        const steps = buildDiagSteps('my-svc', '80', '/', false)
        expect(steps[0].cmd).toEqual(['nslookup', '-timeout=5', 'my-svc'])
    })

    it('TCP step defaults port to 80 when empty', () => {
        const steps = buildDiagSteps('my-svc', '', '/', false)
        const tcp = steps.find(s => s.key === 'tcp')!
        expect(tcp.cmd).toContain('80')
    })

    it('HTTP step uses curl with the correct URL including path', () => {
        const steps = buildDiagSteps('my-svc', '3000', '/api/health', false)
        const http = steps.find(s => s.key === 'http')!
        expect(http.cmd.join(' ')).toContain('http://my-svc:3000/api/health')
    })

    it('all steps start as idle with zero durationMs', () => {
        const steps = buildDiagSteps('host', '80', '/', false)
        for (const s of steps) {
            expect(s.status).toBe('idle')
            expect(s.durationMs).toBe(0)
            expect(s.output).toBe('')
        }
    })
})

// ─── podContainerPorts ────────────────────────────────────────────────────────

describe('podContainerPorts', () => {
    const makePod = (containers: { ports?: { containerPort: number }[] }[]) => ({
        metadata: { name: 'p', namespace: 'default', uid: 'u', creationTimestamp: '' },
        spec: { containers: containers.map(c => ({ name: 'c', image: 'i', ports: c.ports })) },
        status: { phase: 'Running' as const },
    }) as any

    it('returns empty array for pod with no containers', () => {
        expect(podContainerPorts(makePod([]))).toEqual([])
    })

    it('returns empty array for container with no ports', () => {
        expect(podContainerPorts(makePod([{}]))).toEqual([])
    })

    it('returns sorted deduplicated ports from a single container', () => {
        expect(podContainerPorts(makePod([{ ports: [{ containerPort: 8080 }, { containerPort: 443 }] }]))).toEqual([443, 8080])
    })

    it('deduplicates ports across multiple containers', () => {
        const pod = makePod([
            { ports: [{ containerPort: 8080 }, { containerPort: 9090 }] },
            { ports: [{ containerPort: 8080 }, { containerPort: 3000 }] },
        ])
        expect(podContainerPorts(pod)).toEqual([3000, 8080, 9090])
    })
})

// ─── runSteps ─────────────────────────────────────────────────────────────────

function makeSteps(skipDns = false) {
    return buildDiagSteps('my-svc', '80', '/', skipDns)
}

describe('runSteps', () => {
    it('marks all steps success when execFn always succeeds', async () => {
        const exec: ExecFn = async () => ({ stdout: 'ok', exitCode: 0 })
        const updates: any[] = []
        const cancelled = { current: false }
        const result = await runSteps(makeSteps(), exec, s => updates.push(s), cancelled, true)
        expect(result.every(s => s.status === 'success')).toBe(true)
    })

    it('skips TCP and HTTP when DNS fails for a hostname target', async () => {
        const exec: ExecFn = async (cmd) => {
            if (cmd[0] === 'nslookup') return { stdout: 'NXDOMAIN', exitCode: 1 }
            return { stdout: 'ok', exitCode: 0 }
        }
        const cancelled = { current: false }
        const result = await runSteps(makeSteps(), exec, () => {}, cancelled, true)
        expect(result[0].status).toBe('failed')  // dns
        expect(result[1].status).toBe('skipped') // tcp
        expect(result[2].status).toBe('skipped') // http
    })

    it('does NOT skip TCP/HTTP when DNS fails for an IP target (allowSkipOnDnsFail=false)', async () => {
        // IP target: no DNS step, only TCP+HTTP
        const ipSteps = makeSteps(true) // skipDns=true → 2 steps: tcp, http
        const exec: ExecFn = async () => ({ stdout: '', exitCode: 0 })
        const cancelled = { current: false }
        const result = await runSteps(ipSteps, exec, () => {}, cancelled, false)
        expect(result.every(s => s.status === 'success')).toBe(true)
    })

    it('marks step failed when execFn throws', async () => {
        const exec: ExecFn = async () => { throw new Error('timeout') }
        const cancelled = { current: false }
        const result = await runSteps(makeSteps(), exec, () => {}, cancelled, true)
        expect(result[0].status).toBe('failed')
        expect(result[0].output).toBe('timeout')
    })

    it('skips remaining steps when cancelled mid-run', async () => {
        const cancelled = { current: false }
        let callCount = 0
        const exec: ExecFn = async () => {
            callCount++
            if (callCount === 1) cancelled.current = true
            return { stdout: 'ok', exitCode: 0 }
        }
        const result = await runSteps(makeSteps(), exec, () => {}, cancelled, true)
        expect(result[0].status).toBe('success') // first step completes
        expect(result[1].status).toBe('skipped') // cancelled before second
        expect(result[2].status).toBe('skipped')
    })

    it('calls onStepUpdate for each step transition', async () => {
        const exec: ExecFn = async () => ({ stdout: '', exitCode: 0 })
        const updates: any[] = []
        const cancelled = { current: false }
        const steps = makeSteps()
        await runSteps(steps, exec, s => updates.push(s), cancelled, true)
        // Each step fires at least 2 updates: running + result
        expect(updates.length).toBeGreaterThanOrEqual(steps.length * 2)
    })
})
