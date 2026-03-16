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
 */

const { notarize } = require('@electron/notarize')
const path = require('path')

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

  await notarize({
    tool: 'notarytool',
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  })

  console.log(`notarize: done`)
}
