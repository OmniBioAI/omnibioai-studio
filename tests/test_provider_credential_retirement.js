const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { projectConfig, retireLegacyProviderEnvironment } = require('../backend/providerConfig');

const sentinel = 'SYNTHETIC-PROVIDER-SECRET';
test('provider projection drops credential fields without reading excluded values', () => {
  const llm = { local_model: 'local', enable_gpu: true };
  Object.defineProperty(llm, 'openai_api_key', { enumerable: true, get() { throw Error('must never access'); } });
  const input = { llm, cloud: { aws_secret_key: sentinel, gcp_service_account_key: sentinel, aws_region: 'us-east-1' },
    settings: { data_dir: '/data' }, hpc: { scheduler: 'slurm' } };
  const result = projectConfig(input);
  assert.equal(JSON.stringify(result).includes(sentinel), false);
  assert.deepEqual(result.llm, { local_model: 'local', enable_gpu: true });
  assert.equal(result.cloud.aws_region, 'us-east-1');
  assert.deepEqual(result.settings, input.settings);
  assert.deepEqual(result.hpc, input.hpc);
  assert.equal(result.provider_credentials_retired, true);
});

test('legacy config is retired before load; save never persists provider secrets', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-retirement-test-'));
  const original = Module._load;
  Module._load = function(name, ...args) { return name === 'electron' ? { app: { getPath: () => dir } } : original.call(this, name, ...args); };
  try {
    const config = require('../backend/config');
    const fixture = { llm: { claude_api_key: sentinel, local_model: 'keep' }, cloud: { aws_access_key: sentinel }, settings: { data_dir: '/data' } };
    fs.writeFileSync(config.getConfigPath(), JSON.stringify(fixture));
    assert.equal(JSON.stringify(config.readConfig()).includes(sentinel), false);
    assert.equal(fs.readFileSync(config.getConfigPath(), 'utf8').includes(sentinel), false);
    assert.equal(config.writeConfig(fixture).success, true);
    assert.equal(fs.readFileSync(config.getConfigPath(), 'utf8').includes(sentinel), false);
    assert.equal(fs.statSync(config.getConfigPath()).mode & 0o777, 0o600);
  } finally { Module._load = original; fs.rmSync(dir, { recursive: true }); }
});

test('only Studio-managed provider environment entries retire; unrelated values survive', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-env-test-'));
  const file = path.join(dir, 'synthetic.env');
  try {
    fs.writeFileSync(file, `OPENAI_API_KEY=${sentinel}\nANTHROPIC_API_KEY=${sentinel}\nAWS_ACCESS_KEY_ID=${sentinel}\nAWS_SECRET_ACCESS_KEY=${sentinel}\nDATA_DIR=/data\nAUTH_SECRET_KEY=synthetic-system-credential\n`);
    assert.equal(retireLegacyProviderEnvironment(file), true);
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(content.includes(sentinel), false);
    assert.ok(content.includes('DATA_DIR=/data'));
    assert.ok(content.includes('AUTH_SECRET_KEY=synthetic-system-credential'));
    assert.equal(retireLegacyProviderEnvironment(file), false);
  } finally { fs.rmSync(dir, { recursive: true }); }
});
