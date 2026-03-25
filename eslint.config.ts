// ESLint loads this .ts config via the `jiti` devDependency.
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // Global ignores
  {
    ignores: ['dist/', 'node_modules/', 'spikes/', 'src/helper-extension/out/'],
  },

  // Base recommended rules — scoped to TS files only
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
  },

  // Stylistic rules for all TS files
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/quotes': ['error', 'single', { allowTemplateLiterals: 'always' }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/no-multiple-empty-lines': ['error', { max: 1 }],
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/arrow-parens': ['error', 'always'],
      '@stylistic/comma-spacing': 'error',
    },
  },

  // Shared config for src and tests
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      // Ban console — use project logger (src/utils/logger.ts)
      'no-console': 'error',

      // Prefer TS version for unused vars
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Allow explicit any as warning, not error
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Test-specific overrides
  {
    files: ['tests/**/*.ts'],
    rules: {
      // Allow console in tests (test debugging, test helpers)
      'no-console': 'off',
    },
  },
]);
