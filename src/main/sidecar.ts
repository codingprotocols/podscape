import { ChildProcess, spawn } from 'child_process'
import { join } from 'path'
import { existsSync, chmodSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { app, BrowserWindow } from 'electron'
import { getAugmentedEnv } from './env'
import { findKubeconfigPath } from './settings_storage'
import { SIDECAR_HOST, SIDECAR_PORT } from '../common/constants'
import { sidecarToken } from './auth'
import { activeSidecarPort, setActiveSidecarPort } from './runtime'

let sidecarProcess: ChildProcess | null = null
let startupComplete = false

async function findFreePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const net = require('net')
    const server = net.createServer()
    server.listen(preferred, '127.0.0.1', () => {
      server.close(() => resolve(preferred))
    })
    server.on('error', () => {
      const s2 = net.createServer()
      s2.listen(0, '127.0.0.1', () => {
        const port = (s2.address() as any).port
        s2.close(() => resolve(port))
      })
    })
  })
}

export async function startSidecar(): Promise<void> {
  if (sidecarProcess) {
    await stopSidecar()
  }

  const binaryName = process.platform === 'win32' ? 'podscape-core.exe' : 'podscape-core'
  
  // In development, the binary is in go-core/
  // In production, it is in the app's resources/bin folder (bundled via extraResources)
  const binaryPath = is.dev 
    ? join(app.getAppPath(), 'go-core', binaryName)
    : join(process.resourcesPath, 'bin', binaryName)

  if (!existsSync(binaryPath)) {
    throw new Error(`Sidecar binary not found at: ${binaryPath}`)
  }

  // Ensure executable permissions on Mac/Linux
  if (process.platform !== 'win32') {
    try {
      chmodSync(binaryPath, 0o755)
    } catch (err) {
      console.warn(`[Sidecar] Failed to set executable permissions: ${err}`)
    }
  }

  console.log(`[Sidecar] Starting from: ${binaryPath}`)

  const kubeconfigPath = findKubeconfigPath()
  console.log(`[Sidecar] Using kubeconfig: ${kubeconfigPath}`)

  const port = await findFreePort(SIDECAR_PORT)
  setActiveSidecarPort(port)
  if (port !== SIDECAR_PORT) {
    console.log(`[Sidecar] Port ${SIDECAR_PORT} in use — using port ${port}`)
  }

  const child = spawn(binaryPath, ['-port', String(port), '-kubeconfig', kubeconfigPath, '-token', sidecarToken], {
    stdio: is.dev ? 'inherit' : 'pipe',
    env: getAugmentedEnv(),
    windowsHide: true,
    cwd: is.dev ? join(app.getAppPath(), 'go-core') : join(process.resourcesPath, 'bin')
  })

  sidecarProcess = child

  child.on('error', (err) => {
    console.error('[Sidecar] Failed to start:', err)
  })

  child.on('exit', (code, signal) => {
    console.log(`[Sidecar] Process exited. Code: ${code}, Signal: ${signal}`)
    if (sidecarProcess === child) {
      sidecarProcess = null
      // Notify the renderer if the sidecar dies after startup (not during normal shutdown).
      if (startupComplete) {
        BrowserWindow.getAllWindows()[0]?.webContents.send('sidecar:crashed', { code, signal })
      }
    }
  })

  // Wait for sidecar to be ready
  return new Promise((resolve, reject) => {
    let attempts = 0
    const maxAttempts = 180  // 180 × 500 ms = 90 s — covers large cluster cache sync
    const interval = 500

    const errorHandler = (err: Error) => {
      reject(new Error(`Sidecar failed to start: ${err.message}`))
    }

    const exitHandler = (code: number | null, signal: string | null) => {
      reject(new Error(`Sidecar exited during startup. Code: ${code}, Signal: ${signal}`))
    }

    child.once('error', errorHandler)
    child.once('exit', exitHandler)

    const checkReady = async () => {
      try {
        const response = await fetch(`http://${SIDECAR_HOST}:${activeSidecarPort}/health`)
        if (response.ok) {
          console.log('[Sidecar] Sidecar is ready')
          child.removeListener('error', errorHandler)
          child.removeListener('exit', exitHandler)
          startupComplete = true
          resolve()
          return
        }
      } catch (err) {
        // Expected during startup
      }

      attempts++
      if (attempts >= maxAttempts) {
        child.removeListener('error', errorHandler)
        child.removeListener('exit', exitHandler)
        reject(new Error(`Sidecar failed to become ready after ${maxAttempts * interval / 1000}s — check kubeconfig and cluster connectivity`))
        return
      }

      if (!sidecarProcess) {
        // Already handled by exitHandler if it happened during check
        return
      }

      setTimeout(checkReady, interval)
    }

    checkReady()
  })
}

export async function stopSidecar(): Promise<void> {
  const proc = sidecarProcess
  if (!proc) return

  return new Promise((resolve) => {
    startupComplete = false  // suppress crash notification on intentional stop
    sidecarProcess = null

    console.log(`[Sidecar] Stopping sidecar (pid: ${proc.pid})...`)

    const forceKillTimeout = setTimeout(() => {
      console.warn('[Sidecar] Stop timeout, forcing SIGKILL')
      proc.kill('SIGKILL')
    }, 2000)

    proc.once('exit', (code, signal) => {
      clearTimeout(forceKillTimeout)
      console.log(`[Sidecar] Sidecar exited. Code: ${code}, Signal: ${signal}`)
      resolve()
    })

    // Try graceful shutdown with SIGTERM
    proc.kill('SIGTERM')
  })
}

// Fallback: Ensure sidecar is killed if main process exits unexpectedly
process.on('exit', () => {
  if (sidecarProcess) {
    sidecarProcess.kill('SIGKILL')
  }
})
