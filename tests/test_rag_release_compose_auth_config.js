const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const releaseComposeFiles = [
  'docker-compose.release.yml',
  'docker-compose-release.yml',
];

function readCompose(fileName) {
  return readFileSync(path.join(root, fileName), 'utf8');
}

function serviceBlock(composeText, serviceName) {
  const startPattern = new RegExp(`^  ${serviceName}:\\n`, 'm');
  const start = composeText.search(startPattern);
  assert.notEqual(start, -1, `missing ${serviceName} service`);

  const rest = composeText.slice(start + composeText.match(startPattern)[0].length);
  const nextService = rest.search(/^  [A-Za-z0-9_-]+:\n/m);
  return nextService === -1 ? rest : rest.slice(0, nextService);
}

test('production release RAG receives JWT_SECRET from AUTH_SECRET_KEY', () => {
  for (const fileName of releaseComposeFiles) {
    const rag = serviceBlock(readCompose(fileName), 'rag');
    assert.match(
      rag,
      /^    environment:\n(?:      .+\n)*      JWT_SECRET: \$\{AUTH_SECRET_KEY:\?AUTH_SECRET_KEY must be set\}\n/m,
      `${fileName} must pass AUTH_SECRET_KEY to RAG as JWT_SECRET`,
    );
  }
});

test('release RAG configuration cannot silently use an insecure JWT secret fallback', () => {
  for (const fileName of releaseComposeFiles) {
    const rag = serviceBlock(readCompose(fileName), 'rag');
    assert.doesNotMatch(rag, /JWT_SECRET:\s*\$\{AUTH_SECRET_KEY:-/);
    assert.doesNotMatch(rag, /JWT_SECRET:\s*["']?(?:dev-secret|change-me)["']?/i);
    assert.doesNotMatch(rag, /JWT_SECRET:\s*\$\{JWT_SECRET:-/);
  }
});

test('missing AUTH_SECRET_KEY fails release compose interpolation', () => {
  for (const fileName of releaseComposeFiles) {
    const rag = serviceBlock(readCompose(fileName), 'rag');
    assert.match(
      rag,
      /JWT_SECRET:\s*\$\{AUTH_SECRET_KEY:\?AUTH_SECRET_KEY must be set\}/,
      `${fileName} must use required-compose variable syntax`,
    );
  }
});

test('RAG browser build receives no JWT or IAM secret build-time variables', () => {
  for (const fileName of releaseComposeFiles) {
    const rag = serviceBlock(readCompose(fileName), 'rag');
    assert.doesNotMatch(rag, /VITE_[A-Z0-9_]*(?:JWT|AUTH)[A-Z0-9_]*SECRET/i);
    assert.doesNotMatch(rag, /^    build:/m);
    assert.doesNotMatch(rag, /^      args:/m);
  }
});
