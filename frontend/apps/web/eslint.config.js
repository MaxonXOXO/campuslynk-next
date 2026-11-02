import baseConfig from '@academic-suite/config/eslint/base';

export default [
  ...baseConfig,
  {
    ignores: ['.next/**', 'out/**', 'dist/**']
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly'
      }
    }
  }
];

