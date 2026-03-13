import { ChildProcess, spawn } from 'child_process'
import { join } from 'path'
import { existsSync, chmodSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { app } from 'electron'
import { getAugmentedEnv } from './env'
import { findKubeconfigPath } from './settings_storage'
import { SIDECAR_PORT, SIDECAR_BASE_URL } from '../common/constants'

let sidecarProcess: ChildProcess | null = null

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

  const child = spawn(binaryPath, ['-port', String(SIDECAR_PORT), '-kubeconfig', kubeconfigPath], {
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
    }
  })

  // Wait for sidecar to be ready
  return new Promise((resolve, reject) => {
    let attempts = 0
    const maxAttempts = 30
    const interval = 300

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
        const response = await fetch(`${SIDECAR_BASE_URL}/health`)
        if (response.ok) {
          console.log('[Sidecar] Sidecar is ready')
          child.removeListener('error', errorHandler)
          child.removeListener('exit', exitHandler)
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
        reject(new Error(`Sidecar failed to start after ${maxAttempts} attempts`))
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

    proc.kill('SIGTERM')
  })
}
