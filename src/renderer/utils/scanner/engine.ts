import { AnyKubeResource } from '../../types'
import { ScanResult, ScannerRule, ScanIssue } from './types'
import { securityRules } from './securityRules'
import { bestPracticeRules } from './bestPracticeRules'

export type { ScanResult } from './types'

export class ScannerEngine {
    private rules: ScannerRule[] = []

    constructor() {
        this.rules = [...securityRules, ...bestPracticeRules]
    }

    scan(resource: AnyKubeResource): ScanResult {
        const issues: ScanIssue[] = []

        for (const rule of this.rules) {
            try {
                const findings = rule.validate(resource)
                issues.push(...findings)
            } catch (err) {
                console.error(`Error running rule ${rule.id} on ${resource.metadata.name}:`, err)
            }
        }

        return {
            resourceUid: resource.metadata.uid,
            issues,
            summary: {
                errors: issues.filter(i => i.level === 'error').length,
                warnings: issues.filter(i => i.level === 'warning').length,
                infos: issues.filter(i => i.level === 'info').length
            }
        }
    }

    addRule(rule: ScannerRule) {
        this.rules.push(rule)
    }
}

export const scannerEngine = new ScannerEngine()
