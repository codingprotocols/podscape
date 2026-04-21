import React from 'react'
import { PluginInfoLayout } from '../PluginInfoLayout'
import type { PluginInfoPanelProps } from '../PluginContract'

export function InfoPanel(props: PluginInfoPanelProps): JSX.Element {
    return <PluginInfoLayout {...props} />
}
