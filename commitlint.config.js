/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Disable header-max-length to allow longer commit messages
    'header-max-length': [0, 'always', 100],
    'body-max-line-length': [0, 'always', 100],

    // Custom types
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation changes
        'style', // Code style changes (formatting, etc)
        'refactor', // Code refactoring
        'perf', // Performance improvements
        'test', // Adding or modifying tests
        'build', // Build system or dependencies
        'ci', // CI/CD changes
        'chore', // Other changes (maintenance, etc)
        'revert', // Reverting changes
      ],
    ],

    // Scope can be empty for flexibility
    'scope-empty': [0, 'never'],

    // Subject should be lowercase and not end with period
    'subject-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],

    // Body should be separated by blank line
    'body-leading-blank': [1, 'always'],

    // Footer should be separated by blank line
    'footer-leading-blank': [1, 'always'],
  },
};
