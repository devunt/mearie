import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import-x';
import unicornPlugin from 'eslint-plugin-unicorn';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  {
    ignores: [
      '**/dist',
      '**/target',
      '**/node_modules',
      '**/examples',
      '**/.mearie',
      '**/.vitepress/cache',
      'eslint.config.js',
    ],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },

  eslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  unicornPlugin.configs.recommended,

  {
    files: ['**/*.ts'],
    extends: [
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      importPlugin.flatConfigs.typescript,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    settings: {
      'import-x/resolver': {
        typescript: {},
      },
      'import-x/ignore': ['prettier'],
    },
    rules: {
      'func-style': ['error', 'expression'],
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'import-x/newline-after-import': ['error', { considerComments: true }],
      'unicorn/catch-error-name': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prefer-switch': 'off',
      'unicorn/prevent-abbreviations': 'off',
    },
  },

  prettierConfig,
);
