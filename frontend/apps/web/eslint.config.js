import baseConfig from '@academic-suite/config/eslint/base';

export default [
  ...baseConfig,
  {
    ignores: ['.next/**', 'out/**', 'dist/**']
  }
];

