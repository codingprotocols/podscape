import { describe, it, expect } from 'vitest'
import { isKubectlSystemAnnotation } from './namespaceAnnotationUtils'

// Security: tests for CodeQL rule js/incomplete-url-substring-sanitization.
// The predicate must use 'kubectl.kubernetes.io/' (with trailing slash) so that
// third-party annotation keys like 'kubectl.kubernetes.io.evil.com/foo' are not
// incorrectly hidden from the UI.

describe('kubectl annotation key filter', () => {
  it('hides kubectl.kubernetes.io/ annotations', () => {
    expect(isKubectlSystemAnnotation('kubectl.kubernetes.io/last-applied-configuration')).toBe(true)
  })

  it('hides other kubectl.kubernetes.io/ sub-paths', () => {
    expect(isKubectlSystemAnnotation('kubectl.kubernetes.io/anything')).toBe(true)
  })

  it('does not hide third-party keys that share the prefix without a slash', () => {
    // Without the trailing slash, startsWith('kubectl.kubernetes.io') would
    // incorrectly hide this key.
    expect(isKubectlSystemAnnotation('kubectl.kubernetes.io.evil.com/foo')).toBe(false)
  })

  it('does not hide unrelated annotation keys', () => {
    expect(isKubectlSystemAnnotation('app.kubernetes.io/name')).toBe(false)
    expect(isKubectlSystemAnnotation('custom.io/annotation')).toBe(false)
  })
})
