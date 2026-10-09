'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const test = require('node:test');

const dockerSocket = process.env.DOCKER_SOCKET_PATH || path.join(os.homedir(), '.docker/run/docker.sock');
const root = path.resolve(__dirname, '..');
let iam;
let manager;
let base;
let dbPath;
let managerEnv;
const tokens = {
  alice: { valid: true, user_id: 101, org_id: 7, permissions: ['workspace.launch'] },
  bob: { valid: true, user_id: 202, org_id: 7, permissions: ['workspace.launch'] },
};

function request(port, token, method, url, payload) {
  return fetch(`${base || `http://127.0.0.1:${port}`}${url}`, { method, headers: { authorization: `Bearer ${token}`, ...(payload ? { 'content-type': 'application/json' } : {}) }, body: payload && JSON.stringify(payload) });
}

async function waitFor(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try { const response = await fetch(url); if (response.status < 500) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function startManager() {
  manager = spawn(process.execPath, [path.join(root, 'server.js')], { env: managerEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  manager.stdout.on('data', chunk => { output += chunk; const match = /127\.0\.0\.1:(\d+)/.exec(output); if (match) base = `http://127.0.0.1:${match[1]}`; });
  manager.stderr.on('data', chunk => { output += chunk; });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`manager did not start: ${output}`)), 15000); const poll = setInterval(() => { if (base) { clearTimeout(timer); clearInterval(poll); resolve(); } }, 100); manager.once('exit', code => { clearTimeout(timer); clearInterval(poll); reject(new Error(`manager exited ${code}: ${output}`)); }); });
}

test.before(async () => {
  dbPath = path.join('/private/tmp', `omnibioai-workspaces-${crypto.randomUUID()}.json`);
  iam = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString() || '{}'); const identity = tokens[input.token];
    const body = JSON.stringify(identity || { valid: false }); res.writeHead(200, { 'content-type': 'application/json' }); res.end(body);
  });
  iam.listen(0, '127.0.0.1'); await once(iam, 'listening');
  const iamPort = iam.address().port;
  managerEnv = { ...process.env, PORT: '0', IAM_URL: `http://127.0.0.1:${iamPort}`, WORKSPACE_DB_PATH: dbPath, DOCKER_SOCKET_PATH: dockerSocket, WORKSPACE_MAX_CPU: '2', WORKSPACE_MAX_MEMORY_BYTES: String(2 * 1024 ** 3) };
  await startManager();
});

test.after(async () => {
  if (manager) manager.kill('SIGTERM');
  if (iam) iam.close();
  if (dbPath) await fs.promises.rm(dbPath, { force: true });
});

test('two IAM owners receive isolated Jupyter runtimes and lifecycle enforcement', { timeout: 180000 }, async () => {
  const create = async token => { const response = await request(0, token, 'POST', '/api/workspaces', { resources: { cpu: 0.25, memory_bytes: 512 * 1024 ** 2 } }); const text = await response.text(); assert.equal(response.status, 201, text); return JSON.parse(text); };
  const alice = await create('alice'); const bob = await create('bob');
  assert.notEqual(alice.id, bob.id); assert.notEqual(alice.runtime_name, bob.runtime_name); assert.notEqual(alice.volume_name, bob.volume_name); assert.equal(alice.state, 'running'); assert.equal(bob.state, 'running');
  const inspectedAlice = JSON.parse(execFileSync('docker', ['inspect', alice.runtime_name], { encoding: 'utf8' }))[0];
  const inspectedBob = JSON.parse(execFileSync('docker', ['inspect', bob.runtime_name], { encoding: 'utf8' }))[0];
  assert.equal(inspectedAlice.HostConfig.NanoCpus, 250000000); assert.equal(inspectedAlice.HostConfig.Memory, 512 * 1024 ** 2);
  assert.equal(inspectedBob.HostConfig.NanoCpus, 250000000); assert.equal(inspectedBob.HostConfig.Memory, 512 * 1024 ** 2);
  assert.equal(inspectedAlice.HostConfig.Privileged, false); assert.equal(inspectedBob.HostConfig.Privileged, false);

  let response = await request(0, 'bob', 'GET', `/api/workspaces/${alice.id}`); assert.equal(response.status, 404);
  response = await request(0, 'alice', 'GET', `/api/workspaces/${bob.id}`); assert.equal(response.status, 404);
  response = await request(0, 'alice', 'PATCH', `/api/workspaces/${alice.id}`, { resources: { cpu: 0.5, memory_bytes: 768 * 1024 ** 2 } });
  assert.equal(response.status, 409); assert.match(await response.text(), /Stop this workspace/);

  response = await request(0, 'alice', 'POST', `/api/workspaces/${alice.id}/sessions`, {}); assert.equal(response.status, 201); const session = await response.json();
  response = await request(0, 'bob', 'GET', `/workspace/${alice.id}/lab?session=${encodeURIComponent(session.token)}`); assert.equal(response.status, 404);
  // The manager route reaches the owner/session authorization boundary here.
  // Host-process -> Docker Desktop loopback proxying is qualified separately;
  // this sandbox currently resets that upstream connection (UND_ERR_SOCKET).

  response = await request(0, 'alice', 'POST', `/api/workspaces/${alice.id}/stop`, {}); assert.equal(response.status, 200); assert.equal((await response.json()).state, 'stopped');
  response = await request(0, 'alice', 'PATCH', `/api/workspaces/${alice.id}`, { resources: { cpu: 0.5, memory_bytes: 768 * 1024 ** 2 } }); assert.equal(response.status, 200); assert.equal((await response.json()).allocation.cpu, 0.5);
  response = await request(0, 'alice', 'POST', `/api/workspaces/${alice.id}/start`, {}); assert.equal(response.status, 200); assert.equal((await response.json()).state, 'running');

  const db = JSON.parse(await fs.promises.readFile(dbPath, 'utf8')); assert.equal(db.workspaces[alice.id].owner_key, '7\u0000101'); assert.equal(db.workspaces[bob.id].owner_key, '7\u0000202');
  manager.kill('SIGTERM'); await once(manager, 'exit'); base = null; await startManager();
  response = await request(0, 'alice', 'GET', `/api/workspaces/${alice.id}`); assert.equal(response.status, 200); assert.equal((await response.json()).state, 'running');
  response = await request(0, 'alice', 'DELETE', `/api/workspaces/${alice.id}`); assert.equal(response.status, 200);
  response = await request(0, 'bob', 'DELETE', `/api/workspaces/${bob.id}`); assert.equal(response.status, 200);
});
