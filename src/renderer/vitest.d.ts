// Type-only: teaches TypeScript about the jest-dom matchers (toBeInTheDocument,
// toHaveAttribute, …) that the component tests register at runtime with
// `expect.extend(matchers)`. Pulling in the subpath's declarations augments
// vitest's `Assertion` interface project-wide; it emits nothing.
import '@testing-library/jest-dom/vitest'
