'use strict';

const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { DockerControlPlane } = require('./docker-control');
const { ControlPlaneClient } = require('./control-plane-client');

const PORT = Number(process.env.PORT || 5191);
const LISTEN_HOST = process.env.LISTEN_HOST || '127.0.0.1';
const DB_PATH = process.env.WORKSPACE_DB_PATH || path.join(process.cwd(), 'workspaces.json');
const IAM_URL = process.env.IAM_URL || 'http://auth-service:8001';
const UPSTREAM_HOST = process.env.WORKSPACE_UPSTREAM_HOST || '127.0.0.1';
const MAX_CPU = Number(process.env.WORKSPACE_MAX_CPU || 8);
const MAX_MEMORY = Number(process.env.WORKSPACE_MAX_MEMORY_BYTES || 8 * 1024 ** 3);
const SESSION_TTL_MS = 15 * 60 * 1000;

const state = loadState();
const control = process.env.CONTROL_PLANE_URL ? new ControlPlaneClient() : new DockerControlPlane();
let writeChain = Promise.resolve();
const workspaceLocks = new Map();

function withWorkspaceLock(id, operation) {
  const previous = workspaceLocks.get(id) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  const queued = previous.then(() => current);
  workspaceLocks.set(id, queued);
  return previous.then(operation).finally(() => { release(); if (workspaceLocks.get(id) === queued) workspaceLocks.delete(id); });
}

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

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); });
  });
}

async function waitForWorkspace(port, token, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://${UPSTREAM_HOST}:${port}/lab?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(2000) });
      if (response.status < 500) { response.body?.cancel(); return; }
      response.body?.cancel();
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('workspace endpoint did not become ready');
}

async function inspectRuntime(workspace) {
  return control.inspectContainer(workspace);
}

async function createRuntime(workspace) {
  await control.createVolume(workspace);
  await control.createNetwork(workspace);
  const token = crypto.randomBytes(32).toString('base64url');
  const hostPort = await freePort();
  await control.createContainer(workspace, { token, hostPort }); workspace.jupyter_token = token;
  const started = await control.start(workspace);
  if (![204, 304].includes(started.status)) throw new Error('workspace container start failed');
  await waitForWorkspace(hostPort, token);
}

async function removeRuntime(workspace, options = {}) {
  if (workspace.runtime_id) await control.remove(workspace, options);
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
    catch (e) { await removeRuntime(workspace).catch(() => {}); workspace.state = 'failed'; workspace.state_reason = e.message; workspace.updated_at = new Date().toISOString(); await persist(); return error(res, 502, e.message); }
    }
    if (parts[0] !== 'api' || parts[1] !== 'workspaces' || !workspaceId(parts[2])) return error(res, 404, 'not found');
    const workspace = state.workspaces[parts[2]];
    if (!workspace || workspace.deleted_at || !ownerMatches(workspace, owner)) return error(res, 404, 'workspace not found');
    const mutating = req.method === 'PATCH' || req.method === 'DELETE' || (req.method === 'POST' && ['start', 'stop', 'sessions'].includes(parts[3]));
    if (mutating && !req.workspaceLockHeld) { req.workspaceLockHeld = true; return withWorkspaceLock(workspace.id, () => route(req, res)); }
    if (parts.length === 3 && req.method === 'GET') return json(res, 200, publicWorkspace(workspace));
    if (parts.length === 3 && req.method === 'PATCH') {
      if (workspace.state === 'running') return error(res, 409, 'Stop this workspace to change its CPU or memory allocation.');
      const input = await body(req); workspace.allocation = allocation(input.resources); const updated = await control.update(workspace, workspace.allocation);
      if (updated.status < 200 || updated.status >= 300) return error(res, 502, 'workspace resource update failed');
      workspace.updated_at = new Date().toISOString(); await persist(); return json(res, 200, publicWorkspace(workspace));
    }
    if (parts.length === 3 && req.method === 'DELETE') { const input = await body(req); if (input.purge_data !== undefined && input.purge_data !== true) return error(res, 400, 'purge_data must be true when provided'); await removeRuntime(workspace, { purgeData: input.purge_data === true }); workspace.deleted_at = new Date().toISOString(); workspace.state = 'deleted'; workspace.data_retained = input.purge_data !== true; await persist(); return json(res, 200, { deleted: true, workspace_id: workspace.id, data_retained: workspace.data_retained }); }
    if (parts.length === 4 && parts[3] === 'start' && req.method === 'POST') { const result = await control.start(workspace); if (![204, 304].includes(result.status)) return error(res, 502, 'workspace start failed'); await waitForWorkspace(workspace.host_port, workspace.jupyter_token); workspace.state = 'running'; workspace.updated_at = new Date().toISOString(); await persist(); return json(res, 200, publicWorkspace(workspace)); }
    if (parts.length === 4 && parts[3] === 'stop' && req.method === 'POST') { const result = await control.stop(workspace); if (![204, 304].includes(result.status)) return error(res, 502, 'workspace stop failed'); workspace.state = 'stopped'; workspace.updated_at = new Date().toISOString(); await persist(); return json(res, 200, publicWorkspace(workspace)); }
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
    try { upstreamResponse = await fetch(`http://${UPSTREAM_HOST}:${hostPort}${upstreamPath}${input.search}`, { headers: { ...(req.headers.accept ? { accept: req.headers.accept } : {}) }, signal: AbortSignal.timeout(30000) }); }
    catch { return error(res, 502, 'workspace proxy unavailable'); }
    const responseHeaders = {}; for (const [key, value] of upstreamResponse.headers) responseHeaders[key] = value;
    res.writeHead(upstreamResponse.status, responseHeaders); if (req.method === 'HEAD' || !upstreamResponse.body) return res.end();
    return Readable.fromWeb(upstreamResponse.body).pipe(res);
  }
  const upstream = http.request({ hostname: UPSTREAM_HOST, port: hostPort, method: req.method, path: upstreamPath + input.search,
    headers: { host: `${UPSTREAM_HOST}:${hostPort}`, connection: 'close', ...(req.headers.accept ? { accept: req.headers.accept } : {}) }, agent: false }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
  upstream.on('error', () => error(res, 502, 'workspace proxy unavailable'));
  if (req.method === 'GET' || req.method === 'HEAD') upstream.end(); else req.pipe(upstream);
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/workspace/')) { try { const owner = await identity(req); const match = /^\/workspace\/([^/]+)\//.exec(req.url); return match ? proxy(req, res, owner, match[1]) : error(res, 404, 'not found'); } catch (e) { return error(res, e.status || 500, e.message); } }
  return route(req, res);
});

function rejectUpgrade(socket, status) {
  socket.write(`HTTP/1.1 ${status} ${status === 404 ? 'Not Found' : 'Bad Gateway'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

server.on('upgrade', async (req, socket, head) => {
  try {
    const owner = await identity(req); const url = new URL(req.url, 'http://proxy'); const match = /^\/workspace\/([^/]+)(\/.*)?$/.exec(url.pathname);
    const workspace = match && state.workspaces[match[1]]; const raw = url.searchParams.get('session'); const session = raw && state.sessions[sessionDigest(raw)];
    if (!workspace || workspace.deleted_at || !ownerMatches(workspace, owner) || !session || session.workspace_id !== workspace.id || session.owner_key !== ownerKey(owner) || session.expires_at < Date.now()) return rejectUpgrade(socket, 404);
    if (workspace.state !== 'running') return rejectUpgrade(socket, 409);
    const inspected = await inspectRuntime(workspace); const hostPort = workspace.host_port || inspected.body?.NetworkSettings?.Ports?.['8888/tcp']?.[0]?.HostPort;
    if (!hostPort) return rejectUpgrade(socket, 502);
    url.searchParams.delete('session'); url.searchParams.set('token', workspace.jupyter_token);
    const prefix = `/workspace/${workspace.id}`; const pathToUpstream = (url.pathname.startsWith(prefix) ? (url.pathname.slice(prefix.length) || '/') : '/') + url.search;
    const upstream = net.connect({ host: UPSTREAM_HOST, port: hostPort });
    const fail = () => { if (!socket.destroyed) rejectUpgrade(socket, 502); };
    upstream.once('error', fail); upstream.once('connect', () => {
      const allowed = ['host', 'upgrade', 'connection', 'sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions'];
      const headers = allowed.filter(name => req.headers[name]).map(name => `${name}: ${name === 'host' ? `${UPSTREAM_HOST}:${hostPort}` : req.headers[name]}`).join('\r\n');
      upstream.write(`${req.method} ${pathToUpstream} HTTP/1.1\r\n${headers}\r\n\r\n`); if (head?.length) upstream.write(head); socket.pipe(upstream); upstream.pipe(socket);
    });
    socket.on('error', () => upstream.destroy()); upstream.on('close', () => socket.destroy());
  } catch { rejectUpgrade(socket, 404); }
});

if (require.main === module) server.listen(PORT, LISTEN_HOST, async () => { await reconcile(); console.log(`workspace manager listening on ${LISTEN_HOST}:${server.address().port}`); });

module.exports = { allocation, loadState, ownerKey, publicWorkspace, server, state };
