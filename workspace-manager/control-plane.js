'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { DockerControlPlane, IMAGE } = require('./docker-control');

const HOST = process.env.CONTROL_PLANE_HOST || '127.0.0.1';
const PORT = Number(process.env.CONTROL_PLANE_PORT || 5192);
const SERVICE_ID = process.env.CONTROL_PLANE_SERVICE_ID || 'workspace-manager';
const SERVICE_SECRET = process.env.CONTROL_PLANE_SERVICE_SECRET;
const MAX_CLOCK_SKEW_MS = 30_000;
const seenNonces = new Map();
const control = new DockerControlPlane();

function json(res, status, value) { const data = JSON.stringify(value); res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }); res.end(data); }
function fail(res, status, error) { return json(res, status, { error }); }
async function body(req) { let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 128 * 1024) throw new Error('request too large'); } return raw ? JSON.parse(raw) : {}; }
function validWorkspace(value) { return value && /^[0-9a-f-]{36}$/.test(value.id) && Number.isInteger(Number(value.owner_user_id)) && Number.isInteger(Number(value.organization_id)); }
function authenticate(req, raw) {
  if (!SERVICE_SECRET || req.headers['x-service-id'] !== SERVICE_ID) return false;
  const timestamp = Number(req.headers['x-request-timestamp']); const nonce = req.headers['x-request-nonce']; const signature = req.headers['x-request-signature'];
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  if (seenNonces.has(nonce)) return false;
  const expected = crypto.createHmac('sha256', SERVICE_SECRET).update(`${timestamp}.${nonce}.${raw}`).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;
  seenNonces.set(nonce, Date.now() + MAX_CLOCK_SKEW_MS); return true;
}
setInterval(() => { const now = Date.now(); for (const [nonce, expiry] of seenNonces) if (expiry < now) seenNonces.delete(nonce); }, MAX_CLOCK_SKEW_MS).unref();

const operations = {
  'image-architecture': async () => ({ architecture: (await control.imageArchitecture()) || null }),
  inspect: async ({ record }) => control.inspectContainer(record),
  'create-volume': async ({ record }) => control.createVolume(record),
  'create-network': async ({ record }) => control.createNetwork(record),
  'create-container': async ({ record, token, hostPort }) => { if (!Number.isInteger(hostPort) || hostPort < 1024 || hostPort > 65535 || typeof token !== 'string' || token.length < 32) throw new Error('invalid runtime parameters'); return control.createContainer(record, { token, hostPort }); },
  start: async ({ record }) => control.start(record),
  stop: async ({ record }) => control.stop(record),
  update: async ({ record, allocation }) => control.update(record, allocation),
  remove: async ({ record }) => control.remove(record),
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') return json(res, 200, { ok: true, service: SERVICE_ID });
  if (req.method !== 'POST') return fail(res, 404, 'not found');
  const match = /^\/v1\/workspaces\/([0-9a-f-]{36})\/([a-z-]+)$/.exec(req.url);
  if (!match || !operations[match[2]]) return fail(res, 404, 'not found');
  let raw; try { raw = await (async () => { let value = ''; for await (const chunk of req) { value += chunk; if (value.length > 128 * 1024) throw new Error('request too large'); } return value; })(); } catch { return fail(res, 400, 'invalid request'); }
  if (!authenticate(req, raw)) { console.log(JSON.stringify({ actor_service: req.headers['x-service-id'] || 'unknown', operation: match[2], correlation_id: req.headers['x-correlation-id'] || null, outcome: 'denied', reason: 'service authentication required' })); return fail(res, 401, 'service authentication required'); }
  let input; try { input = JSON.parse(raw); } catch { return fail(res, 400, 'invalid JSON'); }
  if (match[2] !== 'image-architecture' && (input.record?.id !== match[1] || !validWorkspace(input.record))) return fail(res, 403, 'invalid managed workspace');
  try { const result = await operations[match[2]](input); console.log(JSON.stringify({ actor_service: SERVICE_ID, owner_user_id: input.record?.owner_user_id || null, organization_id: input.record?.organization_id || null, workspace_id: input.record?.id || null, operation: match[2], correlation_id: req.headers['x-correlation-id'] || null, outcome: 'success' })); return json(res, result?.status ?? 200, result?.body ?? result); } catch (error) { console.log(JSON.stringify({ actor_service: SERVICE_ID, owner_user_id: input.record?.owner_user_id || null, organization_id: input.record?.organization_id || null, workspace_id: input.record?.id || null, operation: match[2], correlation_id: req.headers['x-correlation-id'] || null, outcome: 'failure', reason: error.message === 'managed Docker resource ownership mismatch' ? error.message : 'control-plane operation failed' })); return fail(res, 409, error.message === 'managed Docker resource ownership mismatch' ? error.message : 'control-plane operation failed'); }
});

if (require.main === module) server.listen(PORT, HOST, () => console.log(`control plane listening on ${HOST}:${PORT}`));
module.exports = { server, authenticate, operations, IMAGE };
