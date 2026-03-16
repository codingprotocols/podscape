import { describe, it, expect } from 'vitest'
import { buildUnifiedResults } from '../utils/security/buildUnifiedResults'

describe('buildUnifiedResults', () => {
    it('includes kubesec findings for resources with no best-practice issues (Architecture 1A fix)', () => {
        const results = buildUnifiedResults(
            [],  // no engine findings
            null,
            {
                'default/nginx/Deployment': {
                    score: 0,
                    issues: [{ id: 'SYS_ADMIN', reason: 'Do not use CAP_SYS_ADMIN', selector: 'containers[] .securityContext .capabilities', points: 7 }],
                },
            }
        )
        expect(results).toHaveLength(1)
        expect(results[0].name).toBe('nginx')
        expect(results[0].namespace).toBe('default')
        expect(results[0].kind).toBe('Deployment')
        expect(results[0].issues).toHaveLength(1)
        expect(results[0].issues[0].ruleId).toBe('SYS_ADMIN')
    })

    it('uses item.reason as suggestion for kubesec issues (Code Quality 3A fix)', () => {
        const results = buildUnifiedResults([], null, {
            'ns/app/Pod': {
                score: 0,
                issues: [{ id: 'CAPS', reason: 'Drop all capabilities', selector: '.spec', points: 5 }],
            },
        })
        expect(results[0].issues[0].suggestion).toBe('Drop all capabilities')
    })

    it('kubesec issue level is error when points >= 5, warning otherwise', () => {
        const results = buildUnifiedResults([], null, {
            'ns/app/Pod': {
                score: 0,
                issues: [
                    { id: 'HIGH', reason: 'High', selector: '.spec', points: 7 },
                    { id: 'LOW', reason: 'Low', selector: '.spec', points: 3 },
                ],
            },
        })
        expect(results[0].issues[0].level).toBe('error')   // points >= 5
        expect(results[0].issues[1].level).toBe('warning') // points < 5
    })

    it('merges trivy CVEs with engine issues for the same resource', () => {
        const scanResults = [{
            resource: { metadata: { name: 'api', namespace: 'prod' }, kind: 'Deployment' },
            result: { issues: [{ ruleId: 'no-resource-limits', level: 'warning', message: 'No limits', suggestion: 'Set limits' }] },
        }]
        const trivyData = {
            Resources: [{
                Name: 'api', Namespace: 'prod', Kind: 'Deployment',
                Results: [{ Vulnerabilities: [{ VulnerabilityID: 'CVE-2023-1234', Severity: 'CRITICAL', Title: 'Test CVE' }] }],
            }],
        }
        const results = buildUnifiedResults(scanResults, trivyData, null)
        expect(results).toHaveLength(1)
        expect(results[0].issues).toHaveLength(1)
        expect(results[0].vulnerabilities).toHaveLength(1)
        expect(results[0].vulnerabilities[0].id).toBe('CVE-2023-1234')
    })

    it('trivy finding for a resource with no engine issues creates a new entry', () => {
        const trivyData = {
            Resources: [{
                Name: 'clean-app', Namespace: 'prod', Kind: 'Pod',
                Results: [{ Vulnerabilities: [{ VulnerabilityID: 'CVE-2023-9999', Severity: 'HIGH', Title: 'Library vuln' }] }],
            }],
        }
        const results = buildUnifiedResults([], trivyData, null)
        expect(results).toHaveLength(1)
        expect(results[0].name).toBe('clean-app')
        expect(results[0].vulnerabilities).toHaveLength(1)
    })

    it('sorts results by total issue count descending', () => {
        const scanResults = [
            {
                resource: { metadata: { name: 'few', namespace: 'ns' }, kind: 'Deployment' },
                result: { issues: [{ ruleId: 'r1', level: 'warning', message: 'm', suggestion: 's' }] },
            },
            {
                resource: { metadata: { name: 'many', namespace: 'ns' }, kind: 'Deployment' },
                result: { issues: [
                    { ruleId: 'r1', level: 'warning', message: 'm', suggestion: 's' },
                    { ruleId: 'r2', level: 'error', message: 'm', suggestion: 's' },
                    { ruleId: 'r3', level: 'warning', message: 'm', suggestion: 's' },
                ] },
            },
        ]
        const results = buildUnifiedResults(scanResults, null, null)
        expect(results[0].name).toBe('many')
        expect(results[1].name).toBe('few')
    })

    it('returns empty array when all inputs are empty', () => {
        expect(buildUnifiedResults([], null, null)).toHaveLength(0)
        expect(buildUnifiedResults([], null, {})).toHaveLength(0)
    })

    it('ignores kubesec entries with no issues', () => {
        const results = buildUnifiedResults([], null, {
            'ns/clean/Pod': { score: 100, issues: [] },
        })
        expect(results).toHaveLength(0)
    })
})
