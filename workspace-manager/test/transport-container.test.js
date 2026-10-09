'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const socket = process.env.DOCKER_SOCKET_PATH || path.join(os.homedir(), '.docker/run/docker.sock');
const managerName = `obws-control-test-${crypto.randomUUID()}`;
const controlPlaneName = `obws-control-plane-test-${crypto.randomUUID()}`;
const controlNetwork = `obws-control-network-${crypto.randomUUID()}`;
const controlSecret = crypto.randomBytes(32).toString('hex');
const stateDir = fs.mkdtempSync('/private/tmp/obws-control-state-');
let iam;
let iamPort;
let managerPort;
const identities = {
  user_a: { valid: true, user_id: 301, org_id: 9, permissions: ['workspace.launch'] },
  user_b: { valid: true, user_id: 302, org_id: 9, permissions: ['workspace.launch'] },
  user_c: { valid: true, user_id: 303, org_id: 10, permissions: ['workspace.launch'] },
};

function docker(args) { return execFileSync('docker', args, { encoding: 'utf8' }).trim(); }
function api(token, method, url, payload) { return fetch(`http://127.0.0.1:${managerPort}${url}`, { method, headers: { authorization: `Bearer ${token}`, ...(payload ? { 'content-type': 'application/json' } : {}) }, body: payload && JSON.stringify(payload) }); }
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function websocketHandshake(token, workspaceId, sessionToken, sessionId) {
  return new Promise((resolve, reject) => {
    const socket = net.connect( managerPort, '127.0.0.1'); let raw = Buffer.alloc(0); let settled = false;
    const finish = (fn, value) => { if (settled) return; settled = true; fn(value); };
    socket.setTimeout(10000, () => { socket.destroy(); finish(reject, new Error('websocket handshake timeout')); });
    socket.on('error', error => finish(reject, error));
    socket.on('data', chunk => { raw = Buffer.concat([raw, chunk]); const end = raw.indexOf('\r\n\r\n'); if (end < 0) return; const header = raw.subarray(0, end).toString(); const status = Number(header.split('\r\n')[0].split(' ')[1]); if (status === 101) finish(resolve, { socket, head: raw.subarray(end + 4) }); else { socket.destroy(); finish(resolve, { status }); } });
    socket.once('connect', () => {
      const key = crypto.randomBytes(16).toString('base64'); const pathName = `/workspace/${workspaceId}/api/kernels/${sessionId}/channels?session_id=${sessionId}&session=${encodeURIComponent(sessionToken)}`;
      socket.write(`GET ${pathName} HTTP/1.1\r\nHost: 127.0.0.1:${managerPort}\r\nAuthorization: Bearer ${token}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
  });
}

test.before(async () => {
  iam = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString() || '{}'); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(identities[input.token] || { valid: false }));
  });
  iam.listen(0, '0.0.0.0'); await new Promise(resolve => iam.once('listening', resolve)); iamPort = iam.address().port;
  managerPort = 43000 + Math.floor(Math.random() * 1000);
  docker(['network', 'create', controlNetwork]);
  docker(['run', '-d', '--name', controlPlaneName, '--network', controlNetwork, '--network-alias', 'control-plane', '-e', 'CONTROL_PLANE_HOST=0.0.0.0', '-e', 'CONTROL_PLANE_PORT=5192', '-e', 'CONTROL_PLANE_SERVICE_ID=workspace-manager', '-e', `CONTROL_PLANE_SERVICE_SECRET=${controlSecret}`, '-e', 'DOCKER_SOCKET_PATH=/var/run/docker.sock', '-v', `${root}:/app:ro`, '-v', `${socket}:/var/run/docker.sock`, 'node:20-bookworm-slim', 'node', '/app/control-plane.js']);
  docker(['run', '-d', '--name', managerName, '--network', controlNetwork, '--add-host', 'host.docker.internal:host-gateway', '-p', `127.0.0.1:${managerPort}:${managerPort}`, '-e', `PORT=${managerPort}`, '-e', 'LISTEN_HOST=0.0.0.0', '-e', `IAM_URL=http://host.docker.internal:${iamPort}`, '-e', 'WORKSPACE_UPSTREAM_HOST=host.docker.internal', '-e', 'CONTROL_PLANE_URL=http://control-plane:5192', '-e', 'CONTROL_PLANE_SERVICE_ID=workspace-manager', '-e', `CONTROL_PLANE_SERVICE_SECRET=${controlSecret}`, '-e', 'WORKSPACE_DB_PATH=/state/workspaces.json', '-e', 'WORKSPACE_MAX_CPU=2', '-e', `WORKSPACE_MAX_MEMORY_BYTES=${2 * 1024 ** 3}`, '-v', `${root}:/app:ro`, '-v', `${stateDir}:/state`, 'node:20-bookworm-slim', 'node', '/app/server.js']);
  const managerMounts = JSON.parse(docker(['inspect', '--format', '{{json .Mounts}}', managerName])); assert.equal(managerMounts.some(mount => mount.Destination === '/var/run/docker.sock'), false);
  for (let i = 0; i < 60; i += 1) { try { const response = await fetch(`http://127.0.0.1:${managerPort}/health`); if (response.status < 500) return; } catch {} await wait(250); }
  throw new Error(docker(['logs', managerName]));
});

test.after(async () => {
  try { docker(['rm', '-f', managerName]); } catch {}
  try { docker(['rm', '-f', controlPlaneName]); } catch {}
  try { docker(['network', 'rm', controlNetwork]); } catch {}
  if (iam) iam.close(); await fs.promises.rm(stateDir, { recursive: true, force: true });
});

test('containerized trusted control plane routes an authorized live HTTP request', { timeout: 180000 }, async () => {
  let response = await api('user_a', 'POST', '/api/workspaces', { resources: { cpu: 0.25, memory_bytes: 512 * 1024 ** 2 } }); const aliceText = await response.text(); assert.equal(response.status, 201, aliceText); const alice = JSON.parse(aliceText);
  response = await api('user_b', 'POST', '/api/workspaces', { resources: { cpu: 0.25, memory_bytes: 512 * 1024 ** 2 } }); const bobText = await response.text(); assert.equal(response.status, 201, bobText); const bob = JSON.parse(bobText);
  const persisted = JSON.parse(await fs.promises.readFile(path.join(stateDir, 'workspaces.json'), 'utf8')).workspaces[alice.id];
  const direct = await fetch(`http://127.0.0.1:${persisted.host_port}/lab?token=${encodeURIComponent(persisted.jupyter_token)}`); assert.equal(direct.status, 200);
  response = await api('user_a', 'POST', `/api/workspaces/${alice.id}/sessions`, {}); assert.equal(response.status, 201); const session = await response.json();
  response = await api('user_a', 'GET', `/workspace/${alice.id}/lab?session=${encodeURIComponent(session.token)}`); const page = await response.text(); assert.equal(response.status, 200, page); assert.match(page, /Jupyter/);
  response = await api('user_a', 'POST', `/workspace/${alice.id}/api/kernels?session=${encodeURIComponent(session.token)}`, { name: 'python3' }); assert.equal(response.status, 201); const kernel = await response.json();
  response = await api('user_a', 'GET', `/workspace/${alice.id}/api/kernels?session=${encodeURIComponent(session.token)}`); const kernelsBody = await response.text(); assert.equal(response.status, 200, kernelsBody); assert.ok(JSON.parse(kernelsBody).some(item => item.id === kernel.id));
  const ws = await websocketHandshake('user_a', alice.id, session.token, kernel.id); assert.equal(ws.status, undefined); ws.socket.write(Buffer.from([0x89, 0])); const pong = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('websocket pong timeout')), 10000); ws.socket.once('data', data => { clearTimeout(timer); resolve(data); }); }); assert.equal(pong[0] & 0x0f, 0x0a); ws.socket.end();
  const reconnect = await websocketHandshake('user_a', alice.id, session.token, kernel.id); assert.equal(reconnect.status, undefined); reconnect.socket.end();
  const deniedWs = await websocketHandshake('user_b', alice.id, session.token, kernel.id); assert.equal(deniedWs.status, 404);
  response = await api('user_b', 'GET', `/workspace/${alice.id}/lab?session=${encodeURIComponent(session.token)}`); assert.equal(response.status, 404); assert.notEqual(alice.runtime_name, bob.runtime_name);
  response = await api('user_a', 'GET', `/workspace/${bob.id}/lab?session=${encodeURIComponent(session.token)}`); assert.equal(response.status, 404);
  response = await api('user_c', 'GET', `/workspace/${alice.id}/lab?session=${encodeURIComponent(session.token)}`); assert.equal(response.status, 404);
  response = await api('', 'GET', `/workspace/${alice.id}/lab?session=${encodeURIComponent(session.token)}`); assert.equal(response.status, 401);
  response = await api('user_a', 'DELETE', `/workspace/${alice.id}/api/kernels/${kernel.id}?session=${encodeURIComponent(session.token)}`); assert.ok([204, 404].includes(response.status));
  assert.equal((await api('user_a', 'DELETE', `/api/workspaces/${alice.id}`)).status, 200); assert.equal((await api('user_b', 'DELETE', `/api/workspaces/${bob.id}`)).status, 200);
});
