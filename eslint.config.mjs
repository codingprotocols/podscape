// @ts-check
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'dist/**',
      'go-core/**',
      'node_modules/**',
      'resources/**',
      '**/*.d.ts',
      'src/renderer/assets/**',
      // Local, gitignored scratch/reference material — not part of this codebase.
      '.claude/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // TypeScript's own compiler (via tsc --noEmit in `npm run typecheck`) already
      // catches undefined-variable errors, and does so correctly for TS-specific
      // constructs (ambient types, generics, declaration merging) that ESLint's
      // no-undef does not understand — the typescript-eslint project's own docs
      // recommend disabling it for TS files for exactly this reason.
      'no-undef': 'off',
      // The codebase relies on `any` at IPC/main<->renderer boundaries (window.kubectl,
      // Electron API surfaces) where full typing isn't practical. Existing code already
      // has scattered `eslint-disable @typescript-eslint/no-explicit-any` comments
      // anticipating this — keep it a warning rather than a blocking error.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Unused vars/params are already enforced more precisely by tsconfig's
      // noUnusedLocals/noUnusedParameters (which understand destructuring, overloads,
      // etc. better than the ESLint equivalent) — avoid double-reporting.
      '@typescript-eslint/no-unused-vars': 'off',
      // `try { x() } catch {}` ("best effort, ignore failure") is a deliberate,
      // consistent idiom throughout this codebase (stream/socket cleanup, settings
      // writes) — not an oversight. Flag genuinely suspicious empty blocks elsewhere.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `cond ? doA() : doB()` used as a compact if/else is a deliberate, consistent
      // idiom in a few places (e.g. Set toggle helpers) — allow it rather than force
      // an equivalent but noisier if/else rewrite.
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // Incorrect hook usage (conditional hooks, hooks outside components) is a
      // real correctness bug, not a style preference — keep this a hard error.
      'react-hooks/rules-of-hooks': 'error',
      // Missing deps are a common source of stale-closure bugs, but this codebase
      // has several deliberate exceptions (documented inline) where the exhaustive
      // set would cause unwanted re-runs — keep it a warning, not a build breaker.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'electron.vite.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Plain CommonJS Node config/scripts (tailwind/postcss config, build hooks) —
    // not part of the TS project, so no type-aware rules apply here.
    files: ['tailwind.config.js', 'postcss.config.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // These plugin output parsers intentionally match the ANSI escape character
    // (\x1b) to strip terminal color codes from krew plugin stdout before parsing.
    files: [
      'src/renderer/components/plugins/df-pv/RunPanel.tsx',
      'src/renderer/components/plugins/outdated/RunPanel.tsx',
    ],
    rules: {
      'no-control-regex': 'off',
    },
  }
)
