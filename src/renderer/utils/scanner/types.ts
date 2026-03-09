import { AnyKubeResource } from '../../types'

export type IssueLevel = 'error' | 'warning' | 'info'

export interface ScanIssue {
    ruleId: string
    level: IssueLevel
    message: string
    path?: string // JSON path to the field causing the issue
    suggestion?: string
}

export interface ScannerRule {
    id: string
    name: string
    description: string
    level: IssueLevel
    category: 'security' | 'best-practice'
    validate: (resource: AnyKubeResource) => ScanIssue[]
}

export interface ScanResult {
    resourceUid: string
    issues: ScanIssue[]
    summary: {
        errors: number
        warnings: number
        infos: number
    }
}
