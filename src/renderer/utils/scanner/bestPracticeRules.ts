import { ScannerRule, ScanIssue } from './types'

function allContainers(podSpec: any): { c: any; prefix: string }[] {
    return [
        ...(podSpec.containers ?? []).map((c: any) => ({ c, prefix: 'containers' })),
        ...(podSpec.initContainers ?? []).map((c: any) => ({ c, prefix: 'initContainers' })),
    ]
}

const SENSITIVE_KEYWORDS = ['PASSWORD', 'TOKEN', 'SECRET', 'KEY', 'AUTH', 'API_KEY']

export const bestPracticeRules: ScannerRule[] = [
    {
        id: 'no-resource-limits',
        name: 'Missing Resource Limits',
        description: 'Containers should have CPU and Memory limits defined.',
        level: 'warning',
        category: 'best-practice',
        validate: (resource) => {
            const issues: ScanIssue[] = []
            const podSpec = (resource as any).spec?.template?.spec || (resource as any).spec
            if (!podSpec?.containers) return issues

            for (const { c, prefix } of allContainers(podSpec)) {
                if (!c.resources?.limits?.cpu || !c.resources?.limits?.memory) {
                    issues.push({
                        ruleId: 'no-resource-limits',
                        level: 'warning',
                        message: `Container ${c.name} is missing CPU or Memory limits`,
                        path: `spec.${prefix}[name=${c.name}].resources.limits`,
                        suggestion: 'Define CPU and memory limits to prevent resource exhaustion.'
                    })
                }
            }
            return issues
        }
    },
    {
        id: 'latest-image-tag',
        name: 'Latest Image Tag',
        description: 'Using the :latest tag makes it hard to roll back and reproduce builds.',
        level: 'warning',
        category: 'best-practice',
        validate: (resource) => {
            const issues: ScanIssue[] = []
            const podSpec = (resource as any).spec?.template?.spec || (resource as any).spec
            if (!podSpec?.containers) return issues

            for (const { c, prefix } of allContainers(podSpec)) {
                if (c.image?.endsWith(':latest') || (c.image && !c.image.includes(':'))) {
                    issues.push({
                        ruleId: 'latest-image-tag',
                        level: 'warning',
                        message: `Container ${c.name} uses the :latest image tag`,
                        path: `spec.${prefix}[name=${c.name}].image`,
                        suggestion: 'Use a specific version tag instead of :latest.'
                    })
                }
            }
            return issues
        }
    },
    {
        id: 'missing-liveness-probe',
        name: 'Missing Liveness Probe',
        description: 'Liveness probes help Kubernetes detect and restart unhealthy containers.',
        level: 'info',
        category: 'best-practice',
        validate: (resource) => {
            const issues: ScanIssue[] = []
            const podSpec = (resource as any).spec?.template?.spec || (resource as any).spec
            if (!podSpec?.containers) return issues

            for (const c of podSpec.containers) {
                if (!c.livenessProbe) {
                    issues.push({
                        ruleId: 'missing-liveness-probe',
                        level: 'info',
                        message: `Container ${c.name} is missing a liveness probe`,
                        path: `spec.containers[name=${c.name}].livenessProbe`,
                        suggestion: 'Add a livenessProbe to enable automatic container restarts on failure.'
                    })
                }
            }
            return issues
        }
    },
    {
        id: 'missing-readiness-probe',
        name: 'Missing Readiness Probe',
        description: 'Readiness probes prevent traffic from reaching containers that are not ready.',
        level: 'warning',
        category: 'best-practice',
        validate: (resource) => {
            const issues: ScanIssue[] = []
            const podSpec = (resource as any).spec?.template?.spec || (resource as any).spec
            if (!podSpec?.containers) return issues

            for (const c of podSpec.containers) {
                if (!c.readinessProbe) {
                    issues.push({
                        ruleId: 'missing-readiness-probe',
                        level: 'warning',
                        message: `Container ${c.name} is missing a readiness probe`,
                        path: `spec.containers[name=${c.name}].readinessProbe`,
                        suggestion: 'Add a readinessProbe to prevent traffic from being sent to unready pods.'
                    })
                }
            }
            return issues
        }
    },
    {
        id: 'sensitive-env-var',
        name: 'Sensitive Env Variable',
        description: 'Secrets should not be stored as plain-text environment variable values.',
        level: 'error',
        category: 'best-practice',
        validate: (resource) => {
            const issues: ScanIssue[] = []
            const podSpec = (resource as any).spec?.template?.spec || (resource as any).spec
            if (!podSpec?.containers) return issues

            for (const { c, prefix } of allContainers(podSpec)) {
                for (const e of c.env ?? []) {
                    if (e.value && SENSITIVE_KEYWORDS.some(k => e.name.toUpperCase().includes(k))) {
                        issues.push({
                            ruleId: 'sensitive-env-var',
                            level: 'error',
                            message: `Container ${c.name} has sensitive variable ${e.name} in plain text`,
                            path: `spec.${prefix}[name=${c.name}].env[name=${e.name}].value`,
                            suggestion: 'Use a secretKeyRef to inject sensitive values from a Secret.'
                        })
                    }
                }
            }
            return issues
        }
    },
]
