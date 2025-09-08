module.exports = {
  // TypeScript and JavaScript files
  '*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],

  // JSON files
  '*.json': ['prettier --write'],

  // CSS, SCSS files
  '*.{css,scss,sass,less}': ['prettier --write'],

  // Markdown files
  '*.md': ['prettier --write'],

  // YAML files
  '*.{yml,yaml}': ['prettier --write'],

  // Package files
  'package.json': ['prettier --write'],
};
