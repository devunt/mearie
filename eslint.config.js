import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import unicornPlugin from 'eslint-plugin-unicorn';
import jsdocPlugin from 'eslint-plugin-jsdoc';
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
  jsdocPlugin.configs['flat/recommended-typescript-error'],

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
      'import/resolver': {
        typescript: {},
      },
      'import/ignore': ['prettier'],
    },
    rules: {
      'func-style': ['error', 'expression'],
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'import/newline-after-import': ['error', { considerComments: true }],
      'jsdoc/check-indentation': 'error',
      'jsdoc/convert-to-jsdoc-comments': 'error',
      'jsdoc/require-description-complete-sentence': 'error',
      'jsdoc/require-jsdoc': [
        'error',
        {
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
          },
        },
      ],
      'jsdoc/sort-tags': 'error',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prefer-switch': 'off',
      'unicorn/prevent-abbreviations': 'off',
    },
  },

  prettierConfig,
);
