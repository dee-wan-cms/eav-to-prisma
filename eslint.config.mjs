import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * This package's own flat config.
 *
 * Without it `eslint src` walks up to the monorepo root config, whose global
 * ignores exclude `packages/**` — every file reports "ignored because of a
 * matching ignore pattern" and the script can never fail, or pass, on merit.
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'example/**', 'test-temp/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
];
