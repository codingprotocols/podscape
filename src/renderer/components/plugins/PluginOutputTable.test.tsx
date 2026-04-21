// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PluginOutputTable } from './PluginOutputTable'

describe('PluginOutputTable', () => {
    it('renders headers and rows from tabular text output', () => {
        const lines = [
            'NAMESPACE  NAME     IMAGE',
            'default    my-pod   nginx:latest',
        ]
        render(<PluginOutputTable lines={lines} />)
        expect(screen.getByText('NAMESPACE')).toBeDefined()
        expect(screen.getByText('my-pod')).toBeDefined()
    })

    it('skips stderr lines', () => {
        const lines = [
            '[stderr] some error',
            'NAME   VALUE',
            'foo    bar',
        ]
        render(<PluginOutputTable lines={lines} />)
        expect(screen.queryByText('[stderr] some error')).toBeNull()
        expect(screen.getByText('foo')).toBeDefined()
    })

    it('renders nothing when lines is empty', () => {
        const { container } = render(<PluginOutputTable lines={[]} />)
        expect(container.querySelector('table')).toBeNull()
    })
})
