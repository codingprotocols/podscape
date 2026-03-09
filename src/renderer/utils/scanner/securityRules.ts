import { ScannerRule, ScanIssue } from './types'

// Returns all containers (app + init) with their path prefix for informative error paths
function allContainers(podSpec: any): { c: any; prefix: string }[] {
    return [
        ...(podSpec.containers ?? []).map((c: any) => ({ c, prefix: 'containers' })),
        ...(podSpec.initContainers ?? []).map((c: any) => ({ c, prefix: 'initContainers' })),
    ]
}

export const securityRules: ScannerRule[] = [
    {
        id: 'privileged-container',
        name: 'Privileged Container',
        description: 'Privileged containers have root access to the host.',
        level: 'error',
        category: 'security',
        validate: (resource) => {
            const issues: ScanIssue[] = []
            const podSpec = (resource as any).spec?.template?.spec || (resource as any).spec
            if (!podSpec?.containers) return issues

            for (const { c, prefix } of allContainers(podSpec)) {
                if (c.securityContext?.privileged) {
                    issues.push({
                        ruleId: 'privileged-container',
                        level: 'error',
                        message: `Container ${c.name} is running in privileged mode`,
                        path: `spec.${prefix}[name=${c.name}].securityContext.privileged`,
                        suggestion: 'Set securityContext.privileged to false.'
                    })
                }
            }
            return issues
        }
    },
    {
        id: 'host-path-mount',
        name: 'hostPath Volume Mount',
        description: 'hostPath volumes can be used to escape container boundaries.',
        level: 'warning',
        category: 'security',
        validate: (resource) => {
            const issues: ScanIssue[] = []
            const podSpec = (resource as any).spec?.template?.spec || (resource as any).spec
            if (!podSpec?.volumes) return issues

            for (const v of podSpec.volumes) {
                if (v.hostPath) {
                    issues.push({
                        ruleId: 'host-path-mount',
                        level: 'warning',
                        message: `Volume ${v.name} uses hostPath mount (${v.hostPath.path})`,
                        path: `spec.volumes[name=${v.name}].hostPath`,
                        suggestion: 'Use local PVs or other volume types instead of hostPath.'
                    })
                }
            }
            return issues
        }
    },
    {
        id: 'run-as-root',
        name: 'Run as Root',
        description: 'Containers should not run as root user.',
        level: 'warning',
        category: 'security',
        validate: (resource) => {
            const issues: ScanIssue[] = []
            const podSpec = (resource as any).spec?.template?.spec || (resource as any).spec
            if (!podSpec?.containers) return issues

            const podSc = podSpec.securityContext ?? {}

            for (const { c, prefix } of allContainers(podSpec)) {
                const cSc = c.securityContext ?? {}
                // Container-level takes priority over pod-level
                const runAsNonRoot = cSc.runAsNonRoot ?? podSc.runAsNonRoot
                const runAsUser = cSc.runAsUser ?? podSc.runAsUser

                const likelyRoot =
                    runAsUser === 0 ||
                    runAsNonRoot === false ||
                    (runAsNonRoot === undefined && runAsUser === undefined)

                if (likelyRoot) {
                    issues.push({
                        ruleId: 'run-as-root',
                        level: 'warning',
                        message: `Container ${c.name} may be running as root`,
                        path: `spec.${prefix}[name=${c.name}].securityContext.runAsNonRoot`,
                        suggestion: 'Set securityContext.runAsNonRoot to true or runAsUser to a non-zero UID.'
                    })
                }
            }
            return issues
        }
    }
]
