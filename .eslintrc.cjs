module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
    'no-console': 'warn',
  },
  overrides: [
    {
      files: [
        'packages/server/src/**/*.test.ts',
        'packages/server/src/__tests__/**/*.ts',
      ],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector:
              'MemberExpression[object.object.name="process"][object.property.name="env"][property.name="DATABASE_URL"]',
            message:
              'Use TEST_DATABASE_URL in test files, not DATABASE_URL. Tests run against the test database copy only.',
          },
        ],
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', '*.js', '*.cjs'],
};
