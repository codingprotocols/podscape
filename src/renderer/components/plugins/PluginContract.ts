import type React from 'react'
import type { KrewPlugin } from '../../store/slices/krewSlice'

export interface PluginInfoPanelProps {
    plugin: KrewPlugin
    onInstall: () => Promise<void>
    onUninstall: () => Promise<void>
    onOpen?: () => void
}

export interface PluginRunPanelProps {
    namespace: string
    context: string
}

export interface PluginModule {
    InfoPanel: React.ComponentType<PluginInfoPanelProps>
    RunPanel: React.ComponentType<PluginRunPanelProps>
}
