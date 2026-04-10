import { app, Menu, shell, MenuItemConstructorOptions } from 'electron'
import { autoUpdater } from 'electron-updater'

const isMac = process.platform === 'darwin'

export function setupMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    // { role: 'appMenu' }
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              {
                label: 'Check for Updates...',
                click: () => autoUpdater.checkForUpdates()
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' }
            ]
          }
        ] as MenuItemConstructorOptions[]
      : []),
    // { role: 'fileMenu' }
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }]
    } as MenuItemConstructorOptions,
    // { role: 'editMenu' }
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
              { type: 'separator' },
              {
                label: 'Speech',
                submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }]
              }
            ] as MenuItemConstructorOptions[]
          : [
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' }
            ] as MenuItemConstructorOptions[])
      ]
    } as MenuItemConstructorOptions,
    // { role: 'viewMenu' }
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    } as MenuItemConstructorOptions,
    // { role: 'windowMenu' }
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' }
            ] as MenuItemConstructorOptions[]
          : [{ role: 'close' }] as MenuItemConstructorOptions[])
      ]
    } as MenuItemConstructorOptions,
    {
      role: 'help',
      submenu: [
        {
          label: 'Documentation',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: async () => {
            await shell.openExternal('https://codingprotocols.github.io/podscape/')
          }
        },
        { type: 'separator' },
        {
          label: 'Ask a Question',
          click: async () => {
            await shell.openExternal('https://github.com/codingprotocols/podscape/discussions/new?category=q-a')
          }
        },
        {
          label: 'Report an Issue',
          click: async () => {
            await shell.openExternal('https://github.com/codingprotocols/podscape/issues/new')
          }
        },
        { type: 'separator' },
        {
          label: 'Search Community Conversations',
          click: async () => {
            await shell.openExternal('https://github.com/codingprotocols/podscape/discussions')
          }
        },
        ...(!isMac ? [
          { type: 'separator' },
          {
            label: 'Check for Updates...',
            click: () => autoUpdater.checkForUpdates()
          }
        ] as MenuItemConstructorOptions[] : [])
      ]
    } as MenuItemConstructorOptions
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
