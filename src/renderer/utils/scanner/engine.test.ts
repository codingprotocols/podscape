import { describe, it, expect } from 'vitest'
import { ScannerEngine } from './engine'
import type { AnyKubeResource } from '../../types'

// Minimal resource factory
function makeResource(overrides: Record<string, unknown> = {}): AnyKubeResource {
    return {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'test', namespace: 'default', uid: 'uid-1', creationTimestamp: '', labels: {} },
        spec: {
            template: {
                spec: {
                    containers: [{
                        name: 'app',
                        image: 'my-app:1.0.0',
                        resources: { limits: { cpu: '100m', memory: '128Mi' } },
                        securityContext: { runAsNonRoot: true },
                        livenessProbe: { httpGet: { path: '/healthz', port: 8080 } },
                        readinessProbe: { httpGet: { path: '/ready', port: 8080 } },
                    }],
                    securityContext: { runAsNonRoot: true },
                }
            }
        },
        status: {},
        ...overrides,
    } as unknown as AnyKubeResource
}

describe('ScannerEngine integration', () => {
    it('returns a ScanResult with resourceUid and summary', () => {
        const engine = new ScannerEngine()
        const resource = makeResource()
        const result = engine.scan(resource)

        expect(result.resourceUid).toBe('uid-1')
        expect(result.summary).toMatchObject({
            errors: expect.any(Number),
            warnings: expect.any(Number),
            infos: expect.any(Number),
        })
    })

    it('summary counts match issues array length', () => {
        const engine = new ScannerEngine()
        const resource = makeResource()
        const result = engine.scan(resource)

        const { errors, warnings, infos } = result.summary
        expect(errors).toBe(result.issues.filter(i => i.level === 'error').length)
        expect(warnings).toBe(result.issues.filter(i => i.level === 'warning').length)
        expect(infos).toBe(result.issues.filter(i => i.level === 'info').length)
    })

    it('clean resource produces no issues', () => {
        const engine = new ScannerEngine()
        const result = engine.scan(makeResource())
        expect(result.issues).toHaveLength(0)
        expect(result.summary.errors).toBe(0)
        expect(result.summary.warnings).toBe(0)
        expect(result.summary.infos).toBe(0)
    })

    it('sensitive environment variable produces an error', () => {
        // sensitive-env-var fires as 'error' for plain-text secrets in env vars.
        // Privileged container security checks (privileged: true) are now handled
        // by the kubesec Go library, not the local engine.
        const engine = new ScannerEngine()
        const resource = makeResource({
            spec: {
                template: {
                    spec: {
                        containers: [{
                            name: 'app',
                            image: 'my-app:1.0.0',
                            resources: { limits: { cpu: '100m', memory: '128Mi' } },
                            securityContext: { runAsNonRoot: true },
                            livenessProbe: { httpGet: { path: '/healthz', port: 8080 } },
                            readinessProbe: { httpGet: { path: '/ready', port: 8080 } },
                            env: [{ name: 'DB_PASSWORD', value: 'supersecret' }],
                        }],
                        securityContext: { runAsNonRoot: true },
                    }
                }
            }
        })
        const result = engine.scan(resource)
        expect(result.summary.errors).toBeGreaterThanOrEqual(1)
        expect(result.issues.some(i => i.ruleId === 'sensitive-env-var')).toBe(true)
    })

    it('missing resource limits produces a warning', () => {
        const engine = new ScannerEngine()
        const resource = makeResource({
            spec: {
                template: {
                    spec: {
                        containers: [{
                            name: 'app',
                            image: 'my-app:1.0.0',
                            resources: {},
                            securityContext: { runAsNonRoot: true },
                            livenessProbe: {},
                            readinessProbe: {},
                        }],
                        securityContext: { runAsNonRoot: true },
                    }
                }
            }
        })
        const result = engine.scan(resource)
        expect(result.issues.some(i => i.ruleId === 'no-resource-limits')).toBe(true)
        expect(result.summary.warnings).toBeGreaterThanOrEqual(1)
    })

    it('latest image tag produces a warning', () => {
        const engine = new ScannerEngine()
        const resource = makeResource({
            spec: {
                template: {
                    spec: {
                        containers: [{
                            name: 'app',
                            image: 'nginx:latest',
                            resources: { limits: { cpu: '100m', memory: '128Mi' } },
                            securityContext: { runAsNonRoot: true },
                            livenessProbe: {},
                            readinessProbe: {},
                        }],
                        securityContext: { runAsNonRoot: true },
                    }
                }
            }
        })
        const result = engine.scan(resource)
        expect(result.issues.some(i => i.ruleId === 'latest-image-tag')).toBe(true)
    })

    it('missing liveness probe produces an info', () => {
        const engine = new ScannerEngine()
        const resource = makeResource({
            spec: {
                template: {
                    spec: {
                        containers: [{
                            name: 'app',
                            image: 'my-app:1.0.0',
                            resources: { limits: { cpu: '100m', memory: '128Mi' } },
                            securityContext: { runAsNonRoot: true },
                            readinessProbe: {},
                            // no livenessProbe
                        }],
                        securityContext: { runAsNonRoot: true },
                    }
                }
            }
        })
        const result = engine.scan(resource)
        expect(result.issues.some(i => i.ruleId === 'missing-liveness-probe')).toBe(true)
        expect(result.summary.infos).toBeGreaterThanOrEqual(1)
    })

    it('missing readiness probe produces a warning', () => {
        const engine = new ScannerEngine()
        const resource = makeResource({
            spec: {
                template: {
                    spec: {
                        containers: [{
                            name: 'app',
                            image: 'my-app:1.0.0',
                            resources: { limits: { cpu: '100m', memory: '128Mi' } },
                            securityContext: { runAsNonRoot: true },
                            livenessProbe: {},
                            // no readinessProbe
                        }],
                        securityContext: { runAsNonRoot: true },
                    }
                }
            }
        })
        const result = engine.scan(resource)
        expect(result.issues.some(i => i.ruleId === 'missing-readiness-probe')).toBe(true)
    })

    it('multiple bad containers accumulate all issues', () => {
        // Local engine rules: no-resource-limits (warn), latest-image-tag (warn),
        // missing-readiness-probe (warn), missing-liveness-probe (info).
        // No local engine error rules fire here — privileged container checks
        // are handled by kubesec, not the local engine.
        const engine = new ScannerEngine()
        const resource = makeResource({
            spec: {
                template: {
                    spec: {
                        containers: [
                            {
                                name: 'sidecar',
                                image: 'sidecar:latest',
                                resources: {},
                                securityContext: { privileged: true },
                                // no probes
                            },
                            {
                                name: 'app',
                                image: 'app:latest',
                                resources: {},
                                securityContext: {},
                                // no probes
                            },
                        ],
                        securityContext: {},
                    }
                }
            }
        })
        const result = engine.scan(resource)
        expect(result.summary.warnings).toBeGreaterThanOrEqual(2)
        expect(result.issues.length).toBeGreaterThan(4)
    })

    it('addRule extends the engine with a custom rule', () => {
        const engine = new ScannerEngine()
        engine.addRule({
            id: 'custom-rule',
            name: 'Custom Test Rule',
            description: 'Always fires',
            level: 'info',
            category: 'best-practice',
            validate: () => [{
                ruleId: 'custom-rule',
                level: 'info',
                message: 'Custom issue detected',
            }],
        })
        const result = engine.scan(makeResource())
        expect(result.issues.some(i => i.ruleId === 'custom-rule')).toBe(true)
        // custom rule adds +1 info on top of whatever defaults return
        expect(result.summary.infos).toBeGreaterThanOrEqual(1)
    })

    it('rule errors are caught and do not abort the scan', () => {
        const engine = new ScannerEngine()
        engine.addRule({
            id: 'throw-rule',
            name: 'Throwing Rule',
            description: 'Throws an error',
            level: 'error',
            category: 'security',
            validate: () => { throw new Error('rule explosion') },
        })
        // Should not throw — just logs the error
        expect(() => engine.scan(makeResource())).not.toThrow()
    })
})
