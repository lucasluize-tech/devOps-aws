module.exports = {
  testMatch: ['**/tests/unit/**/*.js'],
  testEnvironment: 'node',
  // marked/sanitize-html pull in ESM-only node_modules packages (Node 24
  // requires them natively; Jest's CJS runtime needs babel-jest to convert
  // them). Allowlist just this transitive ESM cluster through the transform.
  transformIgnorePatterns: ['/node_modules/(?!(marked|htmlparser2|domhandler|domutils|domelementtype|dom-serializer|entities|nanoid)/)'],
  transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
};
