import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/features/*/internal/**', '@/features/*/internal'],
            message: 'Cross-module imports must go through types.ts / actions.ts / components / pages of the owning module. The internal/ folder is private.',
          },
        ],
      }],
    },
  },
];
