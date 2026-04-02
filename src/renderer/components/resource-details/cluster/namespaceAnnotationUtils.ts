/**
 * Returns true if the annotation key belongs to kubectl's system namespace
 * (kubectl.kubernetes.io/) and should be hidden from the UI.
 *
 * The trailing slash is required so that third-party keys that share the
 * prefix (e.g. 'kubectl.kubernetes.io.evil.com/foo') are not incorrectly
 * filtered. See CodeQL rule js/incomplete-url-substring-sanitization.
 */
export function isKubectlSystemAnnotation(key: string): boolean {
  return key.startsWith('kubectl.kubernetes.io/')
}
