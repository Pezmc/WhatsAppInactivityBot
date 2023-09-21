module.exports = {
    env: {
      node: true,
      es2022: true,
    },
    extends: [
      'eslint:recommended',
      'plugin:import/errors',
      'plugin:import/warnings',
      'prettier',
    ],
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // eslint:recommended
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_|err|req|res|next|reject',
        },
      ],
  
      // eslint - styles
      'linebreak-style': ['error', 'unix'],
  
      // eslint - es6
      'no-var': 'error',
      'no-duplicate-imports': 'error',
      'prefer-const': 'error',
  
      // plugin:import
      'import/order': [
        'error',
        {
          alphabetize: { order: 'asc' },
          'newlines-between': 'always-and-inside-groups',
        },
      ],
      'import/no-unresolved': ['error', { commonjs: true }],
      'import/no-cycle': ['error', { commonjs: true }],
    },
  }
  