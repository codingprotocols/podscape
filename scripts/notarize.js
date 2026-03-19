/**
 * Notarize the macOS app after electron-builder signs it.
 * Called automatically via the "afterSign" hook in package.json.
 *
 * Required environment variables (set as GitHub Actions secrets):
 *   APPLE_ID                  — your Apple ID email
 *   APPLE_APP_SPECIFIC_PASSWORD — app-specific password from appleid.apple.com
 *   APPLE_TEAM_ID             — 10-char team ID from developer.apple.com
 *
 * Skipped automatically when CSC_IDENTITY_AUTO_DISCOVERY=false (Linux/Windows CI)
 * or when APPLE_ID is not set.
 *
 * Retries up to 3 times with a 30 s delay to handle transient network drops
 * on GitHub Actions macOS runners while polling appstoreconnect.apple.com.
 */

const { notarize } = require('@electron/notarize')
const path = require('path')

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 30_000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function notarizeWithRetry(options) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await notarize(options)
      return
    } catch (err) {
      const isNetworkError =
        err.message?.includes('offline') ||
        err.message?.includes('NSURLErrorDomain') ||
        err.message?.includes('-1009') ||
        err.message?.includes('ENOTFOUND') ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('ETIMEDOUT')

      if (isNetworkError && attempt < MAX_ATTEMPTS) {
        console.log(`notarize: network error on attempt ${attempt}/${MAX_ATTEMPTS} — retrying in ${RETRY_DELAY_MS / 1000}s`)
        console.log(`notarize: error was: ${err.message?.split('\n')[0]}`)
        await sleep(RETRY_DELAY_MS)
        continue
      }

      throw err
    }
  }
}

module.exports = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context

  // Only notarize on macOS
  if (electronPlatformName !== 'darwin') return

  // Skip if Apple credentials are not configured (unsigned local dev builds)
  if (!process.env.APPLE_ID) {
    console.log('notarize: APPLE_ID not set — skipping notarization')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)

  console.log(`notarize: submitting ${appPath}`)

  await notarizeWithRetry({
    tool: 'notarytool',
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  })

  console.log(`notarize: done`)
}
