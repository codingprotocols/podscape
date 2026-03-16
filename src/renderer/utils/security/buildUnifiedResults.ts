// Pure function extracted from SecurityHub — no React/store dependencies, fully testable.

export type UnifiedResource = {
    name: string
    namespace: string
    kind?: string
    issues: any[]
    vulnerabilities: any[]
}

export function buildUnifiedResults(
    scanResults: Array<{ resource: any; result: { issues: any[] } }>,
    securityScanResults: any,
    kubesecBatchResults: Record<string, any> | null,
): UnifiedResource[] {
    const resourceMap = new Map<string, UnifiedResource>()

    // 1. Best-practice / engine findings
    scanResults.forEach(r => {
        const key = `${r.resource.metadata.namespace}/${r.resource.metadata.name}/${r.resource.kind}`
        resourceMap.set(key, {
            name: r.resource.metadata.name,
            namespace: r.resource.metadata.namespace,
            kind: r.resource.kind,
            issues: r.result.issues.map((i: any) => ({ ...i, source: 'config' })),
            vulnerabilities: [],
        })
    })

    // 2. Trivy image CVE findings
    securityScanResults?.Resources?.forEach((res: any) => {
        const key = `${res.Namespace}/${res.Name}/${res.Kind}`
        const existing = resourceMap.get(key) ?? {
            name: res.Name,
            namespace: res.Namespace,
            kind: res.Kind,
            issues: [],
            vulnerabilities: [],
        }
        res.Results?.forEach((tr: any) => {
            tr.Vulnerabilities?.forEach((v: any) => {
                existing.vulnerabilities.push({
                    id: v.VulnerabilityID,
                    severity: v.Severity,
                    title: v.Title || v.Description,
                })
            })
        })
        resourceMap.set(key, existing)
    })

    // 3. Kubesec batch findings — includes resources that had no engine issues.
    // Parse key: "namespace/name/kind" — split from end to handle namespace slashes.
    if (kubesecBatchResults) {
        Object.entries(kubesecBatchResults).forEach(([key, result]: [string, any]) => {
            if (!result?.issues?.length) return
            const parts = key.split('/')
            const kind = parts.pop() ?? ''
            const name = parts.pop() ?? ''
            const namespace = parts.join('/')
            const existing = resourceMap.get(key) ?? {
                name, namespace, kind, issues: [], vulnerabilities: [],
            }
            result.issues.forEach((item: any) => {
                existing.issues.push({
                    ruleId: item.id,
                    level: item.points >= 5 ? 'error' : 'warning',
                    message: item.reason,
                    path: item.selector,
                    suggestion: item.reason,
                    source: 'kubesec',
                })
            })
            resourceMap.set(key, existing)
        })
    }

    return Array.from(resourceMap.values()).sort(
        (a, b) => (b.issues.length + b.vulnerabilities.length) - (a.issues.length + a.vulnerabilities.length)
    )
}
