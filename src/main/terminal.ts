import { ipcMain } from 'electron'
import { activeSidecarPort } from './runtime'
import { sidecarToken } from './auth'
import { SIDECAR_HOST } from '../common/constants'

const activeStreams = new Map<string, any>()

export function cancelAllExecStreams(): void {
  for (const [id, ws] of activeStreams) {
    try { ws.close() } catch {}
    activeStreams.delete(id)
  }
}

export function registerTerminalHandlers(): void {
  // ── Exec into container ───────────────────────────────────────────────────

  ipcMain.handle(
    'exec:start',
    (event, _context: string, namespace: string, pod: string, container: string) => {
      const id = `exec-${Date.now()}`
      
      const WebSocket = require('ws')
      const ws = new WebSocket(`ws://${SIDECAR_HOST}:${activeSidecarPort}/exec?namespace=${namespace}&pod=${pod}&container=${container}&command=sh`, {
        headers: { 'X-Podscape-Token': sidecarToken }
      })
      
      activeStreams.set(id, ws)
      const sender = event.sender

      ws.on('open', () => {
        // Ready
      })

      ws.on('message', (data: Buffer) => {
        if (!sender.isDestroyed()) sender.send('exec:data', id, data.toString())
      })

      ws.on('error', (err: any) => {
        console.error(`[Exec] WS error ${id}:`, err)
      })

      ws.on('close', () => {
        activeStreams.delete(id)
        if (!sender.isDestroyed()) sender.send('exec:exit', id)
      })

      return id
    }
  )

  ipcMain.handle('exec:write', (_event, id: string, data: string) => {
    const ws = activeStreams.get(id)
    if (ws && ws.readyState === 1) { // OPEN
      ws.send(data)
    }
  })

  ipcMain.handle('exec:resize', (_event, _id: string, _cols: number, _rows: number) => {
    // TODO: Implement resizing in Go sidecar if needed
  })

  ipcMain.handle('exec:kill', (_event, id: string) => {
    const ws = activeStreams.get(id)
    if (ws) {
      ws.close()
      activeStreams.delete(id)
    }
  })

}
