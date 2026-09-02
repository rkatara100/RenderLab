// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/.turbo/**', '**/coverage/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.es2022,
      },
    },
    rules: {
      // Project convention: no bare `any`. A suppression must carry an inline
      // justification comment, e.g.
      //   // eslint-disable-next-line @typescript-eslint/no-explicit-any -- <why>
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // Node-oriented packages (api, sdk, shared-types run in build/test tooling under Node)
  {
    files: ['api/**/*.ts', 'sdk/**/*.{ts,tsx}', 'packages/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Anywhere React hooks are authored — the SDK defines its own hooks, not just the dashboard.
  {
    files: ['sdk/**/*.{ts,tsx}', 'dashboard/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  // sdk/src/instrumentation is a deliberate, narrow exception to the
  // react-hooks/refs and react-hooks/purity rules (introduced for React
  // Compiler auto-memoization safety): this is an observational
  // instrumentation library whose entire mechanic is reading/writing refs
  // synchronously during render to diff the current render against the
  // previous one, and timing render duration via performance.now(). None of
  // this affects JSX output — only what gets reported to telemetry — so it
  // is safe even under compiler-driven memoization. See ARCHITECTURE.md §8
  // and the Phase 1 plan for the full rationale.
  {
    files: ['sdk/src/instrumentation/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
    },
  },
  // Browser-oriented dashboard app
  {
    files: ['dashboard/**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
    },
  },
  // Prettier disables stylistic rules — formatting is a separate Turborepo task, not the linter's job
  eslintConfigPrettier,
);
