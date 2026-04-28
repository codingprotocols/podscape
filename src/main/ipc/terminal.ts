import { ipcMain } from 'electron'
import WebSocket from 'ws'
import { activeSidecarPort } from '../sidecar/runtime'
import { sidecarToken } from '../sidecar/auth'
import { SIDECAR_HOST } from '../../common/constants'

const activeStreams = new Map<string, any>()

export function cancelAllExecStreams(): void {
  for (const [id, ws] of activeStreams) {
    ws.removeAllListeners()
    activeStreams.delete(id)
    try { ws.close() } catch {}
  }
}

export function registerTerminalHandlers(): void {
  // ── Exec into container ───────────────────────────────────────────────────

  ipcMain.handle(
    'exec:start',
    (event, _context: string, namespace: string, pod: string, container: string) => {
      const id = `exec-${Date.now()}-${Math.floor(Math.random() * 10000)}`

      const ws = new WebSocket(`ws://${SIDECAR_HOST}:${activeSidecarPort}/exec?namespace=${namespace}&pod=${pod}&container=${container}&command=sh`, {
        headers: { 'X-Podscape-Token': sidecarToken }
      })

      activeStreams.set(id, ws)
      const sender = event.sender

      ws.on('message', (data: Buffer) => {
        if (!sender.isDestroyed()) sender.send('exec:data', id, data.toString())
      })

      ws.on('error', (err: Error) => {
        console.error(`[Exec] WS error ${id}:`, err)
        if (!sender.isDestroyed()) sender.send('exec:error', id, err.message)
      })

      ws.on('close', () => {
        ws.removeAllListeners()
        activeStreams.delete(id)
        if (!sender.isDestroyed()) sender.send('exec:exit', id)
      })

      // Wait for the WebSocket handshake to complete before returning the id.
      // Callers (resize, initial write) must not send data until the connection
      // is open — writes before OPEN are silently dropped by the ws library.
      return new Promise<string>((resolve, reject) => {
        ws.once('open', () => resolve(id))
        ws.once('error', (err: Error) => {
          activeStreams.delete(id)
          reject(err)
        })
      })
    }
  )

  ipcMain.handle('exec:write', (_event, id: string, data: string) => {
    const ws = activeStreams.get(id)
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(data) } catch (err) {
        console.error(`[Exec] send failed for ${id}:`, err)
      }
    }
  })

  ipcMain.handle('exec:resize', (_event, _id: string, _cols: number, _rows: number) => {
    // TODO: Implement resizing in Go sidecar if needed
  })

  ipcMain.handle('exec:kill', (_event, id: string) => {
    const ws = activeStreams.get(id)
    if (ws) {
      ws.removeAllListeners()
      activeStreams.delete(id)
      try { ws.close() } catch {}
    }
  })

}
