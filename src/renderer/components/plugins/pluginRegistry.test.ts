import { describe, it, expect } from 'vitest'
import krewPluginsJson from '../../config/krewPlugins.json'

describe('pluginRegistry', () => {
    it('has a registry entry for every plugin in krewPlugins.json', async () => {
        const { getPlugin } = await import('./pluginRegistry')
        for (const plugin of krewPluginsJson) {
            expect(getPlugin(plugin.name), `missing registry entry for ${plugin.name}`).not.toBeNull()
        }
    })
})
