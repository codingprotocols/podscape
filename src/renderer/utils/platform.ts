// navigator.platform is deprecated but remains the most reliable cross-browser
// signal in Electron's renderer. navigator.userAgentData?.platform is preferred
// where available (Chromium 90+, which Electron uses).
export const isMac = /Mac|iPhone|iPad|iPod/i.test(
  (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform ?? navigator.platform
)
