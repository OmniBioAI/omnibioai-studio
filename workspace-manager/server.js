'use strict';

const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 5191);
const DB_PATH = process.env.WORKSPACE_DB_PATH || path.join(process.cwd(), 'workspaces.json');
const DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
const IAM_URL = process.env.IAM_URL || 'http://auth-service:8001';
const MAX_CPU = Number(process.env.WORKSPACE_MAX_CPU || 8);
const MAX_MEMORY = Number(process.env.WORKSPACE_MAX_MEMORY_BYTES || 8 * 1024 ** 3);
const IMAGE = 'ghcr.io/omnibioai/omnibioai-jupyter:1.0';
const SESSION_TTL_MS = 15 * 60 * 1000;

const state = loadState();
let writeChain = Promise.resolve();

function loadState() {
  try {
    const value = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return { workspaces: value.workspaces || {}, sessions: value.sessions || {} };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { workspaces: {}, sessions: {} };
  }
}

function persist() {
  writeChain = writeChain.then(async () => {
    const tmp = `${DB_PATH}.${process.pid}.tmp`;
    await fs.promises.mkdir(path.dirname(DB_PATH), { recursive: true });
    await fs.promises.writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    await fs.promises.rename(tmp, DB_PATH);
  });
  return writeChain;
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) });
  res.end(data);
}

function error(res, status, message) { return json(res, status, { error: message }); }

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw Object.assign(new Error('request too large'), { status: 413 });
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}

function bearer(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (!match) throw Object.assign(new Error('authentication required'), { status: 401 });
  return match[1];
}

async function identity(req) {
  const token = bearer(req);
  const response = await fetch(`${IAM_URL}/auth/validate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }), signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!response || !response.ok) throw Object.assign(new Error('authentication service unavailable'), { status: 503 });
  const value = await response.json().catch(() => null);
  if (!value || value.valid !== true || value.user_id == null || value.org_id == null) {
    throw Object.assign(new Error('invalid or expired token'), { status: 401 });
  }
  const permissions = value.permissions || [];
  if (!permissions.includes('workspace.launch') && !permissions.includes('platform.manage_infra')) {
    throw Object.assign(new Error('insufficient permissions'), { status: 403 });
  }
  return { user_id: String(value.user_id), organization_id: String(value.org_id) };
}

function ownerKey(owner) { return `${owner.organization_id}\u0000${owner.user_id}`; }
function ownerMatches(workspace, owner) { return workspace.owner_key === ownerKey(owner); }
function workspaceId(value) { return /^[0-9a-f-]{36}$/.test(value || ''); }
function runtimeName(id) { return `obws-${id}`; }
function volumeName(id) { return `obws-volume-${id}`; }
function networkName(id) { return `obws-network-${id}`; }
function sessionDigest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function allocation(input = {}) {
  const cpu = Number(input.cpu ?? 1);
  const memory_bytes = Number(input.memory_bytes ?? 512 * 1024 ** 2);
  if (!Number.isFinite(cpu) || cpu < 0.25 || cpu > MAX_CPU) throw new Error(`cpu must be between 0.25 and ${MAX_CPU}`);
  if (!Number.isInteger(memory_bytes) || memory_bytes < 256 * 1024 ** 2 || memory_bytes > MAX_MEMORY) throw new Error(`memory_bytes must be between 268435456 and ${MAX_MEMORY}`);
  return { cpu, memory_bytes, gpu: 0, architecture: 'arm64' };
}

function docker(method, requestPath, requestBody) {
  return new Promise((resolve, reject) => {
    const encoded = requestBody === undefined ? undefined : JSON.stringify(requestBody);
    const req = http.request({ socketPath: DOCKER_SOCKET_PATH, path: requestPath, method,
      headers: encoded ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(encoded) } : {} }, res => {
      let raw = '';
      res.setEncoding('utf8'); res.on('data', chunk => { raw += chunk; });
      res.on('end', () => { let parsed; try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = raw; } resolve({ status: res.statusCode, body: parsed }); });
    });
    req.on('error', reject); req.end(encoded);
  });
}

function dockerAllocation(a) { return { NanoCpus: Math.round(a.cpu * 1e9), Memory: a.memory_bytes, DeviceRequests: [] }; }

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
}

function waitForPort(port, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => { socket.destroy(); if (Date.now() - started >= timeoutMs) reject(new Error('workspace endpoint did not become ready')); else setTimeout(probe, 250); });
    };
    probe();
  });
}

async function inspectRuntime(workspace) {
  return docker('GET', `/containers/${encodeURIComponent(workspace.runtime_id)}/json`);
}

async function createRuntime(workspace) {
  const image = await docker('GET', `/images/${encodeURIComponent(IMAGE)}/json`);
  if (image.status !== 200 || image.body.Architecture !== 'arm64') throw new Error('workspace image is not available for arm64');
  const volume = await docker('POST', '/volumes/create', { Name: volumeName(workspace.id), Driver: 'local', Labels: { 'omnibioai.workspace': workspace.id, 'omnibioai.owner': workspace.owner_key } });
  if (volume.status < 200 || volume.status >= 300) throw new Error('workspace volume creation failed');
  const network = await docker('POST', '/networks/create', { Name: networkName(workspace.id), Driver: 'bridge', Labels: { 'omnibioai.workspace': workspace.id, 'omnibioai.owner': workspace.owner_key } });
  if (network.status < 200 || network.status >= 300) throw new Error('workspace network creation failed');
  const token = crypto.randomBytes(32).toString('base64url');
  const hostPort = await freePort();
  const created = await docker('POST', `/containers/create?name=${runtimeName(workspace.id)}`, {
    Image: IMAGE, User: '1000:100', Cmd: ['start-notebook.py', '--NotebookApp.token=' + token, '--ServerApp.token=' + token, '--ip=0.0.0.0', '--no-browser'],
    Env: ['JUPYTER_ENABLE_LAB=yes', 'JUPYTER_TOKEN=' + token], ExposedPorts: { '8888/tcp': {} },
    HostConfig: { ...dockerAllocation(workspace.allocation), NetworkMode: networkName(workspace.id), PortBindings: { '8888/tcp': [{ HostIp: '127.0.0.1', HostPort: String(hostPort) }] }, SecurityOpt: ['no-new-privileges:true'], Privileged: false,
      Binds: [`${volumeName(workspace.id)}:/home/jovyan/work:rw`] },
    Labels: { 'omnibioai.workspace': workspace.id, 'omnibioai.owner': workspace.owner_key },
  });
  if (created.status < 200 || created.status >= 300 || !created.body.Id) throw new Error('workspace container creation failed');
  workspace.runtime_id = created.body.Id; workspace.runtime_name = runtimeName(workspace.id); workspace.volume_name = volumeName(workspace.id); workspace.network_name = networkName(workspace.id); workspace.host_port = hostPort; workspace.jupyter_token = token;
  const started = await docker('POST', `/containers/${encodeURIComponent(created.body.Id)}/start`);
  if (![204, 304].includes(started.status)) throw new Error('workspace container start failed');
  await waitForPort(hostPort);
}

async function removeRuntime(workspace) {
  if (workspace.runtime_id) { await docker('POST', `/containers/${encodeURIComponent(workspace.runtime_id)}/stop`, { t: 5 }); await docker('DELETE', `/containers/${encodeURIComponent(workspace.runtime_id)}?force=true`); }
  if (workspace.volume_name) await docker('DELETE', `/volumes/${encodeURIComponent(workspace.volume_name)}`);
  if (workspace.network_name) await docker('DELETE', `/networks/${encodeURIComponent(workspace.network_name)}`);
}

function publicWorkspace(workspace) {
  const { jupyter_token, owner_key, ...safe } = workspace;
  return safe;
}

async function reconcile() {
  for (const workspace of Object.values(state.workspaces)) {
    if (workspace.deleted_at) continue;
    const inspected = await inspectRuntime(workspace).catch(() => ({ status: 404 }));
    if (inspected.status === 404) { workspace.state = 'failed'; workspace.state_reason = 'runtime missing during recovery'; }
    else if (inspected.body?.State?.Running) workspace.state = 'running';
    else workspace.state = 'stopped';
  }
  await persist();
}

async function route(req, res) {
  let owner;
  try { owner = await identity(req); } catch (e) { return error(res, e.status || 500, e.message); }
  const url = new URL(req.url, 'http://workspace-manager');
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (parts[0] === 'api' && parts[1] === 'workspaces' && parts.length === 2 && req.method === 'GET') {
      return json(res, 200, { workspaces: Object.values(state.workspaces).filter(w => !w.deleted_at && ownerMatches(w, owner)).map(publicWorkspace) });
    }
    if (parts[0] === 'api' && parts[1] === 'workspaces' && parts.length === 2 && req.method === 'POST') {
      const input = await body(req); const id = crypto.randomUUID(); const workspace = { id, owner_key: ownerKey(owner), owner_user_id: owner.user_id, organization_id: owner.organization_id,
        profile: 'generic-python', environment: 'jupyterlab', allocation: allocation(input.resources), state: 'creating', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      state.workspaces[id] = workspace; await persist();
      try { await createRuntime(workspace); workspace.state = 'running'; workspace.state_reason = ''; workspace.updated_at = new Date().toISOString(); await persist(); return json(res, 201, publicWorkspace(workspace)); }
      catch (e) { workspace.state = 'failed'; workspace.state_reason = e.message; workspace.updated_at = new Date().toISOString(); await persist(); return error(res, 502, e.message); }
    }
    if (parts[0] !== 'api' || parts[1] !== 'workspaces' || !workspaceId(parts[2])) return error(res, 404, 'not found');
    const workspace = state.workspaces[parts[2]];
    if (!workspace || workspace.deleted_at || !ownerMatches(workspace, owner)) return error(res, 404, 'workspace not found');
    if (parts.length === 3 && req.method === 'GET') return json(res, 200, publicWorkspace(workspace));
    if (parts.length === 3 && req.method === 'PATCH') {
      if (workspace.state === 'running') return error(res, 409, 'Stop this workspace to change its CPU or memory allocation.');
      const input = await body(req); workspace.allocation = allocation(input.resources); const updated = await docker('POST', `/containers/${encodeURIComponent(workspace.runtime_id)}/update`, dockerAllocation(workspace.allocation));
      if (updated.status < 200 || updated.status >= 300) return error(res, 502, 'workspace resource update failed');
      workspace.updated_at = new Date().toISOString(); await persist(); return json(res, 200, publicWorkspace(workspace));
    }
    if (parts.length === 3 && req.method === 'DELETE') { await removeRuntime(workspace); workspace.deleted_at = new Date().toISOString(); workspace.state = 'deleted'; await persist(); return json(res, 200, { deleted: true, workspace_id: workspace.id }); }
    if (parts.length === 4 && parts[3] === 'start' && req.method === 'POST') { const result = await docker('POST', `/containers/${encodeURIComponent(workspace.runtime_id)}/start`); if (![204, 304].includes(result.status)) return error(res, 502, 'workspace start failed'); await waitForPort(workspace.host_port); workspace.state = 'running'; workspace.updated_at = new Date().toISOString(); await persist(); return json(res, 200, publicWorkspace(workspace)); }
    if (parts.length === 4 && parts[3] === 'stop' && req.method === 'POST') { const result = await docker('POST', `/containers/${encodeURIComponent(workspace.runtime_id)}/stop`, { t: 5 }); if (![204, 304].includes(result.status)) return error(res, 502, 'workspace stop failed'); workspace.state = 'stopped'; workspace.updated_at = new Date().toISOString(); await persist(); return json(res, 200, publicWorkspace(workspace)); }
    if (parts.length === 4 && parts[3] === 'sessions' && req.method === 'POST') { if (workspace.state !== 'running') return error(res, 409, 'workspace is not running'); const raw = crypto.randomBytes(32).toString('base64url'); const session = { workspace_id: workspace.id, owner_key: ownerKey(owner), expires_at: Date.now() + SESSION_TTL_MS }; state.sessions[sessionDigest(raw)] = session; await persist(); return json(res, 201, { workspace_id: workspace.id, token: raw, expires_at: new Date(session.expires_at).toISOString(), proxy_path: `/workspace/${workspace.id}/` }); }
    return error(res, 404, 'not found');
  } catch (e) { return error(res, e.status || 400, e.message); }
}

async function proxy(req, res, owner, workspaceIdValue) {
  const workspace = state.workspaces[workspaceIdValue]; const raw = new URL(req.url, 'http://proxy').searchParams.get('session'); const session = raw && state.sessions[sessionDigest(raw)];
  if (!workspace || workspace.deleted_at || !ownerMatches(workspace, owner) || !session || session.workspace_id !== workspace.id || session.owner_key !== ownerKey(owner) || session.expires_at < Date.now()) return error(res, 404, 'workspace not found');
  if (workspace.state !== 'running') return error(res, 409, 'workspace is not running');
  const inspected = await inspectRuntime(workspace); const hostPort = workspace.host_port || inspected.body?.NetworkSettings?.Ports?.['8888/tcp']?.[0]?.HostPort;
  if (!hostPort) return error(res, 503, 'workspace endpoint unavailable');
  const input = new URL(req.url, 'http://proxy'); input.searchParams.delete('session'); input.searchParams.set('token', workspace.jupyter_token);
  const prefix = `/workspace/${workspace.id}`; const upstreamPath = input.pathname.startsWith(prefix) ? (input.pathname.slice(prefix.length) || '/') : '/';
  if (req.method === 'GET' || req.method === 'HEAD') {
    let upstreamResponse;
    try { upstreamResponse = await fetch(`http://127.0.0.1:${hostPort}${upstreamPath}${input.search}`); }
    catch (e) { return error(res, 502, `workspace proxy unavailable: ${e.cause?.code || e.message}`); }
    const headers = {}; for (const [key, value] of upstreamResponse.headers) headers[key] = value;
    res.writeHead(upstreamResponse.status, headers); return res.end(req.method === 'HEAD' ? undefined : Buffer.from(await upstreamResponse.arrayBuffer()));
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: hostPort, method: req.method, path: upstreamPath + input.search, headers: { ...req.headers, host: `127.0.0.1:${hostPort}` } }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
  upstream.on('error', err => error(res, 502, `workspace proxy unavailable: ${err.code || err.message}`)); req.pipe(upstream);
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/workspace/')) { try { const owner = await identity(req); const match = /^\/workspace\/([^/]+)\//.exec(req.url); return match ? proxy(req, res, owner, match[1]) : error(res, 404, 'not found'); } catch (e) { return error(res, e.status || 500, e.message); } }
  return route(req, res);
});

if (require.main === module) server.listen(PORT, '127.0.0.1', async () => { await reconcile(); console.log(`workspace manager listening on 127.0.0.1:${server.address().port}`); });

module.exports = { allocation, dockerAllocation, loadState, ownerKey, publicWorkspace, server, state };
